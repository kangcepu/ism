"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDotDashed,
  Plus,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Camera = { id: number; code: string; name: string };
type Summary = {
  open: number;
  recovered: number;
  meanOfflineMinutes: number | null;
};
type Case = {
  id: number;
  cameraName: string;
  detectedAt: string;
  recoveredAt: string | null;
  offlineMinutes: number | null;
  source: string;
  severity: string;
  reason: string | null;
  status: string;
  cameraAsset: { code: string; name: string } | null;
  area: { code: string; name: string } | null;
};
const blank = {
  cameraAssetId: "",
  cameraName: "",
  detectedAt: new Date().toISOString().slice(0, 16),
  source: "MANUAL",
  severity: "MEDIUM",
  reason: "",
  screenshot: "",
};

export default function GaCctvOfflinePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Case[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const supervisor = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [cases, cameraData, metrics] = await Promise.all([
        api<Case[]>("/ga/cctv-offline"),
        api<Camera[]>("/ga/cctv-offline/cameras"),
        api<Summary>("/ga/cctv-offline/summary"),
      ]);
      setItems(cases);
      setCameras(cameraData);
      setSummary(metrics);
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Data CCTV offline gagal dimuat.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      const camera = cameras.find(
        (item) => item.id === Number(form.cameraAssetId),
      );
      await api("/ga/cctv-offline", {
        method: "POST",
        body: JSON.stringify({
          cameraAssetId: form.cameraAssetId
            ? Number(form.cameraAssetId)
            : undefined,
          cameraName: camera
            ? `${camera.code} · ${camera.name}`
            : form.cameraName,
          detectedAt: new Date(form.detectedAt).toISOString(),
          source: form.source,
          severity: form.severity,
          screenshot: form.screenshot || undefined,
          reason: form.reason || undefined,
        }),
      });
      setForm(blank);
      setOpen(false);
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Event offline gagal dicatat.",
      );
    }
  }
  async function action(id: number, actionName: string) {
    try {
      await api(`/ga/cctv-offline/${id}/${actionName}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Status event gagal diperbarui.",
      );
    }
  }
  return (
    <>
      <PageHeader
        title="CCTV Offline Monitoring"
        description="Pantau gangguan kamera, durasi downtime, eskalasi teknis, dan verifikasi pemulihan."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Catat Offline
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
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <section className="card p-4">
          <AlertTriangle className="h-5 w-5 text-rose-600" />
          <p className="mt-3 text-sm text-slate-500">Gangguan aktif</p>
          <b className="text-2xl">{summary?.open ?? "—"}</b>
        </section>
        <section className="card p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="mt-3 text-sm text-slate-500">Pulih terverifikasi</p>
          <b className="text-2xl">{summary?.recovered ?? "—"}</b>
        </section>
        <section className="card p-4">
          <CircleDotDashed className="h-5 w-5 text-amber-600" />
          <p className="mt-3 text-sm text-slate-500">Rata-rata downtime</p>
          <b className="text-2xl">
            {summary?.meanOfflineMinutes
              ? `${Math.round(summary.meanOfflineMinutes)} mnt`
              : "N/M"}
          </b>
        </section>
      </div>
      <section className="card overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">Daftar event offline</h2>
          <p className="mt-1 text-sm text-slate-500">
            Event aktif tidak dapat dibuat ganda untuk kamera yang sama.
          </p>
        </div>
        <div className="divide-y">
          {items.map((item) => (
            <article
              className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
              key={item.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <b>
                    {item.cameraAsset
                      ? `${item.cameraAsset.code} · ${item.cameraAsset.name}`
                      : item.cameraName}
                  </b>
                  <StatusBadge value={item.status} />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Terdeteksi {new Date(item.detectedAt).toLocaleString("id-ID")}{" "}
                  · {item.source}
                  {item.offlineMinutes ? ` · ${item.offlineMinutes} menit` : ""}
                </p>
                {item.reason && (
                  <p className="mt-1 text-sm text-slate-700">{item.reason}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {supervisor && item.status === "DETECTED" && (
                  <button
                    className="btn-secondary"
                    onClick={() => void action(item.id, "validate")}
                  >
                    Validasi
                  </button>
                )}
                {supervisor && item.status === "VALIDATED" && (
                  <button
                    className="btn-primary"
                    onClick={() => void action(item.id, "escalate")}
                  >
                    Eskalasi IT
                  </button>
                )}
                {item.status === "IT_ESCALATED" && (
                  <button
                    className="btn-secondary"
                    onClick={() => void action(item.id, "repair")}
                  >
                    <Wrench className="h-4 w-4" />
                    Mulai Perbaikan
                  </button>
                )}
                {item.status === "IN_REPAIR" && (
                  <button
                    className="btn-primary"
                    onClick={() => void action(item.id, "recover")}
                  >
                    Tandai Pulih
                  </button>
                )}
                {supervisor && item.status === "RECOVERED" && (
                  <button
                    className="btn-primary"
                    onClick={() => void action(item.id, "verify")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Verifikasi
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {!items.length && <Empty text="Belum ada event CCTV offline." />}
      </section>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            className="w-full max-w-xl rounded-2xl bg-white p-5"
            onSubmit={create}
          >
            <h2 className="text-lg font-bold">Catat Kamera Offline</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Kamera terdaftar
                <select
                  className="input mt-1"
                  value={form.cameraAssetId}
                  onChange={(event) =>
                    setForm({ ...form, cameraAssetId: event.target.value })
                  }
                >
                  <option value="">Pilih bila sudah terdaftar</option>
                  {cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {camera.code} · {camera.name}
                    </option>
                  ))}
                </select>
              </label>
              {!form.cameraAssetId && (
                <label className="block text-sm font-medium sm:col-span-2">
                  Nama kamera
                  <input
                    className="input mt-1"
                    required
                    value={form.cameraName}
                    onChange={(event) =>
                      setForm({ ...form, cameraName: event.target.value })
                    }
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Terdeteksi
                <input
                  className="input mt-1"
                  required
                  type="datetime-local"
                  value={form.detectedAt}
                  onChange={(event) =>
                    setForm({ ...form, detectedAt: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Sumber
                <select
                  className="input mt-1"
                  value={form.source}
                  onChange={(event) =>
                    setForm({ ...form, source: event.target.value })
                  }
                >
                  <option>MANUAL</option>
                  <option>TELEMETRY</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                Prioritas
                <select
                  className="input mt-1"
                  value={form.severity}
                  onChange={(event) =>
                    setForm({ ...form, severity: event.target.value })
                  }
                >
                  <option>LOW</option>
                  <option>MEDIUM</option>
                  <option>HIGH</option>
                  <option>CRITICAL</option>
                </select>
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Screenshot gangguan
                <input
                  className="mt-1 block w-full text-sm"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setForm((value) => ({
                        ...value,
                        screenshot: String(reader.result),
                      }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Keterangan
                <textarea
                  className="input mt-1"
                  value={form.reason}
                  onChange={(event) =>
                    setForm({ ...form, reason: event.target.value })
                  }
                  placeholder="Gejala atau informasi awal gangguan."
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
              >
                Batal
              </button>
              <button className="btn-primary">Simpan Event</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
