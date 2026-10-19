import * as snmp from "net-snmp";
import { classifyVlan } from "./monitoring-overview";

type Values = Record<string, snmp.VarbindValue>;
type RecordValue = Record<string, unknown>;
export class SnmpDataError extends Error {}
const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const str = (value: unknown) =>
  Buffer.isBuffer(value)
    ? value.toString("utf8").trim()
    : String(value ?? "").trim();
const numeric = (value: unknown): number | null => {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n)
    ? null
    : n;
};
function counter(value: unknown): bigint | null {
  try {
    if (Buffer.isBuffer(value))
      return value.length ? BigInt(`0x${value.toString("hex")}`) : null;
    if (
      typeof value === "number" &&
      (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value))
    )
      return null;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    )
      return null;
    const result = BigInt(value);
    return result >= 0n ? result : null;
  } catch {
    return null;
  }
}
export function counterRate(
  current: bigint | null,
  previous: bigint | null,
  seconds: number,
  bits: 32 | 64,
): number | null {
  if (current === null || previous === null || seconds <= 0 || seconds > 180)
    return null;
  const max = 1n << BigInt(bits);
  if (current >= max || previous >= max) return null;
  let diff = current - previous;
  if (diff < 0n) {
    if (bits !== 32 || previous < (max * 3n) / 4n || current > max / 4n)
      return null;
    diff = max - previous + current;
  }
  const rate = (Number(diff) * 8) / seconds;
  return Number.isFinite(rate) ? rate : null;
}
function walk(session: snmp.Session, oid: string): Promise<Values> {
  return new Promise((resolve, reject) => {
    const values: Values = {};
    session.subtree(
      oid,
      10,
      (items) => {
        for (const item of items) {
          if (snmp.isVarbindError(item)) continue;
          const index = item.oid.slice(oid.length + 1);
          if (/^\d+$/.test(index)) values[index] = item.value;
        }
        if (Object.keys(values).length > 4096) return true;
      },
      (error) => (error ? reject(error) : resolve(values)),
    );
  });
}
function getUptime(session: snmp.Session): Promise<number> {
  return new Promise((resolve, reject) =>
    session.get(["1.3.6.1.2.1.1.3.0"], (error, values) => {
      const item = values?.[0];
      if (
        error ||
        !item ||
        snmp.isVarbindError(item) ||
        numeric(item.value) === null
      )
        reject(error || new Error("SNMP uptime unavailable"));
      else resolve(Number(item.value));
    }),
  );
}
const oids = {
  descr: "1.3.6.1.2.1.2.2.1.2",
  type: "1.3.6.1.2.1.2.2.1.3",
  oper: "1.3.6.1.2.1.2.2.1.8",
  name: "1.3.6.1.2.1.31.1.1.1.1",
  alias: "1.3.6.1.2.1.31.1.1.1.18",
  in64: "1.3.6.1.2.1.31.1.1.1.6",
  out64: "1.3.6.1.2.1.31.1.1.1.10",
  in32: "1.3.6.1.2.1.2.2.1.10",
  out32: "1.3.6.1.2.1.2.2.1.16",
  ciscoTemperature: "1.3.6.1.4.1.9.9.13.1.3.1.3",
  juniperTemperature: "1.3.6.1.4.1.2636.3.1.13.1.7",
  entitySensorType: "1.3.6.1.2.1.99.1.1.1.1",
  entitySensorScale: "1.3.6.1.2.1.99.1.1.1.2",
  entitySensorValue: "1.3.6.1.2.1.99.1.1.1.4",
};
export async function readSnmp(
  monitor: {
    host: string;
    snmpPort: number;
    timeoutMs: number;
    deviceType: string;
  },
  community: string,
  oldSnapshot: unknown,
) {
  const session = snmp.createSession(monitor.host, community, {
    port: monitor.snmpPort,
    version: snmp.Version2c,
    timeout: Math.max(1000, Math.min(5000, monitor.timeoutMs)),
    retries: 1,
  });
  session.on("error", () => {});
  try {
    const uptime = await getUptime(session);
    const keys = [
      "descr",
      "type",
      "oper",
      "name",
      "alias",
      "in64",
      "out64",
      "ciscoTemperature",
      "juniperTemperature",
      "entitySensorType",
      "entitySensorScale",
      "entitySensorValue",
    ] as (keyof typeof oids)[];
    const results = await Promise.allSettled(
      keys.map((key) => walk(session, oids[key])),
    );
    const tables = Object.fromEntries(
      keys.map((key, i) => [
        key,
        results[i].status === "fulfilled"
          ? (results[i] as PromiseFulfilledResult<Values>).value
          : {},
      ]),
    ) as Record<keyof typeof oids, Values>;
    tables.in32 = {};
    tables.out32 = {};
    const interfaceCount = Math.max(
      Object.keys(tables.descr).length,
      Object.keys(tables.name).length,
    );
    if (
      Object.keys(tables.in64).length < interfaceCount ||
      Object.keys(tables.out64).length < interfaceCount
    ) {
      const fallback = await Promise.allSettled([
        walk(session, oids.in32),
        walk(session, oids.out32),
      ]);
      if (fallback[0].status === "fulfilled") tables.in32 = fallback[0].value;
      if (fallback[1].status === "fulfilled") tables.out32 = fallback[1].value;
    }
    if (!Object.keys(tables.descr).length && !Object.keys(tables.name).length)
      throw new SnmpDataError("SNMP interface data unavailable");
    if (
      (!Object.keys(tables.in64).length && !Object.keys(tables.in32).length) ||
      (!Object.keys(tables.out64).length && !Object.keys(tables.out32).length)
    )
      throw new SnmpDataError("SNMP counter data unavailable");
    const snapshot = object(oldSnapshot);
    const previous = object(snapshot.liveCounters);
    const oldCounters = object(previous.interfaces);
    const now = new Date();
    const seconds =
      (now.getTime() - Date.parse(str(previous.checkedAt))) / 1000;
    const valid =
      numeric(previous.uptime) !== null &&
      uptime >= Number(previous.uptime) &&
      Number.isFinite(seconds);
    const oldPorts = new Map(
      (Array.isArray(snapshot.ports) ? snapshot.ports : []).map((p) => [
        String(object(p).index),
        object(p),
      ]),
    );
    const indexes = [
      ...new Set([...Object.keys(tables.descr), ...Object.keys(tables.name)]),
    ];
    const counters: RecordValue = {};
    const ports = indexes.map((index) => {
      const old = oldPorts.get(index) || {};
      const label =
        str(tables.name[index]) || str(tables.descr[index]) || str(old.label);
      const hasAlias = Object.hasOwn(tables.alias, index);
      const alias = hasAlias ? str(tables.alias[index]) : str(old.alias);
      const kind = numeric(tables.type[index]);
      const isPhysical =
        typeof old.is_physical === "boolean"
          ? old.is_physical
          : kind === 6 || kind === 117;
      const isManagement =
        typeof old.is_management === "boolean"
          ? old.is_management
          : /^(mgmt|management|me\d)/i.test(label);
      const isAggregate =
        typeof old.is_aggregate === "boolean"
          ? old.is_aggregate
          : kind === 161 || /^(port-channel|po\d|ae\d)/i.test(label);
      const isUplink =
        !hasAlias && typeof old.is_uplink === "boolean"
          ? old.is_uplink
          : /uplink|trunk|peer|core/i.test(alias);
      const hiIn = counter(tables.in64[index]);
      const hiOut = counter(tables.out64[index]);
      const bits = hiIn !== null && hiOut !== null ? 64 : 32;
      const inCounter = bits === 64 ? hiIn : counter(tables.in32[index]);
      const outCounter = bits === 64 ? hiOut : counter(tables.out32[index]);
      const last = object(oldCounters[index]);
      const same = valid && numeric(last.bits) === bits;
      const inBps = same
        ? counterRate(inCounter, counter(last.in), seconds, bits)
        : null;
      const outBps = same
        ? counterRate(outCounter, counter(last.out), seconds, bits)
        : null;
      counters[index] = {
        in: inCounter?.toString() ?? null,
        out: outCounter?.toString() ?? null,
        bits,
      };
      return {
        ...old,
        index: Number(index),
        label,
        alias,
        is_physical: isPhysical,
        is_management: isManagement,
        is_aggregate: isAggregate,
        is_uplink: isUplink,
        oper_state:
          numeric(tables.oper[index]) === 1
            ? "up"
            : numeric(tables.oper[index]) === 2
              ? "down"
              : "unknown",
        counter_in_octets: inCounter?.toString() ?? null,
        counter_out_octets: outCounter?.toString() ?? null,
        in_bps: inBps,
        out_bps: outBps,
      };
    });
    const physical = ports.filter(
      (p) => p.is_physical && !p.is_management && !p.is_aggregate,
    );
    const sum = (values: (number | null)[]) => {
      const present = values.filter((v): v is number => v !== null);
      return present.length ? present.reduce((a, b) => a + b, 0) : null;
    };
    const inBps = sum(physical.map((p) => p.in_bps));
    const outBps = sum(physical.map((p) => p.out_bps));
    const vlans = [1, 40, 50, 70, 80].map((id) => {
      const members = physical
        .map((p) => ({ port: p, vlan: classifyVlan(p.label, p.alias) }))
        .filter(
          ({ port, vlan }) =>
            (!port.is_uplink && vlan.id === id) ||
            (vlan.id === id && vlan.estimated),
        );
      const incoming = sum(members.map(({ port }) => port.in_bps));
      const outgoing = sum(members.map(({ port }) => port.out_bps));
      return {
        id,
        in_bps: incoming,
        out_bps: outgoing,
        interface_count: members.length,
        estimated: members.some((x) => x.vlan.estimated),
        available: incoming !== null || outgoing !== null,
      };
    });
    const directTemperatures = [tables.ciscoTemperature, tables.juniperTemperature]
      .flatMap((table) => Object.values(table))
      .map(numeric)
      .filter((v): v is number => v !== null && v > -50 && v < 150);
    const entityTemperatures = Object.entries(tables.entitySensorValue || {})
      .map(([index, value]) => {
        if (numeric(tables.entitySensorType?.[index]) !== 8) return null;
        const raw = numeric(value);
        const scale = numeric(tables.entitySensorScale?.[index]);
        if (raw === null) return null;
        return raw * 10 ** ((scale ?? 9) - 9);
      })
      .filter((v): v is number => v !== null && v > -50 && v < 150);
    const temperatures = [...directTemperatures, ...entityTemperatures];
    const temperature = temperatures.length ? Math.max(...temperatures) : null;
    return {
      checkedAt: now,
      uptime,
      counters,
      ports,
      inBps,
      outBps,
      vlans,
      temperature,
    };
  } finally {
    session.close();
  }
}
