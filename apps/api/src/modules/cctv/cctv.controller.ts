import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const ident = z.number().int().positive();
const text = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(500).nullable().optional();
const recorderSchema = z
  .object({
    name: text,
    site: text,
    address: optionalText,
    monitorId: ident.nullable().optional(),
    capacityGb: z.number().nonnegative().nullable().optional(),
    freeGb: z.number().nonnegative().nullable().optional(),
    targetRetentionDays: z.number().int().nonnegative().nullable().optional(),
    actualRetentionDays: z.number().int().nonnegative().nullable().optional(),
    lastRecordingAt: z.string().datetime().optional(),
  })
  .strict()
  .refine(
    (d) => d.freeGb == null || d.capacityGb == null || d.freeGb <= d.capacityGb,
    "Kapasitas kosong tidak boleh melebihi kapasitas total.",
  );
const cameraSchema = z
  .object({
    name: text,
    site: text,
    zone: optionalText,
    assetId: ident.nullable().optional(),
    recorderId: ident.nullable().optional(),
    monitorId: ident.nullable().optional(),
    channel: ident.nullable().optional(),
    serial: optionalText,
    address: optionalText,
    coverageArea: optionalText,
    floorPage: ident.nullable().optional(),
    x: z.number().min(0).max(100).nullable().optional(),
    y: z.number().min(0).max(100).nullable().optional(),
    rotation: z.number().min(0).max(360).nullable().optional(),
    fieldOfView: z.number().positive().max(360).nullable().optional(),
    retentionDays: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();
const taskSchema = z
  .object({
    cameraId: ident,
    kind: z.enum(["PREVENTIVE", "REPAIR"]),
    task: text,
    dueAt: z.string().datetime(),
    ticketReference: optionalText,
  })
  .strict();
const resultSchema = z.object({ result: text }).strict();
const verificationSchema = z
  .object({
    cameraId: ident,
    actualLocation: text,
    serialMatch: z.boolean(),
    channelMatch: z.boolean(),
    installed: z.boolean(),
    note: optionalText,
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((e) => `${e.path.join(".") || "data"}: ${e.message}`)
        .join("; "),
    );
  return result.data;
}
export function access(user: RequestUser, manage = false) {
  const permissions = user.permissions || [];
  if (
    user.role === "admin" ||
    user.gaRole === "supervisor" ||
    (!manage && user.gaRole === "staff") ||
    permissions.includes("*") ||
    permissions.includes("cctv.*") ||
    permissions.includes("cctv.manage") ||
    (!manage && permissions.includes("cctv.read"))
  )
    return;
  throw new ForbiddenException("Izin CCTV diperlukan.");
}
const monitorSelect = {
  id: true,
  name: true,
  host: true,
  lastStatus: true,
  lastCheckedAt: true,
  deletedAt: true,
} as const;
@Controller("cctv")
export class CctvController {
  constructor(private readonly db: PrismaService) {}
  private async code(scope: string, prefix: string) {
    const sequence = await this.db.codeSequence.upsert({
      where: { scope },
      create: { scope, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${prefix}-${String(sequence.value).padStart(6, "0")}`;
  }
  @Get("asset-options")
  assetOptions(@Actor() actor: RequestUser, @Query("q") query?: string) {
    access(actor);
    const q = query?.trim().slice(0, 100);
    return this.db.asset.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { serialNumber: { contains: q, mode: "insensitive" } },
                { category: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    });
  }
  @Get("monitor-options")
  monitorOptions(@Actor() actor: RequestUser) {
    access(actor);
    return this.db.networkMonitor.findMany({
      where: { deletedAt: null },
      select: monitorSelect,
      orderBy: { name: "asc" },
    });
  }
  @Get("cameras") cameras(@Actor() actor: RequestUser) {
    access(actor);
    return this.db.cctvCamera.findMany({
      include: {
        asset: { select: { id: true, code: true, name: true } },
        recorder: { select: { id: true, code: true, name: true } },
        monitor: { select: monitorSelect },
      },
      orderBy: { name: "asc" },
    });
  }
  @Post("cameras") async camera(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(cameraSchema, body);
    await this.validateReferences(d);
    if (d.channel && !d.recorderId)
      throw new BadRequestException("Channel membutuhkan NVR/DVR.");
    return this.db.cctvCamera.create({
      data: { ...d, code: await this.code("cctv-camera", "CAM") },
    });
  }
  @Patch("cameras/:id") async updateCamera(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(cameraSchema, body);
    await this.validateReferences(d);
    if (d.channel && !d.recorderId)
      throw new BadRequestException("Channel membutuhkan NVR/DVR.");
    return this.db.cctvCamera.update({ where: { id }, data: d });
  }
  @Post("cameras/:id/status") async cameraStatus(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(
      z
        .object({ status: z.enum(["COMMISSIONED", "ACTIVE", "INACTIVE"]) })
        .strict(),
      body,
    );
    const current = await this.db.cctvCamera.findUniqueOrThrow({
      where: { id },
    });
    const allowed: Record<string, string[]> = {
      DRAFT: ["COMMISSIONED"],
      COMMISSIONED: ["ACTIVE", "INACTIVE"],
      ACTIVE: ["INACTIVE"],
      INACTIVE: ["ACTIVE"],
    };
    if (!allowed[current.status]?.includes(d.status))
      throw new ConflictException("Perubahan status kamera tidak valid.");
    const result = await this.db.cctvCamera.updateMany({
      where: { id, status: current.status },
      data: { status: d.status },
    });
    if (!result.count)
      throw new ConflictException("Status telah berubah. Muat ulang data.");
    return { status: d.status };
  }
  @Get("recorders") recorders(@Actor() actor: RequestUser) {
    access(actor);
    return this.db.cctvRecorder.findMany({
      include: {
        monitor: { select: monitorSelect },
        _count: { select: { cameras: true } },
      },
      orderBy: { name: "asc" },
    });
  }
  @Post("recorders") async recorder(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(recorderSchema, body);
    await this.validateReferences(d);
    return this.db.cctvRecorder.create({
      data: {
        ...d,
        lastRecordingAt: d.lastRecordingAt
          ? new Date(d.lastRecordingAt)
          : undefined,
        storageCheckedAt: [
          d.capacityGb,
          d.freeGb,
          d.targetRetentionDays,
          d.actualRetentionDays,
          d.lastRecordingAt,
        ].some((value) => value != null)
          ? new Date()
          : null,
        code: await this.code("cctv-recorder", "NVR"),
      },
    });
  }
  @Patch("recorders/:id") async updateRecorder(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(recorderSchema, body);
    await this.validateReferences(d);
    return this.db.cctvRecorder.update({
      where: { id },
      data: {
        ...d,
        lastRecordingAt: d.lastRecordingAt
          ? new Date(d.lastRecordingAt)
          : undefined,
        storageCheckedAt: new Date(),
      },
    });
  }
  @Get("maintenance") maintenance(@Actor() actor: RequestUser) {
    access(actor);
    return this.db.cctvMaintenance.findMany({
      include: { camera: { select: { id: true, code: true, name: true } } },
      orderBy: { dueAt: "asc" },
    });
  }
  @Post("maintenance") async createTask(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(taskSchema, body);
    await this.db.cctvCamera.findUniqueOrThrow({ where: { id: d.cameraId } });
    return this.db.cctvMaintenance.create({
      data: {
        ...d,
        dueAt: new Date(d.dueAt),
        code: await this.code("cctv-maintenance", "CMT"),
        createdById: actor.id,
      },
    });
  }
  @Post("maintenance/:id/complete") async completeTask(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(resultSchema, body);
    const result = await this.db.cctvMaintenance.updateMany({
      where: { id, status: "PLANNED" },
      data: {
        status: "INSPECTED",
        result: d.result,
        completedById: actor.id,
        completedAt: new Date(),
      },
    });
    if (!result.count)
      throw new ConflictException(
        "Pekerjaan tidak ditemukan atau sudah diperiksa.",
      );
    return { status: "INSPECTED" };
  }
  @Post("maintenance/:id/verify") async verifyTask(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    access(actor, true);
    const result = await this.db.cctvMaintenance.updateMany({
      where: { id, status: "INSPECTED", completedById: { not: actor.id } },
      data: {
        status: "VERIFIED",
        verifiedById: actor.id,
        verifiedAt: new Date(),
      },
    });
    if (!result.count)
      throw new ConflictException(
        "Pekerjaan harus diperiksa dan diverifikasi oleh pengguna lain.",
      );
    return { status: "VERIFIED" };
  }
  @Get("verifications") verifications(@Actor() actor: RequestUser) {
    access(actor);
    return this.db.cctvVerification.findMany({
      include: { camera: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  @Post("verifications") async verification(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    access(actor, true);
    const d = parse(verificationSchema, body);
    await this.db.cctvCamera.findUniqueOrThrow({ where: { id: d.cameraId } });
    return this.db.cctvVerification.create({
      data: {
        ...d,
        code: await this.code("cctv-verification", "CVF"),
        verifiedById: actor.id,
      },
    });
  }
  private async validateReferences(d: {
    assetId?: number | null;
    recorderId?: number | null;
    monitorId?: number | null;
  }) {
    if (
      d.assetId &&
      !(await this.db.asset.findFirst({
        where: { id: d.assetId, deletedAt: null },
      }))
    )
      throw new BadRequestException("Aset tidak ditemukan.");
    if (
      d.recorderId &&
      !(await this.db.cctvRecorder.findUnique({ where: { id: d.recorderId } }))
    )
      throw new BadRequestException("NVR tidak ditemukan.");
    if (
      d.monitorId &&
      !(await this.db.networkMonitor.findFirst({
        where: { id: d.monitorId, deletedAt: null },
      }))
    )
      throw new BadRequestException("Monitor tidak ditemukan.");
  }
}
