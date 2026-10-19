import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { buildMonitoringOverview } from "./monitoring-overview";

const monitorSelect = {
  id: true,
  name: true,
  host: true,
  deviceType: true,
  location: true,
  timeoutMs: true,
  customPorts: true,
  snmpEnabled: true,
  lastStatus: true,
  latencyMs: true,
  lastMessage: true,
  lastCheckedAt: true,
  snapshot: true,
};

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly db: PrismaService) {}
  @Get("summary") async summary() {
    const [totalAssets, statuses, recentActivity, monitors] =
      await this.db.$transaction([
        this.db.asset.count({ where: { deletedAt: null } }),
        this.db.asset.groupBy({
          by: ["status"],
          where: { deletedAt: null },
          orderBy: { status: "asc" },
          _count: true,
        }),
        this.db.assetHistory.findMany({
          take: 6,
          orderBy: { createdAt: "desc" },
          include: { asset: { select: { code: true, name: true } } },
        }),
        this.db.networkMonitor.findMany({
          where: { deletedAt: null },
          select: monitorSelect,
          orderBy: { name: "asc" },
        }),
      ]);
    const network = buildMonitoringOverview(monitors);
    return {
      totalAssets,
      statuses,
      recentActivity,
      monitoring: network.summary,
      network,
    };
  }
}
