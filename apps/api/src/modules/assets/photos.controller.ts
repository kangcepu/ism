import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createReadStream, promises as fs } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import { PrismaService } from "../../database/prisma.service";

const root = resolve(process.env.UPLOAD_ROOT || "uploads");
const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
function matchesImage(type: string, bytes: Buffer) {
  if (type === "image/jpeg")
    return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (type === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "image/gif")
    return ["GIF87a", "GIF89a"].includes(
      bytes.subarray(0, 6).toString("ascii"),
    );
  if (type === "image/webp")
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  return false;
}
@Controller()
export class PhotosController {
  constructor(private readonly db: PrismaService) {}
  @Get("assets/:id/photos") list(@Param("id", ParseIntPipe) assetId: number) {
    return this.db.assetPhoto.findMany({
      where: { assetId, asset: { deletedAt: null } },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        storage: true,
        createdAt: true,
      },
    });
  }
  @Post("assets/:id/photos")
  @UseInterceptors(
    FileInterceptor("photo", {
      limits: { fileSize: 12 * 1024 * 1024 },
      fileFilter: (_, file, callback) =>
        callback(
          extensions[file.mimetype]
            ? null
            : new BadRequestException("Format gambar tidak didukung."),
          Boolean(extensions[file.mimetype]),
        ),
      storage: diskStorage({
        destination: async (_, __, cb) => {
          const dir = join(root, "assets");
          await fs.mkdir(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_, file, cb) =>
          cb(null, `${randomUUID()}${extensions[file.mimetype]}`),
      }),
    }),
  )
  async upload(
    @Param("id", ParseIntPipe) assetId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException("File tidak tersedia.");
    try {
      const handle = await fs.open(file.path, "r");
      const bytes = Buffer.alloc(12);
      try {
        await handle.read(bytes, 0, bytes.length, 0);
      } finally {
        await handle.close();
      }
      if (!matchesImage(file.mimetype, bytes))
        throw new BadRequestException("Isi file bukan gambar yang valid.");
      const asset = await this.db.asset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: { id: true },
      });
      if (!asset) throw new NotFoundException("Aset tidak ditemukan.");
      return await this.db.assetPhoto.create({
        data: {
          assetId,
          internalName: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
        },
      });
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
  @Get("asset-photos/:id/file") async file(
    @Param("id", ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const photo = await this.db.assetPhoto.findFirst({
      where: { id, asset: { deletedAt: null } },
    });
    if (!photo) throw new NotFoundException("Foto tidak ditemukan.");
    const path = join(root, "assets", photo.internalName);
    await fs.access(path).catch(() => {
      throw new NotFoundException("File tidak ditemukan.");
    });
    response.set({
      "Content-Type": photo.mimeType,
      "Content-Length": photo.size,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  }
  @Delete("asset-photos/:id") async remove(
    @Param("id", ParseIntPipe) id: number,
  ) {
    const photo = await this.db.assetPhoto.delete({ where: { id } });
    await fs
      .unlink(join(root, "assets", photo.internalName))
      .catch(() => undefined);
    return { deleted: true };
  }
}
