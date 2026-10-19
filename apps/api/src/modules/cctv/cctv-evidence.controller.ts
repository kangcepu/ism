import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { access } from "./cctv.controller";

const root = join(
  resolve(process.env.UPLOAD_ROOT || "uploads"),
  "cctv-evidence",
);
const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};
const select = {
  id: true,
  cameraId: true,
  maintenanceId: true,
  verificationId: true,
  originalName: true,
  mimeType: true,
  size: true,
  uploadedById: true,
  createdAt: true,
} as const;

function validFile(type: string, bytes: Buffer) {
  if (type === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (type === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (type === "image/webp")
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  if (type === "video/mp4")
    return (
      bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp"
    );
  if (type === "video/webm")
    return (
      bytes.length >= 4 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    );
  return false;
}

function optionalId(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    throw new BadRequestException("Referensi bukti tidak valid.");
  const id = Number(value);
  if (!Number.isSafeInteger(id))
    throw new BadRequestException("Referensi bukti tidak valid.");
  return id;
}

@Controller("cctv")
export class CctvEvidenceController {
  constructor(private readonly db: PrismaService) {}

  @Get("cameras/:id/evidence") async list(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) cameraId: number,
  ) {
    access(actor);
    return this.db.cctvEvidence.findMany({
      where: { cameraId },
      select,
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("cameras/:id/evidence")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async upload(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) cameraId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    access(actor, true);
    if (
      !file ||
      !extensions[file.mimetype] ||
      !validFile(file.mimetype, file.buffer)
    )
      throw new BadRequestException(
        "Pilih foto JPEG, PNG, WebP atau video MP4/WebM yang valid, maksimal 50 MB.",
      );
    const maintenanceId = optionalId(body.maintenanceId);
    const verificationId = optionalId(body.verificationId);
    if (maintenanceId && verificationId)
      throw new BadRequestException(
        "Pilih satu referensi pekerjaan atau verifikasi.",
      );
    if (
      !(await this.db.cctvCamera.findUnique({
        where: { id: cameraId },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Kamera tidak ditemukan.");
    if (
      maintenanceId &&
      !(await this.db.cctvMaintenance.findFirst({
        where: { id: maintenanceId, cameraId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("Pekerjaan tidak sesuai dengan kamera.");
    if (
      verificationId &&
      !(await this.db.cctvVerification.findFirst({
        where: { id: verificationId, cameraId },
        select: { id: true },
      }))
    )
      throw new BadRequestException("Verifikasi tidak sesuai dengan kamera.");
    const internalName = `${randomUUID()}${extensions[file.mimetype]}`;
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, internalName);
    await fs.writeFile(path, file.buffer, { flag: "wx", mode: 0o600 });
    try {
      return await this.db.cctvEvidence.create({
        data: {
          cameraId,
          maintenanceId,
          verificationId,
          internalName,
          originalName:
            basename(file.originalname.replace(/\\/g, "/"))
              .replace(/[\x00-\x1f\x7f]/g, "")
              .slice(0, 200) || "Bukti",
          mimeType: file.mimetype,
          size: file.size,
          uploadedById: actor.id,
        },
        select,
      });
    } catch (error) {
      await fs.unlink(path).catch(() => undefined);
      throw error;
    }
  }

  @Get("evidence/:id/file") async file(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    access(actor);
    const evidence = await this.db.cctvEvidence.findUnique({ where: { id } });
    if (!evidence) throw new NotFoundException("Bukti tidak ditemukan.");
    const path = join(root, evidence.internalName);
    const stat = await fs.stat(path).catch(() => {
      throw new NotFoundException("File bukti tidak ditemukan.");
    });
    if (!stat.isFile() || stat.size !== evidence.size)
      throw new NotFoundException("File bukti tidak tersedia.");
    response.set({
      "Content-Type": evidence.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
    });
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : -1;
      const end =
        match && match[2]
          ? Math.min(Number(match[2]), stat.size - 1)
          : stat.size - 1;
      if (
        !match ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        start >= stat.size
      ) {
        response
          .status(416)
          .set({ "Content-Range": `bytes */${stat.size}` })
          .end();
        return;
      }
      response
        .status(206)
        .set({
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": String(end - start + 1),
        });
      createReadStream(path, { start, end })
        .on("error", () => response.destroy())
        .pipe(response);
      return;
    }
    response.set({ "Content-Length": String(stat.size) });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  }
}
