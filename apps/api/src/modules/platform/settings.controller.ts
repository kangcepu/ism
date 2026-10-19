import {
  BadRequestException,
  BadGatewayException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { Actor, AdminOnly, Public } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { CryptoService } from "../../common/crypto.service";
import { PrismaService } from "../../database/prisma.service";
import { ollamaConfig, ollamaRequest } from "./ollama";
import { SettingsDto } from "../operations/operations.dto";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { extname, join, resolve } from "node:path";
import { diskStorage } from "multer";
import nodemailer from "nodemailer";

const brandingRoot = join(
  resolve(process.env.UPLOAD_ROOT || "uploads"),
  "branding",
);
const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const secretNames = new Set([
  "password",
  "api_key",
  "token",
  "secret_key",
  "access_key",
  "community",
  "bind_password",
]);
function validateSetting(
  group: string,
  key: string,
  raw: string | number | boolean | null,
) {
  if (raw === null || raw === "" || raw === "••••••••") return;
  const value = String(raw);
  const name = `${group}.${key}`;
  if (
    [
      "hr.enabled",
      "asset_sync.enabled",
      "alerts.enabled",
      "adds.auto_sync",
      "adds.auto_create_users",
      "hr.verify_tls",
    ].includes(name) &&
    !["true", "false"].includes(value)
  )
    throw new BadRequestException(`${name} harus berupa boolean.`);
  if (
    [
      "smtp.port",
      "adds.interval",
      "alerts.threshold",
      "alerts.hysteresis",
      "hr.timeout_ms",
      "hr.cache_ttl_seconds",
      "asset_sync.timeout_ms",
      "asset_sync.default_location_id",
      "monitoring.traffic_poll_seconds",
    ].includes(name)
  ) {
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      (name === "smtp.port" &&
        (!Number.isInteger(number) || number < 1 || number > 65535)) ||
      (name === "adds.interval" && (!Number.isInteger(number) || number < 1)) ||
      (name === "alerts.hysteresis" && number < 0) ||
      (name === "hr.timeout_ms" &&
        (!Number.isInteger(number) || number < 1000 || number > 60000)) ||
      (name === "asset_sync.timeout_ms" &&
        (!Number.isInteger(number) || number < 1000 || number > 60000)) ||
      (name === "asset_sync.default_location_id" &&
        (!Number.isInteger(number) || number < 1)) ||
      (name === "monitoring.traffic_poll_seconds" &&
        (!Number.isInteger(number) || number < 10 || number > 300)) ||
      (name === "hr.cache_ttl_seconds" &&
        (!Number.isInteger(number) || number < 0 || number > 3600))
    )
      throw new BadRequestException(`${name} tidak valid.`);
  }
  if (name === "hr.method" && !["GET", "POST"].includes(value.toUpperCase()))
    throw new BadRequestException("Metode HR harus GET atau POST.");
  if (
    ["hr.key_header", "asset_sync.key_header"].includes(name) &&
    !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
  )
    throw new BadRequestException("Nama header HR tidak valid.");
  if (
    [
      "general.logo_url",
      "storage.endpoint",
      "hr.url",
      "asset_sync.url",
      "ollama.base_url",
    ].includes(name)
  ) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new BadRequestException(
        `${name} harus berupa URL HTTP atau HTTPS.`,
      );
    }
  }
  if (name === "smtp.from_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new BadRequestException("Alamat email pengirim tidak valid.");
  if (
    name === "smtp.encryption" &&
    !["tls", "ssl", "none"].includes(value.toLowerCase())
  )
    throw new BadRequestException("Enkripsi SMTP harus tls, ssl, atau none.");
  if (
    name === "general.default_user_role" &&
    !["admin", "user"].includes(value)
  )
    throw new BadRequestException("Role default harus admin atau user.");
}
@Controller("settings")
export class SettingsController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  @AdminOnly() @Get() async list() {
    const rows = await this.db.appSetting.findMany({
      orderBy: [{ group: "asc" }, { key: "asc" }],
    });
    return rows.reduce<Record<string, Record<string, string | null>>>(
      (a, row) => {
        (a[row.group] ||= {})[row.key] =
          row.isSecret && row.encryptedValue ? "••••••••" : row.value;
        return a;
      },
      {},
    );
  }
  @AdminOnly() @Put() async update(@Body() dto: SettingsDto) {
    for (const entries of Object.values(dto.settings)) {
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        throw new BadRequestException("Format grup pengaturan tidak valid.");
      }
      for (const raw of Object.values(entries)) {
        if (
          raw !== null &&
          !["string", "number", "boolean"].includes(typeof raw)
        ) {
          throw new BadRequestException("Nilai pengaturan tidak valid.");
        }
      }
    }
    const changes = Object.entries(dto.settings).flatMap(([group, entries]) =>
      Object.entries(entries).map(([key, raw]) => ({ group, key, raw })),
    );
    for (const { group, key, raw } of changes) validateSetting(group, key, raw);
    await this.db.$transaction(
      changes.flatMap(({ group, key, raw }) => {
        const isSecret =
          secretNames.has(key) ||
          /password|token|secret|community|api.?key/i.test(key);
        const compound = `${group}.${key}`;
        if (
          isSecret &&
          (raw === "" || raw === "••••••••") &&
          !dto.clearSecrets?.includes(compound)
        )
          return [];
        const text =
          raw === null || (isSecret && dto.clearSecrets?.includes(compound))
            ? null
            : String(raw);
        return [
          this.db.appSetting.upsert({
            where: { group_key: { group, key } },
            create: {
              group,
              key,
              isSecret,
              value: isSecret ? null : text,
              encryptedValue:
                isSecret && text ? this.crypto.encrypt(text) : null,
            },
            update: {
              isSecret,
              value: isSecret ? null : text,
              encryptedValue: isSecret
                ? text
                  ? this.crypto.encrypt(text)
                  : null
                : null,
            },
          }),
        ];
      }),
    );
    return this.list();
  }

  @AdminOnly()
  @Post("branding/logo")
  @UseInterceptors(
    FileInterceptor("logo", {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_, file, callback) =>
        callback(
          imageTypes.has(file.mimetype)
            ? null
            : new BadRequestException("Logo harus PNG, JPG, WEBP, atau SVG."),
          imageTypes.has(file.mimetype),
        ),
      storage: diskStorage({
        destination: async (_, __, callback) => {
          await fs.mkdir(brandingRoot, { recursive: true });
          callback(null, brandingRoot);
        },
        filename: (_, file, callback) =>
          callback(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
          ),
      }),
    }),
  )
  async uploadLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException("File logo wajib dipilih.");
    const previous = await this.db.appSetting.findUnique({
      where: { group_key: { group: "general", key: "logo_file" } },
      select: { value: true },
    });
    await this.db.appSetting.upsert({
      where: { group_key: { group: "general", key: "logo_file" } },
      create: { group: "general", key: "logo_file", value: file.filename },
      update: { value: file.filename },
    });
    if (previous?.value && previous.value !== file.filename)
      await fs
        .unlink(join(brandingRoot, previous.value))
        .catch(() => undefined);
    return { logoUrl: "/api/v1/public/branding/logo", version: Date.now() };
  }
  @AdminOnly() @Get("ollama/models") async models() {
    const { base } = await ollamaConfig(this.db, false);
    const response = await ollamaRequest(base, "/api/tags");
    return {
      configured: true,
      models: Array.isArray(response.models) ? response.models : [],
    };
  }
  @AdminOnly() @Get("storage/test") async storage() {
    const rows = await this.db.appSetting.findMany({
      where: { group: "storage" },
    });
    const values = Object.fromEntries(
      rows.map((row) => [
        row.key,
        row.isSecret && row.encryptedValue
          ? this.crypto.decrypt(row.encryptedValue)
          : row.value,
      ]),
    );
    if (
      !values.endpoint ||
      !values.bucket ||
      !values.access_key ||
      !values.secret_key
    )
      return {
        configured: false,
        reachable: false,
        message: "Konfigurasi S3/MinIO belum lengkap.",
      };
    const client = new S3Client({
      endpoint: values.endpoint,
      region: values.region || "us-east-1",
      credentials: {
        accessKeyId: values.access_key,
        secretAccessKey: values.secret_key,
      },
      forcePathStyle: true,
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
    });
    try {
      await client.send(new HeadBucketCommand({ Bucket: values.bucket }));
      return {
        configured: true,
        reachable: true,
        message: "Bucket S3/MinIO dapat diakses.",
      };
    } catch {
      return {
        configured: true,
        reachable: false,
        message:
          "Bucket S3/MinIO tidak dapat diakses. Periksa konfigurasi dan jaringan.",
      };
    } finally {
      client.destroy();
    }
  }
  @AdminOnly() @Post("test-email") async email(@Actor() actor: RequestUser) {
    const [rows, user] = await Promise.all([
      this.db.appSetting.findMany({ where: { group: "smtp" } }),
      this.db.user.findUnique({
        where: { id: actor.id },
        select: { email: true, deletedAt: true },
      }),
    ]);
    const values = Object.fromEntries(
      rows.map((row) => [
        row.key,
        row.isSecret && row.encryptedValue
          ? this.crypto.decrypt(row.encryptedValue)
          : row.value,
      ]),
    );
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      !user ||
      user.deletedAt ||
      !user.email ||
      !emailPattern.test(user.email)
    )
      throw new BadRequestException(
        "Email akun admin belum tersedia atau tidak valid.",
      );
    const port = Number(values.port);
    const encryption = (values.encryption || "tls").toLowerCase();
    if (
      !values.host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !values.from_email ||
      !emailPattern.test(values.from_email) ||
      !["tls", "ssl", "none"].includes(encryption)
    )
      throw new BadRequestException(
        "Konfigurasi SMTP belum lengkap atau tidak valid.",
      );
    if (Boolean(values.username) !== Boolean(values.password))
      throw new BadRequestException(
        "Username dan password SMTP harus diisi bersama.",
      );
    const transport = nodemailer.createTransport({
      host: values.host,
      port,
      secure: encryption === "ssl",
      requireTLS: encryption === "tls",
      ignoreTLS: encryption === "none",
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      ...(values.username && values.password
        ? { auth: { user: values.username, pass: values.password } }
        : {}),
    });
    try {
      await transport.sendMail({
        from: { name: values.from_name || "ISM", address: values.from_email },
        to: user.email,
        subject: "ISM - Tes SMTP",
        text: "Konfigurasi SMTP ISM berhasil mengirim email uji.",
      });
      return { sent: true, recipient: user.email };
    } catch {
      throw new BadGatewayException(
        "Email uji gagal dikirim. Periksa server, autentikasi, dan enkripsi SMTP.",
      );
    } finally {
      transport.close();
    }
  }
}
@Controller("public/branding")
export class BrandingController {
  constructor(private readonly db: PrismaService) {}
  private async values() {
    const rows = await this.db.appSetting.findMany({
      where: {
        group: "general",
        key: { in: ["app_name", "app_subtitle", "logo_file"] },
      },
    });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
  @Public() @Get() async branding() {
    const values = await this.values();
    return {
      appName: values.app_name || "ISM",
      appSubtitle: values.app_subtitle || "IS Department Management System",
      logoUrl: values.logo_file ? "/api/v1/public/branding/logo" : null,
    };
  }
  @Public() @Get("logo") async logo(@Res() response: Response) {
    const values = await this.values();
    const name = values.logo_file;
    if (!name || !/^[a-f0-9-]+\.(png|jpe?g|webp|svg)$/i.test(name))
      throw new NotFoundException("Logo belum tersedia.");
    const path = join(brandingRoot, name);
    await fs.access(path).catch(() => {
      throw new NotFoundException("File logo tidak ditemukan.");
    });
    const contentType = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      svg: "image/svg+xml",
    }[name.split(".").pop()!.toLowerCase()];
    response.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    });
    createReadStream(path).pipe(response);
  }
}
