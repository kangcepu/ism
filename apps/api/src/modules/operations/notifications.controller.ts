import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async list() {
    const [events, settings] = await Promise.all([
      this.db.monitorEvent.findMany({
        where: { monitor: { deletedAt: null } },
        include: { monitor: { select: { id: true, name: true } } },
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      this.db.appSetting.findMany({
        where: { group: "alerts", key: { in: ["enabled", "threshold"] } },
      }),
    ]);
    const values = Object.fromEntries(
      settings.map((item) => [item.key, item.value]),
    );
    const threshold = Number(values.threshold);
    if (
      values.enabled !== "true" ||
      !values.threshold ||
      !Number.isFinite(threshold)
    )
      return events;
    const monitors = await this.db.networkMonitor.findMany({
      where: {
        deletedAt: null,
        samples: { some: { temperature: { gte: threshold } } },
      },
      select: {
        id: true,
        name: true,
        samples: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { temperature: true, createdAt: true },
        },
      },
    });
    const temperatures = monitors.flatMap((monitor) => {
      const sample = monitor.samples[0];
      if (
        !sample ||
        sample.temperature === null ||
        Number(sample.temperature) < threshold
      )
        return [];
      return [
        {
          id: `temperature-${monitor.id}`,
          newStatus: "Suhu tinggi",
          message: `Suhu terakhir ${sample.temperature}°C (batas ${threshold}°C)`,
          startedAt: sample.createdAt,
          monitor: { id: monitor.id, name: monitor.name },
        },
      ];
    });
    return [...events, ...temperatures]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20);
  }
}
