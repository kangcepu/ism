"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, API } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Metric = {
  name: string;
  numerator: number;
  denominator: number;
  value: number | null;
  definition: string;
};
type Snapshot = {
  period: { start: string; end: string };
  generatedAt: string;
  metrics: Metric[];
};
type Report = {
  id: number;
  code: string;
  status: string;
  createdById: number;
  snapshot: Snapshot;
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function GaReports() {
  const { user } = useAuth();
  const [end, setEnd] = useState(today());
  const [start, setStart] = useState(`${today().slice(0, 7)}-01`);
  const [data, setData] = useState<Snapshot | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const supervisor = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [dashboard, list] = await Promise.all([
        api<Snapshot>(`/ga/reports/dashboard?start=${start}&end=${end}`),
        api<Report[]>("/ga/reports"),
      ]);
      setData(dashboard);
      setReports(list);
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Laporan tidak dapat dimuat.",
      );
    }
  }, [start, end]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    try {
      await api("/ga/reports", {
        method: "POST",
        body: JSON.stringify({ start, end }),
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Laporan tidak dapat dibuat.",
      );
    }
  }
  async function action(id: number, name: string) {
    try {
      await api(`/ga/reports/${id}/${name}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Laporan tidak dapat diperbarui.",
      );
    }
  }
  const snapshot = selected?.snapshot || data;
  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <section className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-sm">
          Dari
          <input
            type="date"
            className="input mt-1"
            value={start}
            onChange={(e) => {
              setSelected(null);
              setStart(e.target.value);
            }}
          />
        </label>
        <label className="text-sm">
          Sampai
          <input
            type="date"
            className="input mt-1"
            value={end}
            onChange={(e) => {
              setSelected(null);
              setEnd(e.target.value);
            }}
          />
        </label>
        {supervisor && (
          <button className="btn-primary" onClick={() => void create()}>
            Buat Draft Laporan
          </button>
        )}
        {selected && (
          <button className="btn-secondary" onClick={() => setSelected(null)}>
            Lihat Data Saat Ini
          </button>
        )}
      </section>
      {snapshot && (
        <>
          <p className="text-sm text-slate-500">
            {selected
              ? `${selected.code} · snapshot tersimpan`
              : "Data saat ini"}{" "}
            · {snapshot.period.start} sampai {snapshot.period.end} · Dibuat{" "}
            {new Date(snapshot.generatedAt).toLocaleString("id-ID")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.metrics.map((m) => (
              <article className="card p-4" key={m.name}>
                <p className="text-sm font-semibold">{m.name}</p>
                <p className="my-2 text-2xl font-bold">
                  {m.value === null ? "Tidak terukur" : `${m.value}%`}
                </p>
                <p className="text-xs text-slate-500">
                  {m.numerator} dari {m.denominator} · {m.definition}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
      <section className="card p-5">
        <h2 className="font-semibold">Laporan tersimpan</h2>
        <p className="text-sm text-slate-500">
          Draft diperiksa supervisor lain sebelum diterbitkan.
        </p>
        <div className="mt-3 divide-y">
          {reports.map((r) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 py-3"
              key={r.id}
            >
              <div>
                <b>{r.code}</b>
                <p className="text-sm text-slate-500">
                  {r.snapshot.period.start} — {r.snapshot.period.end} ·{" "}
                  {r.status}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => setSelected(r)}
                >
                  Lihat
                </button>
                {r.status === "PUBLISHED" && (
                  <a
                    className="btn-secondary"
                    href={`${API}/ga/reports/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Unduh PDF
                  </a>
                )}
                {supervisor &&
                  r.status === "DRAFT" &&
                  r.createdById !== user?.id && (
                    <button
                      className="btn-secondary"
                      onClick={() => void action(r.id, "review")}
                    >
                      Periksa
                    </button>
                  )}
                {supervisor && r.status === "REVIEWED" && (
                  <button
                    className="btn-primary"
                    onClick={() => void action(r.id, "publish")}
                  >
                    Terbitkan
                  </button>
                )}
              </div>
            </div>
          ))}
          {!reports.length && (
            <p className="py-3 text-sm text-slate-500">
              Belum ada laporan tersimpan.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
