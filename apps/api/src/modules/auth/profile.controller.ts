import { Controller, Delete, Get, NotFoundException, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { createReadStream, promises as fs } from "fs";
import { extname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { diskStorage } from "multer";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const root = resolve(process.env.UPLOAD_ROOT || "uploads");
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
@Controller("profile")
export class ProfileController {
  constructor(private readonly db: PrismaService) {}
  @Post("avatar") @UseInterceptors(FileInterceptor("avatar", { limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(allowed.has(file.mimetype) ? null : new Error("Format avatar tidak didukung."), allowed.has(file.mimetype)), storage: diskStorage({ destination: async (_, __, cb) => { const dir = join(root, "avatars"); await fs.mkdir(dir, { recursive: true }); cb(null, dir); }, filename: (_, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }) })) async upload(@Actor() actor: RequestUser, @UploadedFile() file: Express.Multer.File) { if (!file) throw new NotFoundException("File tidak tersedia."); const current = await this.db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { avatarPath: true } }); await this.db.user.update({ where: { id: actor.id }, data: { avatarPath: file.filename } }); if (current.avatarPath) await fs.unlink(join(root, "avatars", current.avatarPath)).catch(() => undefined); return { avatarUrl: "/api/v1/profile/avatar" }; }
  @Get("avatar") async avatar(@Actor() actor: RequestUser, @Res() response: Response) { const user = await this.db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { avatarPath: true } }); if (!user.avatarPath) throw new NotFoundException("Avatar tidak tersedia."); const path = join(root, "avatars", user.avatarPath); await fs.access(path).catch(() => { throw new NotFoundException("Avatar tidak ditemukan."); }); response.set({ "Content-Type": "image/*", "Cache-Control": "private, max-age=300" }); createReadStream(path).pipe(response); }
  @Delete("avatar") async remove(@Actor() actor: RequestUser) { const user = await this.db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { avatarPath: true } }); await this.db.user.update({ where: { id: actor.id }, data: { avatarPath: null } }); if (user.avatarPath) await fs.unlink(join(root, "avatars", user.avatarPath)).catch(() => undefined); return { deleted: true }; }
}
