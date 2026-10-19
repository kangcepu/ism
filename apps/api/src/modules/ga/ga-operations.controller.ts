import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createReadStream, promises as fs } from "fs";
import { randomUUID } from "crypto";
import { join, resolve } from "path";
import { diskStorage } from "multer";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { CleaningDto, CleaningLineDto, OutdoorDto } from "./ga-operations.dto";

const canAccess = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";
const canSupervise = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const workDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const outdoorRoot = resolve(process.env.UPLOAD_ROOT || "uploads", "ga-outdoor");
const mediaExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

@Controller("ga")
export class GaOperationsController {
  constructor(private readonly db: PrismaService) {}

  private staffFilter(actor: RequestUser) {
    return canSupervise(actor) ? {} : { assigneeId: actor.id };
  }

  @Get("cleaning")
  async cleaning(@Actor() actor: RequestUser, @Query("date") value?: string) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaCleaningChecklist.findMany({
      where: {
        ...this.staffFilter(actor),
        ...(value ? { workDate: workDate(value) } : {}),
      },
      include: {
        area: { select: { code: true, name: true } },
        lines: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ workDate: "desc" }, { id: "desc" }],
    });
  }

  @Post("cleaning")
  async createCleaning(@Actor() actor: RequestUser, @Body() dto: CleaningDto) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const date = workDate(dto.workDate);
    const exists = await this.db.gaCleaningChecklist.findUnique({
      where: { areaId_workDate: { areaId: dto.areaId, workDate: date } },
    });
    if (exists)
      throw new ConflictException(
        "Checklist area pada tanggal tersebut sudah ada.",
      );
    const assigneeId = canSupervise(actor)
      ? (dto.assigneeId ?? actor.id)
      : actor.id;
    return this.db.gaCleaningChecklist.create({
      data: {
        areaId: dto.areaId,
        workDate: date,
        assigneeId,
        note: dto.note,
        lines: {
          create: dto.tasks
            .filter((task) => task.trim())
            .map((task, index) => ({ task: task.trim(), sortOrder: index })),
        },
      },
      include: { area: true, lines: true },
    });
  }

  @Patch("cleaning/lines/:id")
  async line(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CleaningLineDto,
  ) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const line = await this.db.gaCleaningLine.findUniqueOrThrow({
      where: { id },
      include: { checklist: { select: { assigneeId: true, status: true } } },
    });
    if (!canSupervise(actor) && line.checklist.assigneeId !== actor.id) {
      throw new ForbiddenException("Checklist ini bukan penugasan Anda.");
    }
    if (!["DRAFT", "REWORK"].includes(line.checklist.status)) {
      throw new ConflictException("Checklist yang dikirim tidak dapat diubah.");
    }
    return this.db.gaCleaningLine.update({
      where: { id },
      data: {
        completed: dto.completed,
        completedAt: dto.completed ? new Date() : null,
        note: dto.note,
      },
    });
  }

  @Post("cleaning/:id/submit")
  async submitCleaning(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const checklist = await this.db.gaCleaningChecklist.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });
    if (!canSupervise(actor) && checklist.assigneeId !== actor.id) {
      throw new ForbiddenException("Checklist ini bukan penugasan Anda.");
    }
    if (
      !checklist.lines.length ||
      checklist.lines.some((line) => !line.completed)
    ) {
      throw new ConflictException("Semua tugas harus selesai sebelum dikirim.");
    }
    return this.db.gaCleaningChecklist.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  }

  @Post("cleaning/:id/verify")
  async verifyCleaning(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { accepted?: boolean },
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.db.gaCleaningChecklist.update({
      where: { id },
      data: body.accepted
        ? { status: "VERIFIED", verifiedById: actor.id, verifiedAt: new Date() }
        : { status: "REWORK", verifiedById: null, verifiedAt: null },
    });
  }

  @Get("outdoor")
  async outdoor(@Actor() actor: RequestUser, @Query("date") value?: string) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaOutdoorInspection.findMany({
      where: {
        ...(canSupervise(actor) ? {} : { inspectorId: actor.id }),
        ...(value ? { inspectedAt: workDate(value) } : {}),
      },
      include: {
        area: { select: { code: true, name: true } },
        media: {
          select: {
            id: true,
            type: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ inspectedAt: "desc" }, { id: "desc" }],
    });
  }

  @Post("outdoor")
  async createOutdoor(@Actor() actor: RequestUser, @Body() dto: OutdoorDto) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaOutdoorInspection.create({
      data: {
        ...dto,
        inspectorId: canSupervise(actor)
          ? (dto.inspectorId ?? actor.id)
          : actor.id,
        inspectedAt: workDate(dto.inspectedAt),
      },
      include: { area: true },
    });
  }

  @Post("outdoor/:id/submit")
  async submitOutdoor(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const inspection = await this.db.gaOutdoorInspection.findUniqueOrThrow({
      where: { id },
    });
    if (!canSupervise(actor) && inspection.inspectorId !== actor.id) {
      throw new ForbiddenException("Inspeksi ini bukan penugasan Anda.");
    }
    return this.db.gaOutdoorInspection.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  }

  @Post("outdoor/:id/verify")
  async verifyOutdoor(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { accepted?: boolean },
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.db.gaOutdoorInspection.update({
      where: { id },
      data: body.accepted
        ? { status: "VERIFIED", verifiedById: actor.id, verifiedAt: new Date() }
        : { status: "REWORK", verifiedById: null, verifiedAt: null },
    });
  }
  @Post("outdoor/:id/media")
  @UseInterceptors(
    FilesInterceptor("files", 8, {
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_, file, callback) =>
        callback(
          mediaExtensions[file.mimetype]
            ? null
            : new ConflictException("Format foto atau video tidak didukung."),
          Boolean(mediaExtensions[file.mimetype]),
        ),
      storage: diskStorage({
        destination: async (_, __, callback) => {
          await fs.mkdir(outdoorRoot, { recursive: true });
          callback(null, outdoorRoot);
        },
        filename: (_, file, callback) =>
          callback(null, `${randomUUID()}${mediaExtensions[file.mimetype]}`),
      }),
    }),
  )
  async uploadOutdoorMedia(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const inspection = await this.db.gaOutdoorInspection.findUniqueOrThrow({
      where: { id },
    });
    if (!canSupervise(actor) && inspection.inspectorId !== actor.id) {
      throw new ForbiddenException("Inspeksi ini bukan penugasan Anda.");
    }
    if (!files.length) throw new ConflictException("Pilih minimal satu file.");
    return this.db.$transaction(async (tx) =>
      Promise.all(
        files.map((file) =>
          tx.gaOutdoorMedia.create({
            data: {
              inspectionId: id,
              type: file.mimetype.startsWith("video/") ? "VIDEO" : "PHOTO",
              internalName: file.filename,
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              createdById: actor.id,
            },
          }),
        ),
      ),
    );
  }

  @Get("outdoor/media/:id/file")
  async outdoorMediaFile(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const media = await this.db.gaOutdoorMedia.findUnique({
      where: { id },
      include: { inspection: { select: { inspectorId: true } } },
    });
    if (!media) throw new NotFoundException("Lampiran tidak ditemukan.");
    if (!canSupervise(actor) && media.inspection.inspectorId !== actor.id) {
      throw new ForbiddenException("Lampiran ini bukan milik Anda.");
    }
    const filePath = join(outdoorRoot, media.internalName);
    await fs.access(filePath).catch(() => {
      throw new NotFoundException("File tidak ditemukan.");
    });
    response.set({
      "Content-Type": media.mimeType,
      "Content-Length": media.size,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath)
      .on("error", () => response.destroy())
      .pipe(response);
  }
}
