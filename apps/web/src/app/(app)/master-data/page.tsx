"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty, PageHeader } from "@/components/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Row = { id: number; name?: string; itemType?: string; description?: string; fieldName?: string; fieldLabel?: string; fieldType?: string; isRequired?: boolean };
type Tab = "categories" | "locations" | "custom-fields";
const tabs: { id: Tab; label: string }[] = [
  { id: "categories", label: "Kategori" },
  { id: "locations", label: "Lokasi" },
  { id: "custom-fields", label: "Custom Field" },
];

export default function MasterDataPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("categories");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try { setRows(await api<Row[]>(`/${tab}`)); }
    catch (e) { setRows([]); setError(e instanceof ApiError ? e.message : "Gagal memuat data."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);

  function open(row: Row | null) {
    setEditing(row);
    setForm(row ? { name: row.name || "", itemType: row.itemType || "", description: row.description || "", fieldName: row.fieldName || "", fieldLabel: row.fieldLabel || "", fieldType: row.fieldType || "text", isRequired: row.isRequired ?? false } : { fieldType: "text", isRequired: false });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const fields = tab === "categories" ? ["name", "itemType", "description"] : tab === "locations" ? ["name", "description"] : ["fieldName", "fieldLabel", "fieldType", "isRequired"];
    const payload = Object.fromEntries(fields.filter((key) => form[key] !== undefined).map((key) => [key, form[key]]));
    try {
      await api(`/${tab}${editing ? `/${editing.id}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setEditing(undefined);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Gagal menyimpan data."); }
    finally { setSaving(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm(`Hapus ${row.name || row.fieldLabel}?`)) return;
    setError("");
    try { await api(`/${tab}/${row.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Gagal menghapus data."); }
  }
  const fields: [string, string, boolean][] = tab === "categories" ? [["name", "Nama Kategori", true], ["itemType", "Tipe Barang", true], ["description", "Deskripsi", false]] : tab === "locations" ? [["name", "Nama Lokasi", true], ["description", "Deskripsi", false]] : [["fieldName", "Nama Field (key)", true], ["fieldLabel", "Label", true], ["fieldType", "Tipe Field", true]];
  return <>
    <PageHeader title="Master Data" description="Kelola kategori, lokasi, dan custom field untuk inventaris." actions={user?.role === "admin" && <button onClick={() => open(null)} className="btn-primary"><Plus className="h-4 w-4"/>Tambah {tabs.find((x) => x.id === tab)?.label}</button>}/>
    <div className="mb-4 flex flex-wrap gap-2">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? "btn-primary" : "btn-secondary"}>{item.label}</button>)}</div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{[tab === "custom-fields" ? "Label" : "Nama", tab === "categories" ? "Tipe Barang" : tab === "locations" ? "Deskripsi" : "Nama Field", ...(tab === "custom-fields" ? ["Tipe", "Wajib"] : []), "Aksi"].map((label) => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={row.id}><td className="px-5 py-3">{row.name || row.fieldLabel}</td><td className="px-5 py-3">{tab === "categories" ? row.itemType : tab === "locations" ? row.description || "—" : row.fieldName}</td>{tab === "custom-fields" && <><td className="px-5 py-3">{row.fieldType}</td><td className="px-5 py-3">{row.isRequired ? "Ya" : "Tidak"}</td></>}<td className="px-5 py-3">{user?.role === "admin" && <div className="flex gap-2"><button aria-label="Edit" onClick={() => open(row)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4"/></button><button aria-label="Hapus" onClick={() => remove(row)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button></div>}</td></tr>)}</tbody></table>{loading ? <Empty text="Memuat data…"/> : !rows.length && <Empty/>}</div></section>
    {editing !== undefined && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{editing ? "Edit" : "Tambah"} {tabs.find((x) => x.id === tab)?.label}</h2><button type="button" aria-label="Tutup" onClick={() => setEditing(undefined)}><X/></button></div><div className="space-y-4">{fields.map(([key, label, required]) => <label key={key} className="block"><span className="label">{label}</span><input required={required} value={String(form[key] || "")} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input"/></label>)}{tab === "custom-fields" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.isRequired)} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}/>Wajib diisi</label>}</div><div className="mt-5 flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setEditing(undefined)} className="btn-secondary">Batal</button><button disabled={saving} className="btn-primary">{saving ? "Menyimpan…" : "Simpan"}</button></div></form></div>}
  </>;
}
