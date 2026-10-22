import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const templateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    areaId: z.number().int().positive(),
    assigneeId: z.number().int().positive(),
    tasks: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();
const access = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";
const supervisor = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const date = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new ConflictException("Tanggal tidak valid.");
  return parsed;
};
const localToday = () =>
  date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );

@Injectable()
export class GaScheduleService {
  constructor(private readonly db: PrismaService) {}

  @Cron("0 15 * * * *", { timeZone: "Asia/Jakarta" })
  async scheduledGeneration() {
    const templates = await this.db.gaCleaningTemplate.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (const template of templates) await this.generate(template.id);
  }

  async generate(id: number) {
    const template = await this.db.gaCleaningTemplate.findUniqueOrThrow({
      where: { id },
      include: { area: true },
    });
    if (
      !template.active ||
      !template.area.active ||
      template.area.status !== "ACTIVE"
    )
      return 0;
    const end = new Date(localToday().valueOf() + 7 * 86400000);
    if (template.endDate && template.endDate < end)
      end.setTime(template.endDate.valueOf());
    let cursor = template.generatedThrough
      ? new Date(template.generatedThrough.valueOf() + 86400000)
      : new Date(template.startDate);
    let generated = 0;
    let processed = 0;
    while (cursor <= end && processed < 370) {
      if (template.weekdays.includes(cursor.getUTCDay())) {
        try {
          await this.db.gaCleaningChecklist.create({
            data: {
              areaId: template.areaId,
              workDate: cursor,
              assigneeId: template.assigneeId,
              templateId: template.id,
              lines: {
                create: template.tasks.map((task, sortOrder) => ({
                  task,
                  sortOrder,
                })),
              },
            },
          });
          generated++;
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          )
            throw error;
        }
      }
      await this.db.gaCleaningTemplate.update({
        where: { id },
        data: { generatedThrough: cursor },
      });
      cursor = new Date(cursor.valueOf() + 86400000);
      processed++;
    }
    return generated;
  }
}

@Controller("ga/cleaning-schedules")
export class GaScheduleController {
  constructor(
    private readonly db: PrismaService,
    private readonly schedules: GaScheduleService,
  ) {}

  @Get()
  list(@Actor() actor: RequestUser) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaCleaningTemplate.findMany({
      where: supervisor(actor) ? {} : { assigneeId: actor.id },
      include: { area: { select: { name: true, code: true } } },
      orderBy: { id: "desc" },
    });
  }

  @Post()
  async create(@Actor() actor: RequestUser, @Body() body: unknown) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const result = templateSchema.safeParse(body);
    if (!result.success)
      throw new ConflictException(
        "Periksa nama, area, petugas, jadwal, dan tugas.",
      );
    const input = result.data;
    const startDate = date(input.startDate);
    const endDate = input.endDate ? date(input.endDate) : null;
    if (endDate && endDate < startDate)
      throw new ConflictException("Tanggal akhir harus setelah tanggal mulai.");
    if (startDate.valueOf() < localToday().valueOf() - 366 * 86400000)
      throw new ConflictException(
        "Tanggal mulai maksimal satu tahun ke belakang.",
      );
    const [area, worker, existing] = await Promise.all([
      this.db.gaArea.findFirst({
        where: { id: input.areaId, active: true, status: "ACTIVE" },
      }),
      this.db.user.findFirst({
        where: {
          id: input.assigneeId,
          deletedAt: null,
          OR: [{ gaRole: { in: ["staff", "supervisor"] } }, { role: "admin" }],
        },
      }),
      this.db.gaCleaningTemplate.findFirst({
        where: {
          areaId: input.areaId,
          assigneeId: input.assigneeId,
          active: true,
        },
      }),
    ]);
    if (!area || !worker)
      throw new ConflictException("Area aktif dan petugas GA harus tersedia.");
    if (existing)
      throw new ConflictException(
        "Jadwal aktif untuk area dan petugas ini sudah ada.",
      );
    const template = await this.db.gaCleaningTemplate.create({
      data: {
        ...input,
        weekdays: [...new Set(input.weekdays)],
        startDate,
        endDate,
        createdById: actor.id,
      },
    });
    await this.schedules.generate(template.id);
    return template;
  }

  @Patch(":id/active")
  async setActive(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const result = z.object({ active: z.boolean() }).strict().safeParse(body);
    if (!result.success) throw new ConflictException("Status tidak valid.");
    const template = await this.db.gaCleaningTemplate.findUniqueOrThrow({
      where: { id },
    });
    if (result.data.active) {
      const other = await this.db.gaCleaningTemplate.findFirst({
        where: {
          areaId: template.areaId,
          assigneeId: template.assigneeId,
          active: true,
          id: { not: id },
        },
      });
      if (other)
        throw new ConflictException(
          "Jadwal aktif untuk area dan petugas ini sudah ada.",
        );
    }
    const updated = await this.db.gaCleaningTemplate.update({
      where: { id },
      data: result.data,
    });
    await this.db.gaCleaningChecklist.updateMany({
      where: {
        templateId: id,
        workDate: { gte: localToday() },
        status: result.data.active ? "CANCELLED" : "DRAFT",
        lines: { every: { completed: false } },
      },
      data: { status: result.data.active ? "DRAFT" : "CANCELLED" },
    });
    if (updated.active) await this.schedules.generate(id);
    return updated;
  }

  @Get("weekly")
  async weekly(@Actor() actor: RequestUser, @Query("start") value?: string) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const start = value ? date(value) : localToday();
    const end = new Date(start.valueOf() + 7 * 86400000);
    const rows = await this.db.gaCleaningChecklist.findMany({
      where: {
        workDate: { gte: start, lt: end },
        ...(supervisor(actor) ? {} : { assigneeId: actor.id }),
      },
      include: { area: { select: { code: true, name: true } }, lines: true },
      orderBy: [{ workDate: "asc" }, { id: "asc" }],
    });
    const today = localToday();
    return {
      start: start.toISOString().slice(0, 10),
      end: new Date(end.valueOf() - 86400000).toISOString().slice(0, 10),
      total: rows.filter((x) => x.status !== "CANCELLED").length,
      verified: rows.filter((x) => x.status === "VERIFIED").length,
      overdue: rows.filter(
        (x) =>
          x.workDate < today && !["VERIFIED", "CANCELLED"].includes(x.status),
      ).length,
      records: rows,
    };
  }
}
