"use client";
import { ArrowDownToLine, GitBranch, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { EmployeePicker } from "@/components/employee-picker";
type Asset = {
  id: number;
  code: string;
  name: string;
  status: string;
  condition?: string;
  assigneeName?: string;
  category: { id: number; name: string; itemType: string };
  location: { id: number; name: string };
  updatedAt: string;
};
type Option = { id: number; name: string };
export default function AssetsPage() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"create" | "assign" | "status" | null>(
    null,
  );
  const [selected, setSelected] = useState<Asset | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const load = () =>
    api<Asset[]>(`/assets?perPage=100&q=${encodeURIComponent(q)}`)
      .then(setRows)
      .catch((e) =>
        setMessage(e instanceof ApiError ? e.message : "Gagal memuat aset."),
      );
  useEffect(() => {
    load();
    Promise.all([
      api<Option[]>("/categories"),
      api<Option[]>("/locations"),
    ]).then(([c, l]) => {
      setCategories(c);
      setLocations(l);
    });
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      if (modal === "create")
        await api("/assets", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            categoryId: Number(form.categoryId),
            locationId: Number(form.locationId),
          }),
        });
      if (modal === "assign" && selected)
        await api(`/assets/${selected.id}/assignments`, {
          method: "POST",
          body: JSON.stringify({
            source: "hr",
            assigneeName: form.assigneeName,
            assigneeCode: form.assigneeCode,
            company: form.company,
            note: form.note,
          }),
        });
      if (modal === "status" && selected)
        await api(`/assets/${selected.id}/status-transitions`, {
          method: "POST",
          body: JSON.stringify({ status: form.status, reason: form.reason }),
        });
      setModal(null);
      setForm({});
      await load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Operasi gagal.");
    }
  }
  async function checkIn(asset: Asset) {
    try {
      await api(`/assets/${asset.id}/check-in`, { method: "POST", body: "{}" });
      load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Check-in gagal.");
    }
  }
  const open = (kind: typeof modal, asset?: Asset) => {
    setMessage("");
    setSelected(asset || null);
    setForm({});
    setModal(kind);
  };
  return (
    <>
      <PageHeader
        title="Manajemen Aset"
        description="Inventory, pencarian, assignment, lifecycle, custom data, dan histori."
        actions={
          <button onClick={() => open("create")} className="btn-primary">
            <Plus className="h-4 w-4" />
            Tambah Aset
          </button>
        }
      />
      {message && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {message}
        </div>
      )}
      <section className="card overflow-hidden">
        <div className="flex gap-2 border-b p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Cari kode, nama, serial, atau pengguna…"
              className="input pl-9"
            />
          </div>
          <button onClick={load} className="btn-secondary">
            Cari
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Kode & Aset",
                  "Kategori",
                  "Lokasi",
                  "Status",
                  "Pengguna",
                  "Aksi",
                ].map((x) => (
                  <th key={x} className="px-5 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/assets/${a.id}`}
                      className="font-bold text-blue-700 hover:underline"
                    >
                      {a.code}
                    </Link>
                    <p className="text-xs text-slate-500">{a.name}</p>
                  </td>
                  <td className="px-5 py-3">
                    {a.category.name}
                    <p className="text-xs text-slate-400">
                      {a.category.itemType}
                    </p>
                  </td>
                  <td className="px-5 py-3">{a.location.name}</td>
                  <td className="px-5 py-3">
                    <StatusBadge value={a.status} />
                  </td>
                  <td className="px-5 py-3">{a.assigneeName || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button
                        title="Assign"
                        onClick={() => open("assign", a)}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                      >
                        <GitBranch className="h-4 w-4" />
                      </button>
                      {a.assigneeName && (
                        <button
                          title="Check-in"
                          onClick={() => checkIn(a)}
                          className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                        >
                          <ArrowDownToLine className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => open("status", a)}
                        className="rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Status
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty />}
        </div>
      </section>
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {modal === "create"
                  ? "Tambah Aset"
                  : modal === "assign"
                    ? `Assign ${selected?.code}`
                    : `Ubah Status ${selected?.code}`}
              </h2>
              <button type="button" onClick={() => setModal(null)}>
                <X />
              </button>
            </div>
            {message && (
              <p role="alert" className="mb-4 text-sm text-rose-700">
                {message}
              </p>
            )}
            {modal === "create" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800 sm:col-span-2">
                  Kode aset dibuat otomatis setelah aset disimpan.
                </div>
                <Field label="Nama" name="name" form={form} set={setForm} />
                <Select
                  label="Kategori"
                  name="categoryId"
                  options={categories}
                  form={form}
                  set={setForm}
                />
                <Select
                  label="Lokasi"
                  name="locationId"
                  options={locations}
                  form={form}
                  set={setForm}
                />
                <Field
                  label="Serial Number"
                  name="serialNumber"
                  form={form}
                  set={setForm}
                />
                <Field
                  label="Deskripsi"
                  name="description"
                  form={form}
                  set={setForm}
                />
              </div>
            )}
            {modal === "assign" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <EmployeePicker
                  value={{
                    assigneeName: form.assigneeName || "",
                    assigneeCode: form.assigneeCode || "",
                    company: form.company || "",
                  }}
                  onChange={(employee) => setForm({ ...form, ...employee })}
                />
                <Field label="Catatan" name="note" form={form} set={setForm} />
              </div>
            )}
            {modal === "status" && (
              <div className="space-y-4">
                <label>
                  <span className="label">Status</span>
                  <select
                    required
                    className="input"
                    value={form.status || ""}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    <option value="">Pilih status</option>
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
                <Field
                  label="Alasan / Catatan"
                  name="reason"
                  form={form}
                  set={setForm}
                />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
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
function Field({
  label,
  name,
  form,
  set,
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  set(v: Record<string, string>): void;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        required={["code", "name", "assigneeName"].includes(name)}
        value={form[name] || ""}
        onChange={(e) => set({ ...form, [name]: e.target.value })}
        className="input"
      />
    </label>
  );
}
function Select({
  label,
  name,
  options,
  form,
  set,
}: {
  label: string;
  name: string;
  options: Option[];
  form: Record<string, string>;
  set(v: Record<string, string>): void;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <select
        required
        value={form[name] || ""}
        onChange={(e) => set({ ...form, [name]: e.target.value })}
        className="input"
      >
        <option value="">Pilih {label}</option>
        {options.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </label>
  );
}
