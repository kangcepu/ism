"use client";

import { MapPin, Plus, QrCode, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { useAuth } from "@/lib/auth";

type Area = {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
  building: string | null;
  floor: string | null;
  floorPage: number | null;
  x: number | null;
  y: number | null;
  qrCode: string | null;
  active: boolean;
  parent: { id: number; name: string } | null;
  ownerGa: { id: number; fullname: string; gaRole: string } | null;
  _count: { children: number };
};
type Summary = {
  total: number;
  active: number;
  mapped: number;
  coverage: number | null;
};
type Form = {
  code: string;
  name: string;
  type: string;
  status: string;
  parentId: string;
  building: string;
  floor: string;
  floorPage: string;
  x: string;
  y: string;
  qrCode: string;
  ownerGaId: string;
  active: boolean;
};
const blank: Form = {
  code: "",
  name: "",
  type: "area",
  status: "DRAFT",
  parentId: "",
  building: "",
  floor: "",
  floorPage: "",
  x: "",
  y: "",
  qrCode: "",
  ownerGaId: "",
  active: true,
};

export default function GaAreasPage() {
  const { user } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Area | null | undefined>();
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [list, metrics] = await Promise.all([
        api<Area[]>(`/ga/areas?q=${encodeURIComponent(query)}`),
        api<Summary>("/ga/areas/summary"),
      ]);
      setAreas(list);
      setSummary(metrics);
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal memuat master area GA.",
      );
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);
  function open(area: Area | null) {
    setEditing(area);
    setForm(
      area
        ? {
            code: area.code,
            name: area.name,
            type: area.type,
            status: area.status,
            parentId: area.parent ? String(area.parent.id) : "",
            building: area.building || "",
            floor: area.floor || "",
            floorPage: area.floorPage ? String(area.floorPage) : "",
            x: area.x === null ? "" : String(area.x),
            y: area.y === null ? "" : String(area.y),
            qrCode: area.qrCode || "",
            ownerGaId: area.ownerGa ? String(area.ownerGa.id) : "",
            active: area.active,
          }
        : blank,
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const nullable = (value: string) => value.trim() || null;
    const body = {
      ...form,
      parentId: form.parentId ? Number(form.parentId) : null,
      floorPage: form.floorPage ? Number(form.floorPage) : null,
      x: form.x === "" ? null : Number(form.x),
      y: form.y === "" ? null : Number(form.y),
      qrCode: nullable(form.qrCode),
      building: nullable(form.building),
      floor: nullable(form.floor),
      ownerGaId: form.ownerGaId ? Number(form.ownerGaId) : null,
    };
    try {
      await api(`/ga/areas${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(undefined);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Area gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="GA Area Master"
        description="Kelola hirarki area kerja, titik inspeksi, QR marker, dan koordinat denah GA."
        actions={
          writable ? (
            <button className="btn-primary" onClick={() => open(null)}>
              <Plus className="h-4 w-4" />
              Tambah Area
            </button>
          ) : undefined
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
      <div className="grid gap-4 sm:grid-cols-3">
        <section className="card p-4">
          <MapPin className="h-5 w-5 text-blue-600" />
          <p className="mt-3 text-sm text-slate-500">Total area</p>
          <b className="text-2xl">{summary?.total ?? "—"}</b>
        </section>
        <section className="card p-4">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-sm text-slate-500">Area aktif</p>
          <b className="text-2xl">{summary?.active ?? "—"}</b>
        </section>
        <section className="card p-4">
          <QrCode className="h-5 w-5 text-violet-600" />
          <p className="mt-3 text-sm text-slate-500">Coverage denah</p>
          <b className="text-2xl">
            {summary?.coverage === null || summary?.coverage === undefined
              ? "N/M"
              : `${summary.coverage.toFixed(1)}%`}
          </b>
        </section>
      </div>
      <section className="card mt-5 overflow-hidden">
        <div className="border-b p-4">
          <input
            className="input max-w-md"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kode atau nama area"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Kode",
                  "Area",
                  "Hirarki",
                  "Lokasi",
                  "Status",
                  "PIC GA",
                  "Denah",
                ].map((label) => (
                  <th className="px-4 py-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {areas.map((area) => (
                <tr
                  key={area.id}
                  className={writable ? "cursor-pointer hover:bg-slate-50" : ""}
                  onClick={() => writable && open(area)}
                >
                  <td className="px-4 py-3 font-medium">{area.code}</td>
                  <td className="px-4 py-3">
                    <b className="block">{area.name}</b>
                    <span className="text-xs text-slate-500">
                      {area.type} · {area._count.children} subarea
                    </span>
                  </td>
                  <td className="px-4 py-3">{area.parent?.name || "—"}</td>
                  <td className="px-4 py-3">
                    {[area.building, area.floor].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={area.status} />
                  </td>
                  <td className="px-4 py-3">{area.ownerGa?.fullname || "—"}</td>
                  <td className="px-4 py-3">
                    {area.floorPage && area.x !== null && area.y !== null
                      ? `Hal. ${area.floorPage} · ${area.x.toFixed(1)}, ${area.y.toFixed(1)}`
                      : "Belum dipetakan"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!areas.length && <Empty text="Belum ada area GA." />}
        </div>
      </section>
      {editing !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5"
          >
            <h2 className="text-lg font-bold">
              {editing ? "Edit" : "Tambah"} Area GA
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Kode area dibuat otomatis berdasarkan jenis area dan urutan data.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Nama Area"],
                  ["building", "Gedung"],
                  ["floor", "Lantai"],
                  ["floorPage", "Halaman Denah"],
                  ["x", "Koordinat X (%)"],
                  ["y", "Koordinat Y (%)"],
                  ["qrCode", "Kode QR"],
                  ["ownerGaId", "ID PIC GA"],
                  ["parentId", "ID Induk Area"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span className="label">{label}</span>
                  <input
                    required={key === "name"}
                    type={
                      ["floorPage", "x", "y", "ownerGaId", "parentId"].includes(
                        key,
                      )
                        ? "number"
                        : "text"
                    }
                    min={
                      key === "floorPage"
                        ? 1
                        : key === "x" || key === "y"
                          ? 0
                          : undefined
                    }
                    max={key === "x" || key === "y" ? 100 : undefined}
                    className="input"
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                <span className="label">Jenis</span>
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {["building", "floor", "zone", "area", "point"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span className="label">Status</span>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {["DRAFT", "REVIEW", "ACTIVE", "REVISED", "RETIRED"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Area aktif
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(undefined)}
              >
                Batal
              </button>
              <button disabled={busy} className="btn-primary">
                Simpan Area
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
