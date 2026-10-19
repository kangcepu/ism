"use client";

import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { API, api, ApiError } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";

type Option = { id: number; name: string };
type ReportType = "summary" | "details" | "history";
type Row = Record<string, unknown>;
const columns: Record<ReportType, [string, string][]> = {
  summary: [
    ["group", "Kelompok"],
    ["count", "Jumlah"],
    ["totalPrice", "Total Harga"],
  ],
  details: [
    ["code", "Kode"],
    ["name", "Nama"],
    ["category.name", "Kategori"],
    ["category.itemType", "Tipe Barang"],
    ["location.name", "Lokasi"],
    ["status", "Status"],
    ["assigneeName", "Penerima"],
    ["price", "Harga"],
  ],
  history: [
    ["createdAt", "Tanggal"],
    ["asset.code", "Kode"],
    ["asset.name", "Aset"],
    ["eventType", "Aktivitas"],
    ["actorId", "Actor ID"],
    ["statusFrom", "Status Awal"],
    ["statusTo", "Status Akhir"],
    ["note", "Catatan"],
  ],
};
function value(row: Row, path: string) {
  const result = path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object" ? (current as Row)[key] : null,
      row,
    );
  return result == null || result === ""
    ? "—"
    : path === "createdAt"
      ? new Date(String(result)).toLocaleString("id-ID")
      : String(result);
}

export default function InventoryReportsPage() {
  const [type, setType] = useState<ReportType>("details");
  const [filters, setFilters] = useState({
    categoryId: "",
    locationId: "",
    itemType: "",
    status: "",
    from: "",
    to: "",
    q: "",
    action: "",
    actorId: "",
    groupBy: "status",
  });
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [download, setDownload] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Promise.all([api<Option[]>("/categories"), api<Option[]>("/locations")])
      .then(([c, l]) => {
        setCategories(c);
        setLocations(l);
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Gagal memuat pilihan filter.",
        ),
      );
  }, []);
  function query(format?: string) {
    const params = new URLSearchParams();
    for (const [key, item] of Object.entries(filters))
      if (
        item &&
        (key !== "groupBy" || type === "summary") &&
        (!["action", "actorId"].includes(key) || type === "history")
      )
        params.set(key, item);
    if (format) params.set("format", format);
    return params.toString();
  }
  async function preview(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      setRows(await api<Row[]>(`/reports/inventory/${type}?${query()}`));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }
  async function exportReport(format: "csv" | "pdf") {
    setDownload(format);
    setError("");
    try {
      const response = await fetch(
        `${API}/reports/inventory/${type}?${query(format)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || "Ekspor gagal.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-${type}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ekspor gagal.");
    } finally {
      setDownload("");
    }
  }
  return (
    <>
      <PageHeader
        title="Inventory Reports"
        description="Filter, preview, dan unduh laporan inventaris."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <form onSubmit={preview} className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="label">Jenis Laporan</span>
            <select
              className="input"
              value={type}
              onChange={(e) => {
                setType(e.target.value as ReportType);
                setRows([]);
                setLoaded(false);
              }}
            >
              <option value="details">Detail Aset</option>
              <option value="summary">Ringkasan</option>
              <option value="history">Riwayat</option>
            </select>
          </label>
          <label>
            <span className="label">Kategori</span>
            <select
              className="input"
              value={filters.categoryId}
              onChange={(e) =>
                setFilters({ ...filters, categoryId: e.target.value })
              }
            >
              <option value="">Semua kategori</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Lokasi</span>
            <select
              className="input"
              value={filters.locationId}
              onChange={(e) =>
                setFilters({ ...filters, locationId: e.target.value })
              }
            >
              <option value="">Semua lokasi</option>
              {locations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Status</span>
            <select
              className="input"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">Semua status</option>
              {[
                "available",
                "in_use",
                "maintenance",
                "retired",
                "disposed",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {[
            ["q", "Cari Aset", "text"],
            ["itemType", "Tipe Barang", "text"],
            [
              "from",
              type === "history"
                ? "Tanggal Aktivitas Dari"
                : "Tanggal Pembelian Dari",
              "date",
            ],
            ["to", "Sampai", "date"],
            ...(type === "history"
              ? [
                  ["action", "Aktivitas", "text"],
                  ["actorId", "Actor ID", "number"],
                ]
              : []),
          ].map(([key, label, fieldType]) => (
            <label key={key}>
              <span className="label">{label}</span>
              <input
                type={fieldType}
                className="input"
                value={filters[key as keyof typeof filters]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ))}
          {type === "summary" && (
            <label>
              <span className="label">Kelompokkan</span>
              <select
                className="input"
                value={filters.groupBy}
                onChange={(e) =>
                  setFilters({ ...filters, groupBy: e.target.value })
                }
              >
                <option value="status">Status</option>
                <option value="category">Kategori</option>
                <option value="location">Lokasi</option>
                <option value="itemType">Tipe Barang</option>
              </select>
            </label>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
          <button disabled={loading} className="btn-primary">
            <Search className="h-4 w-4" />
            {loading ? "Memuat…" : "Tampilkan"}
          </button>
          <button
            type="button"
            disabled={!!download}
            onClick={() => exportReport("csv")}
            className="btn-secondary"
          >
            <Download className="h-4 w-4" />
            {download === "csv" ? "Menyiapkan…" : "CSV"}
          </button>
          <button
            type="button"
            disabled={!!download}
            onClick={() => exportReport("pdf")}
            className="btn-secondary"
          >
            <Download className="h-4 w-4" />
            {download === "pdf" ? "Menyiapkan…" : "PDF"}
          </button>
        </div>
      </form>
      <section className="card mt-5 overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">
            Preview {loaded && `(${rows.length} data)`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {columns[type].map(([, label]) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, index) => (
                <tr key={String(row.id || index)}>
                  {columns[type].map(([key]) => (
                    <td key={key} className="px-4 py-3">
                      {value(row, key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <Empty text="Memuat laporan…" />
          ) : (
            !rows.length && (
              <Empty
                text={
                  loaded
                    ? "Tidak ada data yang sesuai."
                    : "Pilih filter lalu tampilkan laporan."
                }
              />
            )
          )}
        </div>
      </section>
    </>
  );
}
