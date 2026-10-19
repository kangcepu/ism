import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { extname } from "node:path";
import { SaxesParser } from "saxes";
import { FloorEdit, FloorView } from "../../common/auth.decorators";

const root = join(
  resolve(process.env.UPLOAD_ROOT || "uploads"),
  "floor-map-assets",
);
function checkPage(page: number) {
  if (page < 1 || page > 99)
    throw new BadRequestException("Halaman harus antara 1 dan 99.");
  return page;
}
function metadata(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    !buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR"
  )
    throw new BadRequestException(
      "Background harus berupa gambar PNG yang valid.",
    );
  const width = buffer.readUInt32BE(16),
    height = buffer.readUInt32BE(20);
  if (!width || !height || width > 30000 || height > 30000)
    throw new BadRequestException("Dimensi PNG tidak valid.");
  return { width, height };
}
export function svgMetadata(buffer: Buffer) {
  const source = buffer.toString("utf8");
  if (/<!ENTITY/i.test(source))
    throw new BadRequestException("Deklarasi entity SVG tidak didukung.");
  const parser = new SaxesParser({ xmlns: true });
  let dimensions: { width: number; height: number } | undefined;
  let rootSeen = false;
  parser.on("opentag", (tag) => {
    if (rootSeen) return;
    rootSeen = true;
    if (tag.local !== "svg" || tag.uri !== "http://www.w3.org/2000/svg")
      throw new Error("Invalid SVG root");
    const viewBox = tag.attributes.viewBox?.value;
    const values = viewBox
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      !values ||
      values.length !== 4 ||
      values.some((value) => !Number.isFinite(value)) ||
      values[2] <= 0 ||
      values[3] <= 0
    )
      throw new Error("Invalid SVG viewBox");
    dimensions = { width: values[2], height: values[3] };
  });
  try {
    parser.write(source).close();
  } catch {
    throw new BadRequestException(
      "File SVG tidak valid atau tidak memiliki viewBox.",
    );
  }
  if (!dimensions)
    throw new BadRequestException(
      "File SVG tidak valid atau tidak memiliki viewBox.",
    );
  return dimensions;
}
@FloorView()
@Controller("floor-map/backgrounds")
export class FloorBackgroundsController {
  @Get() async list() {
    const names = await fs.readdir(root).catch((error) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    const pages = await Promise.all(
      names
        .filter((name) => /^page-([1-9]|[1-9][0-9])\.png$/.test(name))
        .map(async (name) => {
          const path = join(root, name);
          const stat = await fs.stat(path);
          const handle = await fs.open(path, "r");
          const header = Buffer.alloc(24);
          try {
            const { bytesRead } = await handle.read(header, 0, 24, 0);
            const size = metadata(header.subarray(0, bytesRead));
            return {
              page: Number(name.slice(5, -4)),
              ...size,
              version: stat.mtimeMs,
            };
          } finally {
            await handle.close();
          }
        }),
    );
    const vectors = await Promise.all(
      names
        .filter((name) => /^page-([1-9]|[1-9][0-9])\.svg$/.test(name))
        .map(async (name) => {
          const path = join(root, name);
          const page = Number(name.slice(5, -4));
          const image = pages.find((item) => item.page === page);
          return {
            page,
            version: (await fs.stat(path)).mtimeMs,
            ...(image ? {} : svgMetadata(await fs.readFile(path))),
          };
        }),
    );
    const allPages = new Set([
      ...pages.map((item) => item.page),
      ...vectors.map((item) => item.page),
    ]);
    return [...allPages]
      .sort((a, b) => a - b)
      .map((page) => {
        const image = pages.find((item) => item.page === page);
        const vector = vectors.find((item) => item.page === page);
        return {
          page,
          width: image?.width || vector?.width || 4500,
          height: image?.height || vector?.height || 6300,
          hasPng: Boolean(image),
          version: Math.max(image?.version || 0, vector?.version || 0),
          format:
            vector && (!image || vector.version >= image.version)
              ? "svg"
              : "png",
        };
      });
  }
  @Get(":page/vector") async vector(
    @Param("page", ParseIntPipe) value: number,
    @Res() response: Response,
  ) {
    const path = join(root, `page-${checkPage(value)}.svg`);
    const stat = await fs.stat(path).catch(() => {
      throw new NotFoundException("Denah vektor tidak ditemukan.");
    });
    response.set({
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Length": stat.size,
      "Cache-Control": "private, no-cache",
      "Content-Security-Policy":
        "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  }
  @Get(":page") async image(
    @Param("page", ParseIntPipe) value: number,
    @Res() response: Response,
  ) {
    const path = join(root, `page-${checkPage(value)}.png`);
    const stat = await fs.stat(path).catch(() => {
      throw new NotFoundException("Background tidak ditemukan.");
    });
    response.set({
      "Content-Type": "image/png",
      "Content-Length": stat.size,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  }
  @FloorEdit()
  @Put(":page")
  @UseInterceptors(
    FileInterceptor("background", { limits: { fileSize: 12 * 1024 * 1024 } }),
  )
  async upload(
    @Param("page", ParseIntPipe) value: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const page = checkPage(value);
    if (!file) throw new BadRequestException("File background wajib diunggah.");
    const isSvg = /\.svg$/i.test(file.originalname);
    const size = isSvg ? svgMetadata(file.buffer) : metadata(file.buffer);
    await fs.mkdir(root, { recursive: true });
    const temp = join(root, `.${randomUUID()}.tmp`),
      path = join(root, `page-${page}.${isSvg ? "svg" : "png"}`);
    try {
      await fs.writeFile(temp, file.buffer, { flag: "wx", mode: 0o600 });
      await fs.rename(temp, path);
    } finally {
      await fs.unlink(temp).catch(() => undefined);
    }
    const stat = await fs.stat(path);
    const imagePath = join(root, `page-${page}.png`);
    const existingImage = isSvg
      ? await fs
          .readFile(imagePath)
          .then(metadata)
          .catch(() => null)
      : size;
    return {
      page,
      ...(existingImage || size),
      hasPng: Boolean(existingImage),
      version: stat.mtimeMs,
      format: isSvg ? "svg" : "png",
    };
  }
}

@FloorView()
@Controller("floor-map/icons")
export class FloorIconsController {
  @Get() async list() {
    const directory = join(resolve(process.env.UPLOAD_ROOT || "uploads"), "floor-map-icons");
    const names = await fs.readdir(directory).catch(() => [] as string[]);
    return names.filter((name) => /^icon-[a-zA-Z0-9_-]+\.png$/i.test(name)).map((name) => ({ name, url: `/api/v1/floor-map/icons/${name}` }));
  }
  @FloorEdit()
  @Put()
  @UseInterceptors(FileInterceptor("icon", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file || file.mimetype !== "image/png") throw new BadRequestException("Icon harus berupa PNG maksimal 2 MB.");
    metadata(file.buffer);
    const directory = join(resolve(process.env.UPLOAD_ROOT || "uploads"), "floor-map-icons");
    await fs.mkdir(directory, { recursive: true });
    const name = `icon-${randomUUID()}${extname(file.originalname).toLowerCase() || ".png"}`;
    await fs.writeFile(join(directory, name), file.buffer, { mode: 0o600 });
    return { name, url: `/api/v1/floor-map/icons/${name}` };
  }
  @Get(":name") async image(
    @Param("name") name: string,
    @Res() response: Response,
  ) {
    if (
      !/^(icon|cctv-reference)-[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/i.test(name)
    )
      throw new NotFoundException("Gambar tidak ditemukan.");
    const path = join(
      resolve(process.env.UPLOAD_ROOT || "uploads"),
      "floor-map-icons",
      name,
    );
    const stat = await fs.stat(path).catch(() => {
      throw new NotFoundException("Gambar tidak ditemukan.");
    });
    const extension = name.split(".").pop()?.toLowerCase();
    response.set({
      "Content-Type":
        extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : "image/jpeg",
      "Content-Length": stat.size,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);
  }
}
