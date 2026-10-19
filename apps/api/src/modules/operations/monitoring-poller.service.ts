import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { NetworkMonitor, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CryptoService } from "../../common/crypto.service";
import { runMonitoringProbe } from "./monitoring-probe";
import { readSnmp, SnmpDataError } from "./monitoring-snmp";

const record = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

@Injectable()
export class MonitoringPollerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MonitoringPollerService.name);
  private running = false;
  private stopped = false;
  private pollTimer?: NodeJS.Timeout;
  private readonly active = new Set<number>();
  private readonly samples = new Map<number, number>();
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  onApplicationBootstrap() {
    this.schedule(1500);
  }
  onModuleDestroy() {
    this.stopped = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedule(await this.pollIntervalMs());
    }, delay);
  }
  private async pollIntervalMs() {
    const setting = await this.db.appSetting
      .findUnique({
        where: {
          group_key: { group: "monitoring", key: "traffic_poll_seconds" },
        },
        select: { value: true },
      })
      .catch(() => null);
    const seconds = Number(setting?.value || 15);
    return (
      (Number.isInteger(seconds) && seconds >= 10 && seconds <= 300
        ? seconds
        : 15) * 1000
    );
  }
  async poll() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.db.$transaction(
        async (lockTx) => {
          const [lock] = await lockTx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(1986412605) AS locked`;
          if (!lock?.locked || this.stopped) return;
          const monitors = await this.db.networkMonitor.findMany({
            where: { deletedAt: null },
            orderBy: { id: "asc" },
          });
          let index = 0;
          const worker = async () => {
            while (index < monitors.length && !this.stopped) {
              const monitor = monitors[index++];
              try {
                await this.run(monitor);
              } catch (error) {
                this.logger.warn(
                  `Pemeriksaan monitor ${monitor.id} gagal: ${error instanceof ConflictException ? "sedang berjalan" : "kesalahan pemeriksaan"}`,
                );
              }
            }
          };
          await Promise.all(
            Array.from({ length: Math.min(4, monitors.length) }, worker),
          );
        },
        { maxWait: 3000, timeout: 120000 },
      );
    } catch {
      this.logger.warn("Polling monitoring gagal; akan dicoba kembali.");
    } finally {
      this.running = false;
    }
  }
  async probeNow(id: number) {
    const monitor = await this.db.networkMonitor.findFirstOrThrow({
      where: { id, deletedAt: null },
    });
    return this.run(monitor);
  }
  private async run(monitor: NetworkMonitor) {
    if (this.active.has(monitor.id))
      throw new ConflictException("Pemeriksaan perangkat sedang berjalan.");
    this.active.add(monitor.id);
    try {
      const probeTask = runMonitoringProbe(
        monitor.host,
        monitor.deviceType,
        monitor.customPorts,
        monitor.timeoutMs,
      );
      const snmpTask =
        monitor.snmpEnabled &&
        monitor.snmpCommunityEncrypted &&
        (!monitor.snmpVersion || monitor.snmpVersion === "2c")
          ? Promise.resolve()
              .then(() =>
                readSnmp(
                  monitor,
                  this.crypto.decrypt(monitor.snmpCommunityEncrypted!),
                  monitor.snapshot,
                ),
              )
              .then((data) => ({ data, reachable: true }))
              .catch((error: unknown) => ({
                data: null,
                reachable: error instanceof SnmpDataError,
              }))
          : Promise.resolve({ data: null, reachable: false });
      const [probe, snmpResult] = await Promise.all([probeTask, snmpTask]);
      const snmp = snmpResult.data;
      const status =
        snmpResult.reachable && probe.status !== "online"
          ? "online"
          : probe.status;
      const message =
        snmpResult.reachable && probe.status !== "online"
          ? "SNMP merespons; ping atau layanan TCP tidak tersedia"
          : probe.message;
      return await this.db.$transaction(async (tx) => {
        const current = await tx.networkMonitor.findFirstOrThrow({
          where: { id: monitor.id, deletedAt: null },
        });
        if (
          current.host !== monitor.host ||
          current.updatedAt.getTime() !== monitor.updatedAt.getTime()
        ) {
          const { snmpCommunityEncrypted, ...safe } = current;
          return safe;
        }
        const snapshot = record(current.snapshot);
        const legacy = record(snapshot.legacy);
        const summary = record(snapshot.summary);
        const checkedAt = probe.checkedAt;
        const nextSnapshot: Record<string, unknown> = {
          ...snapshot,
          legacy: {
            ...legacy,
            ...(legacy.last_temperature_c == null &&
            summary.temperature_c != null
              ? {
                  last_temperature_c: summary.temperature_c,
                  last_temp_checked_at: snapshot.updated_at || null,
                }
              : {}),
            last_open_ports: probe.openPorts.join(","),
            last_check_at: checkedAt.toISOString(),
            ...(snmp
              ? {
                  last_snmp_at: snmp.checkedAt.toISOString(),
                  last_snmp_message:
                    snmp.inBps === null && snmp.outBps === null
                      ? "Menunggu sampel berikutnya untuk menghitung traffic"
                      : "Traffic interface fisik dari SNMP",
                  last_traffic_in_bps: snmp.inBps,
                  last_traffic_out_bps: snmp.outBps,
                  last_traffic_scope: "physical",
                  last_vlan_traffic_json: snmp.vlans,
                  last_vlan_traffic_at: snmp.checkedAt.toISOString(),
                  ...(snmp.temperature !== null
                    ? {
                        last_temperature_c: snmp.temperature,
                        last_temp_checked_at: snmp.checkedAt.toISOString(),
                      }
                    : {}),
                }
              : {}),
          },
          live: {
            checkedAt: checkedAt.toISOString(),
            snmpAttemptAt: checkedAt.toISOString(),
            snmpAvailable: Boolean(snmp),
            snmpReachable: snmpResult.reachable,
            snmpEnabled: monitor.snmpEnabled,
          },
          ...(snmp
            ? {
                updated_at: snmp.checkedAt.toISOString(),
                ports: snmp.ports,
                summary: {
                  ...summary,
                  traffic_in_bps_total: snmp.inBps,
                  traffic_out_bps_total: snmp.outBps,
                  vlan_traffic: snmp.vlans,
                  ...(snmp.temperature !== null
                    ? { temperature_c: snmp.temperature }
                    : {}),
                },
                liveCounters: {
                  checkedAt: snmp.checkedAt.toISOString(),
                  uptime: snmp.uptime,
                  interfaces: snmp.counters,
                },
              }
            : {}),
        };
        const updated = await tx.networkMonitor.update({
          where: { id: monitor.id },
          data: {
            lastStatus: status,
            latencyMs: probe.latencyMs,
            lastMessage: message,
            lastCheckedAt: checkedAt,
            snapshot: nextSnapshot as Prisma.InputJsonObject,
          },
        });
        const lastSample = this.samples.get(monitor.id) || 0;
        if (
          current.lastStatus !== status ||
          checkedAt.getTime() - lastSample >= 60000
        ) {
          await tx.monitorSample.create({
            data: {
              monitorId: monitor.id,
              status,
              latencyMs: probe.latencyMs,
              trafficInBps: snmp?.inBps ?? null,
              trafficOutBps: snmp?.outBps ?? null,
              temperature: snmp?.temperature ?? null,
              createdAt: checkedAt,
            },
          });
          this.samples.set(monitor.id, checkedAt.getTime());
        }
        if (current.lastStatus !== status) {
          await tx.monitorEvent.updateMany({
            where: { monitorId: monitor.id, endedAt: null },
            data: { endedAt: checkedAt },
          });
          await tx.monitorEvent.create({
            data: {
              monitorId: monitor.id,
              previousStatus: current.lastStatus,
              newStatus: status,
              message,
              startedAt: checkedAt,
            },
          });
        }
        const { snmpCommunityEncrypted, ...safe } = updated;
        return safe;
      });
    } finally {
      this.active.delete(monitor.id);
    }
  }
}
