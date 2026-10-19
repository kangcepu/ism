"use client";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, PageHeader, StatusBadge } from "@/components/page";

type Config = {
  title: string;
  description: string;
  endpoint: string;
  columns: [string, string][];
  admin?: boolean;
  create?: { label: string; fields: [string, string, string?][] };
};
const configs: Record<string, Config> = {
  "asset-lifecycle": {
    title: "Lifecycle & Assignment",
    description:
      "Assignment, check-in, transfer, perubahan status, dan histori aset.",
    endpoint: "/assets",
    columns: [
      ["code", "Kode"],
      ["name", "Aset"],
      ["status", "Status"],
      ["assigneeName", "Pengguna"],
      ["updatedAt", "Diperbarui"],
    ],
  },
  "switch-details": {
    title: "Switch & Traffic",
    description:
      "Snapshot port, sensor, PoE, VLAN, top user, dan traffic perangkat.",
    endpoint: "/monitors",
    columns: [
      ["name", "Perangkat"],
      ["host", "Host"],
      ["deviceType", "Tipe"],
      ["lastStatus", "Status"],
      ["lastCheckedAt", "Pengecekan"],
    ],
  },
  "floor-map": {
    title: "Infrastructure Floor Map",
    description:
      "Editor marker, cable, background, permission, serta live infrastructure actions.",
    endpoint: "/floor-map/areas",
    columns: [
      ["name", "Area"],
      ["slug", "Slug"],
      ["canvasWidth", "Lebar"],
      ["canvasHeight", "Tinggi"],
      ["updatedAt", "Diperbarui"],
    ],
    create: {
      label: "Tambah Area",
      fields: [
        ["name", "Nama"],
        ["slug", "Slug"],
        ["canvasWidth", "Lebar", "number"],
        ["canvasHeight", "Tinggi", "number"],
      ],
    },
  },
  "map-assets": {
    title: "Map Asset",
    description:
      "Posisi langsung, room membership, dan network overlay inventory.",
    endpoint: "/map-assets",
    columns: [
      ["name", "Nama"],
      ["x", "X"],
      ["y", "Y"],
    ],
  },
  reports: {
    title: "Inventory Reports",
    description:
      "Preview summary, detail inventory, lifecycle history, PDF, dan CSV.",
    endpoint: "/reports/inventory/details",
    columns: [
      ["code", "Kode"],
      ["name", "Aset"],
      ["status", "Status"],
      ["price", "Nilai"],
      ["updatedAt", "Diperbarui"],
    ],
  },
  "it-support": {
    title: "IT Support Reports",
    description:
      "Pelacakan laporan kendala, analisis, penyelesaian, dan status.",
    endpoint: "/it-support-reports",
    columns: [
      ["date", "Tanggal"],
      ["reporter", "Pelapor"],
      ["department", "Departemen"],
      ["category", "Kategori"],
      ["status", "Status"],
    ],
    admin: true,
    create: {
      label: "Tambah Laporan",
      fields: [
        ["date", "Tanggal", "date"],
        ["reporter", "Pelapor"],
        ["department", "Departemen"],
        ["location", "Lokasi"],
        ["category", "Kategori"],
        ["analysis", "Analisis"],
        ["resolution", "Solusi"],
        ["status", "Status"],
      ],
    },
  },
  "ai-assistant": {
    title: "AI Assistant",
    description:
      "Diagnosis berbasis bukti, pencarian inventory, analytics, draft, dan tindakan tervalidasi.",
    endpoint: "/ai/summary",
    columns: [
      ["key", "Metrik"],
      ["value", "Nilai"],
    ],
  },
  users: {
    title: "User Management",
    description: "Kelola akun, role, dan status akses pengguna.",
    endpoint: "/users",
    columns: [
      ["username", "NIK"],
      ["fullname", "Nama Lengkap"],
      ["email", "Email"],
      ["role", "Role"],
      ["updatedAt", "Diperbarui"],
    ],
    admin: true,
    create: {
      label: "Tambah User",
      fields: [
        ["username", "NIK"],
        ["fullname", "Nama Lengkap"],
        ["email", "Email", "email"],
        ["role", "Role"],
        ["password", "Password", "password"],
      ],
    },
  },
  "master-data": {
    title: "Master Data",
    description: "Kategori, item type, lokasi, dan custom field inventory.",
    endpoint: "/categories",
    columns: [
      ["name", "Kategori"],
      ["itemType", "Item Type"],
      ["description", "Deskripsi"],
      ["updatedAt", "Diperbarui"],
    ],
    admin: true,
    create: {
      label: "Tambah Kategori",
      fields: [
        ["name", "Nama"],
        ["itemType", "Item Type"],
        ["description", "Deskripsi"],
      ],
    },
  },
  adds: {
    title: "ADDS Management",
    description:
      "Konfigurasi directory service, OU, user, group, computer, dan membership.",
    endpoint: "/adds/services",
    columns: [
      ["name", "Service"],
      ["active", "Aktif"],
      ["updatedAt", "Diperbarui"],
    ],
    admin: true,
    create: {
      label: "Tambah Service",
      fields: [
        ["name", "Nama"],
        ["host", "Host"],
        ["secret", "Bind Password", "password"],
      ],
    },
  },
  zerotier: {
    title: "ZeroTier",
    description:
      "Multi-account, managed network, member, authorization, dan online state.",
    endpoint: "/zerotier/networks",
    columns: [
      ["externalId", "Network ID"],
      ["name", "Label"],
      ["active", "Aktif"],
      ["updatedAt", "Diperbarui"],
    ],
    admin: true,
    create: {
      label: "Tambah Network",
      fields: [
        ["externalId", "Network ID"],
        ["name", "Label"],
      ],
    },
  },
  integrations: {
    title: "External Integrations",
    description:
      "HR Directory, Asset Sync, UniFi, Blue Iris, S3, SMTP, Ollama, dan Switch SSH.",
    endpoint: "/settings",
    columns: [
      ["key", "Grup"],
      ["value", "Konfigurasi"],
    ],
    admin: true,
  },
  "mobile-releases": {
    title: "Mobile Releases",
    description:
      "Upload, publish, checksum, dan forced update aplikasi Android.",
    endpoint: "/mobile-releases",
    columns: [
      ["versionName", "Versi"],
      ["versionCode", "Build"],
      ["active", "Aktif"],
      ["size", "Ukuran"],
      ["publishedAt", "Publish"],
    ],
    admin: true,
  },
  "audit-logs": {
    title: "Audit Logs",
    description: "Jejak mutasi web, mobile, job, autentikasi, dan tindakan AI.",
    endpoint: "/audit-logs",
    columns: [
      ["createdAt", "Waktu"],
      ["actorName", "Actor"],
      ["source", "Sumber"],
      ["action", "Action"],
      ["resource", "Resource"],
    ],
    admin: true,
  },
  settings: {
    title: "Application Settings",
    description:
      "Branding, storage, alert, SMTP, HR, sync, ADDS, ZeroTier, dan Ollama.",
    endpoint: "/settings",
    columns: [
      ["key", "Grup"],
      ["value", "Nilai"],
    ],
    admin: true,
  },
};
function normalize(input: unknown) {
  if (Array.isArray(input)) return input as Record<string, unknown>[];
  if (input && typeof input === "object") {
    const object = input as Record<string, unknown>;
    if (Array.isArray(object.data))
      return object.data as Record<string, unknown>[];
    if (Array.isArray(object.positions))
      return object.positions as Record<string, unknown>[];
    return Object.entries(object).map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : value,
    }));
  }
  return [];
}
function display(value: unknown, key: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (/At$|date/i.test(key) && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString("id-ID");
  }
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(obj.name || obj.label || obj.code || JSON.stringify(obj));
  }
  return String(value);
}
export default function ModulePage() {
  const slug = String(useParams().module);
  const config = configs[slug];
  const { user } = useAuth();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const load = async () => {
    if (!config) return;
    setLoading(true);
    try {
      setRows(normalize(await api(config.endpoint)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [slug]);
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, query],
  );
  if (!config) return <Empty text="Modul tidak ditemukan." />;
  const allowed = !config.admin || user?.role === "admin";
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(form))
        payload[key] =
          config.create?.fields.find((x) => x[0] === key)?.[2] === "number"
            ? Number(value)
            : value;
      if (slug === "floor-map") payload.state = {};
      if (["adds", "zerotier"].includes(slug)) {
        payload.config = Object.fromEntries(
          Object.entries(payload).filter(
            ([k]) => !["name", "externalId", "secret"].includes(k),
          ),
        );
        for (const key of Object.keys(payload))
          if (!["name", "externalId", "secret", "config"].includes(key))
            delete payload[key];
      }
      await api(config.endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setModal(false);
      setForm({});
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan data.");
    }
  }
  return (
    <>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <div className="flex gap-2">
            <button onClick={load} className="btn-secondary">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {config.create && allowed && (
              <button onClick={() => setModal(true)} className="btn-primary">
                <Plus className="h-4 w-4" />
                {config.create.label}
              </button>
            )}
          </div>
        }
      />
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <section className="card overflow-hidden">
        <div className="flex items-center border-b p-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari data…"
              className="input pl-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {config.columns.map(([, label]) => (
                  <th key={label} className="px-5 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {!loading &&
                filtered.map((row, i) => (
                  <tr key={String(row.id || i)} className="hover:bg-slate-50">
                    {config.columns.map(([key]) => (
                      <td key={key} className="max-w-xs truncate px-5 py-3">
                        {((slug === "asset-lifecycle" && key === "code") ||
                          (slug === "switch-details" && key === "name")) &&
                        row.id ? (
                          <Link
                            className="font-semibold text-blue-700 hover:underline"
                            href={`${slug === "asset-lifecycle" ? "/assets" : "/monitoring"}/${row.id}`}
                          >
                            {display(row[key], key)}
                          </Link>
                        ) : /status|active|role/i.test(key) ? (
                          <StatusBadge value={display(row[key], key)} />
                        ) : (
                          display(row[key], key)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
          {loading ? (
            <Empty text="Memuat data…" />
          ) : (
            !filtered.length && <Empty />
          )}
        </div>
      </section>
      {modal && config.create && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={create}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{config.create.label}</h2>
                <p className="text-sm text-slate-500">
                  Lengkapi data di bawah ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {config.create.fields.map(([key, label, type]) => (
                <label
                  key={key}
                  className={
                    key === "analysis" || key === "resolution"
                      ? "sm:col-span-2"
                      : ""
                  }
                >
                  <span className="label">{label}</span>
                  <input
                    required={
                      !["email", "description", "resolution"].includes(key)
                    }
                    type={type || "text"}
                    value={form[key] || ""}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    className="input"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="btn-secondary"
              >
                Batal
              </button>
              <button className="btn-primary">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
