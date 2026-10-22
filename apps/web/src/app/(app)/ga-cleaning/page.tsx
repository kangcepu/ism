"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CleaningSchedules } from "./schedules";

type Area = { id: number; code: string; name: string; active: boolean };
type Line = {
  id: number;
  task: string;
  completed: boolean;
  note: string | null;
};
type Checklist = {
  id: number;
  status: string;
  note: string | null;
  area: { code: string; name: string };
  lines: Line[];
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const blank = { areaId: "", tasks: "", note: "" };

export default function GaCleaningPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today());
  const [areas, setAreas] = useState<Area[]>([]);
  const [records, setRecords] = useState<Checklist[]>([]);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"daily" | "schedules">("daily");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supervisor = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [items, master] = await Promise.all([
        api<Checklist[]>(`/ga/cleaning?date=${date}`),
        api<Area[]>("/ga/areas"),
      ]);
      setRecords(items);
      setAreas(master.filter((area) => area.active));
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Checklist tidak dapat dimuat.",
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
      await api("/ga/cleaning", {
        method: "POST",
        body: JSON.stringify({
          areaId: Number(form.areaId),
          workDate: date,
          note: form.note || undefined,
          tasks: form.tasks.split("\n").filter(Boolean),
        }),
      });
      setForm(blank);
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Checklist gagal dibuat.");
    } finally {
      setBusy(false);
    }
  }
  async function updateLine(id: number, completed: boolean) {
    try {
      await api(`/ga/cleaning/lines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tugas gagal diperbarui.");
    }
  }
  async function action(id: number, path: string, accepted?: boolean) {
    try {
      await api(`/ga/cleaning/${id}/${path}`, {
        method: "POST",
        body: accepted === undefined ? undefined : JSON.stringify({ accepted }),
      });
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Status checklist gagal diperbarui.",
      );
    }
  }
  return (
    <>
      <PageHeader
        title="Checklist Kebersihan Harian"
        description="Catat pekerjaan kebersihan area, selesaikan tugas, lalu kirim untuk verifikasi supervisor."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Checklist
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
      <div className="mb-5 flex gap-2">
        <button
          className={tab === "daily" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("daily")}
        >
          Checklist Harian
        </button>
        <button
          className={tab === "schedules" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("schedules")}
        >
          Jadwal & Rekap
        </button>
      </div>
      {tab === "schedules" ? (
        <CleaningSchedules supervisor={supervisor} refresh={load} />
      ) : (
        <>
          <section className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              <div>
                <b>Jadwal kerja</b>
                <p className="text-sm text-slate-500">
                  Pilih tanggal untuk melihat checklist harian.
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
          <div className="grid gap-4 xl:grid-cols-2">
            {records.map((record) => {
              const completed = record.lines.filter(
                (line) => line.completed,
              ).length;
              const editable = ["DRAFT", "REWORK"].includes(record.status);
              return (
                <section className="card overflow-hidden" key={record.id}>
                  <div className="flex items-start justify-between gap-4 border-b p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {record.area.code}
                      </p>
                      <h2 className="mt-1 font-semibold">{record.area.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {completed}/{record.lines.length} tugas selesai
                        {record.note ? ` · ${record.note}` : ""}
                      </p>
                    </div>
                    <StatusBadge value={record.status} />
                    {date < today() &&
                      !["VERIFIED", "CANCELLED"].includes(record.status) && (
                        <span className="text-xs font-semibold text-amber-700">
                          Terlambat
                        </span>
                      )}
                  </div>
                  <div className="space-y-2 p-4">
                    {record.lines.map((line) => (
                      <label
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 p-3"
                        key={line.id}
                      >
                        <input
                          disabled={!editable}
                          checked={line.completed}
                          type="checkbox"
                          onChange={(event) =>
                            void updateLine(line.id, event.target.checked)
                          }
                        />
                        <span
                          className={
                            line.completed
                              ? "text-slate-400 line-through"
                              : "text-slate-700"
                          }
                        >
                          {line.task}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 p-3">
                    {editable && (
                      <button
                        className="btn-secondary"
                        disabled={
                          completed !== record.lines.length ||
                          !record.lines.length
                        }
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
                          onClick={() =>
                            void action(record.id, "verify", false)
                          }
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
              );
            })}
          </div>
          {!records.length && (
            <section className="card">
              <Empty text="Belum ada checklist pada tanggal ini." />
            </section>
          )}
        </>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            className="w-full max-w-xl rounded-2xl bg-white p-5"
            onSubmit={create}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold">Buat Checklist Harian</h2>
            </div>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Area
                <select
                  className="input mt-1"
                  required
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
              <label className="block text-sm font-medium">
                Daftar tugas
                <textarea
                  className="input mt-1 min-h-32"
                  required
                  value={form.tasks}
                  onChange={(event) =>
                    setForm({ ...form, tasks: event.target.value })
                  }
                  placeholder={"Sapu lantai\nBersihkan meja\nBuang sampah"}
                />
              </label>
              <label className="block text-sm font-medium">
                Catatan
                <textarea
                  className="input mt-1"
                  value={form.note}
                  onChange={(event) =>
                    setForm({ ...form, note: event.target.value })
                  }
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
