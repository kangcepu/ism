for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {}
}

const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const backgrounds = path.join(
  path.resolve(process.env.UPLOAD_ROOT || "uploads"),
  "floor-map-assets",
);

function dimensions(page) {
  try {
    const file = path.join(backgrounds, `page-${page}.png`);
    const handle = fs.openSync(file, "r");
    const header = Buffer.alloc(24);
    try {
      if (fs.readSync(handle, header, 0, header.length, 0) !== header.length)
        return null;
    } finally {
      fs.closeSync(handle);
    }
    if (
      !header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return null;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (!width || !height) return null;
    const ratio = width / height;
    return {
      width:
        Math.abs(ratio / (4500 / 6300) - 1) < 0.01
          ? 4500
          : Math.round(6300 * ratio),
      height: 6300,
    };
  } catch {
    return null;
  }
}

function coordinate(value, dimension, pixel) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (pixel && !dimension) return null;
  const result = pixel ? (value * 100) / dimension : value;
  return result >= 0 && result <= 100 ? result : null;
}

async function main() {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(897463021)`;
      const record = await tx.floorMapState.findUnique({
        where: { key: "default" },
      });
      const state = record?.state;
      if (!state || typeof state !== "object" || Array.isArray(state))
        throw new Error("Data peta tidak ditemukan.");
      const markers = Array.isArray(state.markers) ? state.markers : [];
      const cameras = markers.filter((marker) => marker?.kind === "cctv");
      const existing = await tx.cctvCamera.findMany({
        where: { sourceMarkerId: { not: null } },
        select: { sourceMarkerId: true },
      });
      const known = new Set(existing.map((camera) => camera.sourceMarkerId));
      const pages = new Map();
      const summary = {
        found: cameras.length,
        existing: 0,
        imported: 0,
        invalid: 0,
        withoutPosition: 0,
      };
      for (const marker of cameras) {
        const id = typeof marker.id === "string" ? marker.id.trim() : "";
        const name =
          typeof marker.name === "string"
            ? marker.name.trim().slice(0, 200)
            : "";
        const page = Number(marker.page);
        if (!id || !name || !Number.isInteger(page) || page < 1 || page > 99) {
          summary.invalid++;
          continue;
        }
        const sourceMarkerId = `floor-map:${id}`;
        if (known.has(sourceMarkerId)) {
          summary.existing++;
          continue;
        }
        known.add(sourceMarkerId);
        if (!pages.has(page)) pages.set(page, dimensions(page));
        const size = pages.get(page);
        const pixel = state.coordinateSpace === "pixels";
        const x = coordinate(marker.x, size?.width, pixel);
        const y = coordinate(marker.y, size?.height, pixel);
        if (x === null || y === null) summary.withoutPosition++;
        const direction =
          typeof marker.direction === "number" &&
          Number.isFinite(marker.direction)
            ? ((marker.direction % 360) + 360) % 360
            : null;
        const address =
          typeof marker.ip === "string"
            ? marker.ip.trim().slice(0, 500) || null
            : null;
        const siteValue = state.pageNames && state.pageNames[String(page)];
        const site =
          typeof siteValue === "string" && siteValue.trim()
            ? siteValue.trim().slice(0, 200)
            : `Halaman ${page}`;
        if (apply) {
          const sequence = await tx.codeSequence.upsert({
            where: { scope: "cctv-camera" },
            create: { scope: "cctv-camera", value: 1 },
            update: { value: { increment: 1 } },
          });
          await tx.cctvCamera.create({
            data: {
              sourceMarkerId,
              code: `CAM-${String(sequence.value).padStart(6, "0")}`,
              name,
              site,
              address,
              floorPage: page,
              x,
              y,
              rotation: direction,
            },
          });
        }
        summary.imported++;
      }
      return summary;
    },
    { timeout: 60000 },
  );
  process.stdout.write(
    `${JSON.stringify({ mode: apply ? "apply" : "preview", ...result })}\n`,
  );
}

main()
  .catch(() => {
    process.stderr.write(
      "Impor CCTV gagal; tidak ada perubahan yang disimpan.\n",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
