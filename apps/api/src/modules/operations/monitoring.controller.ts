import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { AdminOnly } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import { PrismaService } from "../../database/prisma.service";
import { MonitorDto } from "./operations.dto";
import { buildMonitoringOverview, buildTopUsers } from "./monitoring-overview";
import { MonitoringPollerService } from "./monitoring-poller.service";

const safe = {
  id: true,
  name: true,
  deviceType: true,
  host: true,
  location: true,
  timeoutMs: true,
  customPorts: true,
  notes: true,
  snmpEnabled: true,
  snmpVersion: true,
  snmpPort: true,
  httpEnabled: true,
  httpUrl: true,
  lastStatus: true,
  latencyMs: true,
  lastMessage: true,
  lastCheckedAt: true,
  snapshot: true,
  createdAt: true,
  updatedAt: true,
};
const positiveInteger = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
@Controller("monitors")
export class MonitoringController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly poller: MonitoringPollerService,
  ) {}
  @Get() list() {
    return this.db.networkMonitor.findMany({
      where: { deletedAt: null },
      select: safe,
      orderBy: { name: "asc" },
    });
  }
  @Get("summary") async summary() {
    const groups = await this.db.networkMonitor.groupBy({
      by: ["lastStatus"],
      where: { deletedAt: null },
      _count: true,
    });
    return {
      total: groups.reduce((n, g) => n + g._count, 0),
      statuses: groups,
    };
  }
  @Get("overview") async overview() {
    const monitors = await this.db.networkMonitor.findMany({
      where: { deletedAt: null },
      select: safe,
      orderBy: { name: "asc" },
    });
    return buildMonitoringOverview(monitors);
  }
  @Get("top-users") async allTopUsers(
    @Query("q") query?: string,
    @Query("vlan") vlan?: string,
    @Query("page") page?: string,
    @Query("perPage") perPage?: string,
  ) {
    const monitors = await this.db.networkMonitor.findMany({
      where: { deletedAt: null },
      select: safe,
      orderBy: { name: "asc" },
    });
    return buildTopUsers(monitors, {
      query: typeof query === "string" ? query.slice(0, 200) : undefined,
      vlan: positiveInteger(vlan),
      page: positiveInteger(page),
      perPage: positiveInteger(perPage),
    });
  }
  @Get(":id") detail(@Param("id", ParseIntPipe) id: number) {
    return this.db.networkMonitor.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: safe,
    });
  }
  @Get(":id/overview") async deviceOverview(
    @Param("id", ParseIntPipe) id: number,
  ) {
    const monitor = await this.db.networkMonitor.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: safe,
    });
    return buildMonitoringOverview([monitor]).devices[0];
  }
  @AdminOnly() @Post() create(@Body() dto: MonitorDto) {
    const { snmpCommunity, ...data } = dto;
    return this.db.networkMonitor.create({
      data: {
        ...data,
        customPorts: [...new Set(data.customPorts || [])].sort((a, b) => a - b),
        ...(snmpCommunity
          ? { snmpCommunityEncrypted: this.crypto.encrypt(snmpCommunity) }
          : {}),
      },
      select: safe,
    });
  }
  @AdminOnly() @Patch(":id") update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: MonitorDto,
  ) {
    const { snmpCommunity, ...data } = dto;
    return this.db.networkMonitor.update({
      where: { id },
      data: {
        ...data,
        ...(data.customPorts
          ? {
              customPorts: [...new Set(data.customPorts)].sort((a, b) => a - b),
            }
          : {}),
        ...(snmpCommunity
          ? { snmpCommunityEncrypted: this.crypto.encrypt(snmpCommunity) }
          : {}),
      },
      select: safe,
    });
  }
  @AdminOnly() @Delete(":id") remove(@Param("id", ParseIntPipe) id: number) {
    return this.db.networkMonitor.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: safe,
    });
  }
  @AdminOnly() @Post(":id/probes") async probe(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.poller.probeNow(id);
  }
  @Get(":id/history") history(@Param("id", ParseIntPipe) id: number) {
    return this.db.monitorSample.findMany({
      where: { monitorId: id },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
  }
  @Get(":id/events") events(@Param("id", ParseIntPipe) id: number) {
    return this.db.monitorEvent.findMany({
      where: { monitorId: id },
      orderBy: { startedAt: "desc" },
    });
  }
  @Get(":id/uptime") async uptime(@Param("id", ParseIntPipe) id: number) {
    const groups = await this.db.monitorSample.groupBy({
      by: ["status"],
      where: {
        monitorId: id,
        status: { in: ["online", "degraded", "offline"] },
      },
      _count: true,
    });
    const total = groups.reduce((n, g) => n + g._count, 0);
    const offline = groups.find((g) => g.status === "offline")?._count || 0;
    return {
      percent: total ? ((total - offline) / total) * 100 : null,
      sampleCount: total,
    };
  }
  @Get(":id/ports") async ports(@Param("id", ParseIntPipe) id: number) {
    const row = await this.db.networkMonitor.findUniqueOrThrow({
      where: { id },
      select: { snapshot: true },
    });
    return (row.snapshot as { ports?: unknown[] } | null)?.ports || [];
  }
  @Get(":id/sensors") async sensors(@Param("id", ParseIntPipe) id: number) {
    const row = await this.db.networkMonitor.findUniqueOrThrow({
      where: { id },
      select: { snapshot: true },
    });
    return (row.snapshot as { sensors?: unknown[] } | null)?.sensors || [];
  }
  @Get(":id/switch-details") detailCache(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.networkMonitor.findUniqueOrThrow({
      where: { id },
      select: { snapshot: true, lastCheckedAt: true },
    });
  }
  @Get(":id/top-users") async topUsers(@Param("id", ParseIntPipe) id: number) {
    const monitor = await this.db.networkMonitor.findFirstOrThrow({
      where: { id, deletedAt: null },
      select: safe,
    });
    return buildTopUsers([monitor]);
  }
}

@Controller("mobile/monitoring")
export class MobileMonitoringController extends MonitoringController {
  constructor(
    db: PrismaService,
    crypto: CryptoService,
    poller: MonitoringPollerService,
  ) {
    super(db, crypto, poller);
  }
}
