import { AssetStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

const stop = new Set(
  "ada apa apakah bagaimana gimana berapa banyak jumlah total stok stock yang yg available tersedia ready dipakai digunakan terpakai in use unit buah pcs aset asset barang item di dan atau dengan untuk saya kita kami gue gua aku anda kamu lo lu tolong coba cobain cek periksa cekkan bro gan boss dong donglah ya yah nih ini itu sebut lihat data daftar detail informasi info pemakai pengguna user belum punya memiliki maintenance perbaikan retired pensiun disposed dibuang unassigned assign status kondisi semua seluruh dari ke pada dalam itu ini saja aja mana siapa milik nama bernama nomor serial number alamat address ip mac kategori category lokasi location jenis type berikan bisa mau ingin tentang per mengenai terkait terdaftar tercatat masih sudah jelaskan ringkasan summary monitoring network jaringan switch perangkat device online offline degraded unknown normal sekarang saat ini saat the a an of in show find search list please how many where is are me our current currently check please".split(
    " ",
  ),
);

export function searchTerms(prompt: string) {
  return [...new Set(prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((term) => term.length >= 2 && !stop.has(term))
    .slice(0, 6);
}

export function limitEvidence(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value)) return value.slice(0, 40).map(limitEvidence);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, limitEvidence(item)]),
    );
  return value;
}

function requestedStatus(prompt: string): AssetStatus | undefined {
  const text = prompt.toLowerCase();
  const matches: AssetStatus[] = [];
  if (/\b(available|tersedia|ready|stok|stock)\b/.test(text))
    matches.push("available");
  if (/\b(in[ _-]?use|dipakai|digunakan|terpakai)\b/.test(text))
    matches.push("in_use");
  if (/\b(maintenance|perbaikan)\b/.test(text)) matches.push("maintenance");
  if (/\b(retired|pensiun)\b/.test(text)) matches.push("retired");
  if (/\b(disposed|dibuang)\b/.test(text)) matches.push("disposed");
  return matches.length === 1 ? matches[0] : undefined;
}

export async function inventoryEvidence(db: PrismaService, prompt: string) {
  const terms = searchTerms(prompt);
  const status = requestedStatus(prompt);
  const where: Prisma.AssetWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(/\b(unassigned|belum (?:di)?assign|belum punya (?:pemakai|pengguna))\b/i.test(
      prompt,
    )
      ? { assignedUserId: null, assigneeName: null }
      : {}),
    AND: terms.map((term) => ({
      OR: [
        { code: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { serialNumber: { contains: term, mode: "insensitive" } },
        { macAddress: { contains: term, mode: "insensitive" } },
        { assigneeName: { contains: term, mode: "insensitive" } },
        { assigneeCode: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
        { category: { itemType: { contains: term, mode: "insensitive" } } },
        { location: { name: { contains: term, mode: "insensitive" } } },
      ],
    })),
  };
  const [items, total, statuses] = await Promise.all([
    db.asset.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        serialNumber: true,
        macAddress: true,
        status: true,
        assigneeName: true,
        category: { select: { name: true, itemType: true } },
        location: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    }),
    db.asset.count({ where }),
    db.asset.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  return {
    matchedTotal: total,
    terms,
    status: status || null,
    statusBreakdown: statuses.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    items,
  };
}

export async function monitoringEvidence(db: PrismaService, prompt: string) {
  const terms = searchTerms(prompt);
  const statuses = ["online", "offline", "degraded", "unknown"].filter(
    (status) => new RegExp(`\\b${status}\\b`, "i").test(prompt),
  );
  const where: Prisma.NetworkMonitorWhereInput = {
    deletedAt: null,
    ...(statuses.length === 1
      ? {
          lastStatus: statuses[0] as
            "online" | "offline" | "degraded" | "unknown",
        }
      : {}),
    AND: terms.map((term) => ({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { host: { contains: term, mode: "insensitive" } },
        { location: { contains: term, mode: "insensitive" } },
        { deviceType: { contains: term, mode: "insensitive" } },
      ],
    })),
  };
  const [items, total] = await Promise.all([
    db.networkMonitor.findMany({
      where,
      select: {
        id: true,
        name: true,
        host: true,
        location: true,
        deviceType: true,
        lastStatus: true,
        latencyMs: true,
        lastMessage: true,
        lastCheckedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 100,
    }),
    db.networkMonitor.count({ where }),
  ]);
  return { matchedTotal: total, terms, items };
}

export type AiTool = "inventory-search" | "monitoring-health";

export function planTools(prompt: string): AiTool[] {
  const assets =
    /\b(aset|asset|barang|item|inventaris|inventory|laptop|pc|komputer|printer|tablet|serial|kategori|lokasi|pemakai|assignee|available|tersedia|stok|stock|in[ _-]?use|maintenance|retired|disposed)\b/i.test(
      prompt,
    );
  const monitoring =
    /\b(switch|snmp|network|jaringan|monitoring|monitor|traffic|vlan|chassis|suhu|temperature|offline|degraded|online|port|interface|poe|sensor)\b/i.test(
      prompt,
    );
  if (assets && monitoring) return ["inventory-search", "monitoring-health"];
  if (monitoring) return ["monitoring-health"];
  return ["inventory-search"];
}
