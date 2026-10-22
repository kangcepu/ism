"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Send,
  TreePine,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { api, ApiError, API } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Area = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  type: string;
};
type Inspection = {
  id: number;
  areaId: number;
  status: string;
  plantCondition: string;
  drainCondition: string;
  cleanliness: string;
  action: string | null;
  area: { code: string; name: string };
  media: { id: number; type: string; originalName: string }[];
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = {
  areaId: "",
  plantCondition: "BAIK",
  drainCondition: "BAIK",
  cleanliness: "BAIK",
  action: "",
};

export default function GaOutdoorPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [areas, setAreas] = useState<Area[]>([]);
  const [records, setRecords] = useState<Inspection[]>([]);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supervisor = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [items, master] = await Promise.all([
        api<Inspection[]>(`/ga/outdoor?date=${date}`),
        api<Area[]>("/ga/areas"),
      ]);
      setRecords(items);
      setAreas(master.filter((area) => area.active));
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Inspeksi area luar tidak dapat dimuat.",
      );
    }
  }, [date]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const existingId = editing?.id ?? savedId;
      const result = await api<{ id: number }>(
        existingId ? `/ga/outdoor/${existingId}` : "/ga/outdoor",
        {
          method: existingId ? "PATCH" : "POST",
          body: JSON.stringify(
            existingId
              ? {
                  plantCondition: form.plantCondition,
                  drainCondition: form.drainCondition,
                  cleanliness: form.cleanliness,
                  action: form.action || null,
                }
              : {
                  ...form,
                  areaId: Number(form.areaId),
                  inspectedAt: date,
                  action: form.action || undefined,
                },
          ),
        },
      );
      setSavedId(result.id);
      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append("files", file));
        await api(`/ga/outdoor/${result.id}/media`, {
          method: "POST",
          body: upload,
        });
      }
      setForm(blank);
      setEditing(null);
      setSavedId(null);
      setFiles([]);
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Inspeksi gagal dibuat.");
    } finally {
      setBusy(false);
    }
  }
  async function action(id: number, path: string, accepted?: boolean) {
    try {
      await api(`/ga/outdoor/${id}/${path}`, {
        method: "POST",
        body: accepted === undefined ? undefined : JSON.stringify({ accepted }),
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Status inspeksi gagal diperbarui.",
      );
    }
  }
  return (
    <>
      <PageHeader
        title="Monitoring Area Luar"
        description="Inspeksi kondisi tanaman, parit, dan kebersihan area luar untuk tindak lanjut GA."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setSavedId(null);
              setForm(blank);
              setFiles([]);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Buat Inspeksi
          </button>
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
      <section className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <TreePine className="h-5 w-5 text-emerald-600" />
          <div>
            <b>Inspeksi lapangan</b>
            <p className="text-sm text-slate-500">
              Pantau area luar per hari dan kirimkan hasilnya untuk verifikasi.
            </p>
          </div>
        </div>
        <input
          className="input w-auto"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {records.map((record) => (
          <section className="card overflow-hidden" key={record.id}>
            <div className="flex items-start justify-between gap-3 border-b p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {record.area.code}
                </p>
                <h2 className="mt-1 font-semibold">{record.area.name}</h2>
              </div>
              <StatusBadge value={record.status} />
            </div>
            <dl className="grid grid-cols-3 divide-x p-4 text-center text-sm">
              <div>
                <dt className="text-slate-500">Tanaman</dt>
                <dd className="mt-1 font-semibold">{record.plantCondition}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Parit</dt>
                <dd className="mt-1 font-semibold">{record.drainCondition}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Kebersihan</dt>
                <dd className="mt-1 font-semibold">{record.cleanliness}</dd>
              </div>
            </dl>
            {record.action && (
              <p className="mx-4 mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Tindak lanjut: {record.action}
              </p>
            )}
            {!!record.media?.length && (
              <div className="mx-4 mb-4 flex flex-wrap gap-2">
                {record.media.map((media) => (
                  <a
                    className="text-sm text-blue-700 underline"
                    key={media.id}
                    href={`${API}/ga/outdoor/media/${media.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {media.originalName}
                  </a>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 p-3">
              {["DRAFT", "REWORK"].includes(record.status) && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setEditing(record);
                    setSavedId(null);
                    setForm({
                      areaId: String(record.areaId),
                      plantCondition: record.plantCondition,
                      drainCondition: record.drainCondition,
                      cleanliness: record.cleanliness,
                      action: record.action || "",
                    });
                    setFiles([]);
                    setOpen(true);
                  }}
                >
                  Ubah & Lampiran
                </button>
              )}
              {["DRAFT", "REWORK"].includes(record.status) && (
                <button
                  className="btn-secondary"
                  onClick={() => void action(record.id, "submit")}
                >
                  <Send className="h-4 w-4" />
                  Kirim Verifikasi
                </button>
              )}
              {supervisor && record.status === "SUBMITTED" && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => void action(record.id, "verify", false)}
                  >
                    Kembalikan
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => void action(record.id, "verify", true)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Verifikasi
                  </button>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
      {!records.length && (
        <section className="card">
          <Empty text="Belum ada inspeksi area luar pada tanggal ini." />
        </section>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            className="w-full max-w-xl rounded-2xl bg-white p-5"
            onSubmit={create}
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold">
                {editing
                  ? "Ubah Inspeksi Area Luar"
                  : "Buat Inspeksi Area Luar"}
              </h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Area
                <select
                  className="input mt-1"
                  required
                  disabled={Boolean(editing)}
                  value={form.areaId}
                  onChange={(event) =>
                    setForm({ ...form, areaId: event.target.value })
                  }
                >
                  <option value="">Pilih area</option>
                  {areas.map((area) => (
                    <option value={area.id} key={area.id}>
                      {area.code} · {area.name}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["plantCondition", "Kondisi tanaman"],
                ["drainCondition", "Kondisi parit"],
                ["cleanliness", "Kebersihan"],
              ].map(([key, label]) => (
                <label className="block text-sm font-medium" key={key}>
                  {label}
                  <select
                    className="input mt-1"
                    value={form[key as keyof typeof blank]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  >
                    <option>BAIK</option>
                    <option>PERLU PERHATIAN</option>
                    <option>KRITIS</option>
                  </select>
                </label>
              ))}
            </div>
            <label className="mt-4 block text-sm font-medium">
              Tindak lanjut
              <textarea
                className="input mt-1"
                value={form.action}
                onChange={(event) =>
                  setForm({ ...form, action: event.target.value })
                }
                placeholder="Tulis tindakan yang diperlukan bila ada."
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Foto atau video (maksimal 8 file, 100 MB per file)
              <input
                className="input mt-1"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                multiple
                onChange={(event) =>
                  setFiles(Array.from(event.target.files || []))
                }
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Batal
              </button>
              <button className="btn-primary" disabled={busy}>
                {busy ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
