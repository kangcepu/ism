"use client";

import { useCallback, useEffect, useState } from "react";
import { API, api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { GaTickets } from "./ga-tickets";

type Report = {
  id: number;
  date: string;
  reporter: string;
  department: string;
  location: string;
  category: string;
  analysis: string;
  resolution: string | null;
  status: "OPEN" | "ON_PROGRESS" | "DONE";
};
type Form = Omit<Report, "id" | "resolution"> & { resolution: string };
const blank: Form = {
  date: "",
  reporter: "",
  department: "",
  location: "",
  category: "",
  analysis: "",
  resolution: "",
  status: "OPEN",
};

export default function SupportReportsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Report[]>([]);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    category: "",
    location: "",
    from: "",
    to: "",
    sort: "date",
    direction: "desc",
  });
  const [options, setOptions] = useState<{
    categories: string[];
    locations: string[];
  }>({ categories: [], locations: [] });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Report | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(blank);
  const query = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params;
  }, [filters]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = query();
      params.set("page", String(page));
      params.set("perPage", "25");
      setRows(await api<Report[]>(`/it-support-reports?${params}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [page, query]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    api<typeof options>("/it-support-reports/options")
      .then(setOptions)
      .catch(() => undefined);
  }, [notice]);
  function open(row: Report | null) {
    setEditing(row);
    setForm(
      row
        ? {
            date: row.date.slice(0, 10),
            reporter: row.reporter,
            department: row.department,
            location: row.location,
            category: row.category,
            analysis: row.analysis,
            resolution: row.resolution || "",
            status: row.status,
          }
        : blank,
    );
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/it-support-reports${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      setEditing(undefined);
      await load();
      setNotice("Laporan tersimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan laporan.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Report) {
    if (!window.confirm(`Hapus laporan ${row.reporter}?`)) return;
    setBusy(true);
    try {
      await api(`/it-support-reports/${row.id}`, { method: "DELETE" });
      await load();
      setNotice("Laporan dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus laporan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="IT Support Reports"
        description="Laporan kendala, analisis, penyelesaian, dan status."
        actions={
          user?.role === "admin" && (
            <button onClick={() => open(null)} className="btn-primary">
              Tambah Laporan
            </button>
          )
        }
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <GaTickets />
      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["q", "Cari", "search"],
            ["from", "Dari", "date"],
            ["to", "Sampai", "date"],
          ].map(([key, label, type]) => (
            <label key={key}>
              <span className="label">{label}</span>
              <input
                type={type}
                className="input"
                value={filters[key as keyof typeof filters]}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, [key]: e.target.value });
                }}
              />
            </label>
          ))}
          {[
            ["category", "Kategori", options.categories],
            ["location", "Lokasi", options.locations],
            ["status", "Status", ["OPEN", "ON_PROGRESS", "DONE"]],
            [
              "sort",
              "Urutkan",
              [
                "date",
                "reporter",
                "department",
                "location",
                "category",
                "status",
              ],
            ],
            ["direction", "Arah", ["desc", "asc"]],
          ].map(([key, label, values]) => (
            <label key={String(key)}>
              <span className="label">{String(label)}</span>
              <select
                className="input"
                value={filters[key as keyof typeof filters]}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, [String(key)]: e.target.value });
                }}
              >
                {!["sort", "direction"].includes(String(key)) && (
                  <option value="">Semua</option>
                )}
                {(values as string[]).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <a
            href={`${API}/it-support-reports/export?${query()}`}
            className="btn-secondary"
          >
            Download CSV
          </a>
        </div>
      </section>
      <section className="card mt-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Tanggal",
                  "Pelapor",
                  "Departemen / Lokasi",
                  "Kategori",
                  "Analisis / Solusi",
                  "Status",
                  "Aksi",
                ].map((x) => (
                  <th key={x} className="px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    {new Date(row.date).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-3">{row.reporter}</td>
                  <td className="px-4 py-3">
                    {row.department}
                    <p className="text-xs text-slate-500">{row.location}</p>
                  </td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="max-w-xs px-4 py-3">
                    {row.analysis}
                    <p className="text-xs text-slate-500">
                      {row.resolution || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {user?.role === "admin" && (
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => open(row)}
                        >
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          className="btn-secondary text-rose-700"
                          onClick={() => remove(row)}
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <Empty text="Memuat laporan…" />
          ) : (
            !rows.length && <Empty />
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t p-4 text-sm">
          <button
            disabled={page <= 1}
            className="btn-secondary"
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </button>
          <span>Halaman {page}</span>
          <button
            disabled={rows.length < 25}
            className="btn-secondary"
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </button>
        </div>
      </section>
      {editing !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-title"
            onSubmit={save}
            className="my-auto w-full max-w-xl rounded-2xl bg-white p-5"
          >
            <h2 id="support-title" className="mb-4 text-lg font-bold">
              {editing ? "Edit" : "Tambah"} Laporan
            </h2>
            {error && (
              <p role="alert" className="mb-4 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["date", "Tanggal", "date"],
                ["reporter", "Pelapor", "text"],
                ["department", "Departemen", "text"],
                ["location", "Lokasi", "text"],
                ["category", "Kategori", "text"],
                ["analysis", "Analisis", "text"],
                ["resolution", "Solusi", "text"],
              ].map(([key, label, type]) => (
                <label key={key}>
                  <span className="label">{label}</span>
                  <input
                    required={key !== "resolution"}
                    type={type}
                    className="input"
                    value={form[key as keyof Form]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                <span className="label">Status</span>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as Form["status"],
                    })
                  }
                >
                  {["OPEN", "ON_PROGRESS", "DONE"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(undefined)}
              >
                Batal
              </button>
              <button disabled={busy} className="btn-primary">
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
