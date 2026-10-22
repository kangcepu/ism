"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type Area = {
  id: number;
  name: string;
  code: string;
  active: boolean;
  status: string;
};
type Worker = { id: number; fullname: string };
type Template = {
  id: number;
  name: string;
  area: { name: string };
  assigneeId: number;
  weekdays: number[];
  active: boolean;
  tasks: string[];
};
type Weekly = {
  start: string;
  end: string;
  total: number;
  verified: number;
  overdue: number;
  records: {
    id: number;
    workDate: string;
    status: string;
    area: { name: string };
    lines: { completed: boolean }[];
  }[];
};
const weekdays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function CleaningSchedules({
  supervisor,
  refresh,
}: {
  supervisor: boolean;
  refresh: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [start, setStart] = useState(localDate());
  const [form, setForm] = useState({
    name: "",
    areaId: "",
    assigneeId: "",
    startDate: localDate(),
    endDate: "",
    tasks: "",
    weekdays: [1, 2, 3, 4, 5],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const [scheduleData, weekData, areaData, workerData] = await Promise.all([
        api<Template[]>("/ga/cleaning-schedules"),
        api<Weekly>(`/ga/cleaning-schedules/weekly?start=${start}`),
        api<Area[]>("/ga/areas"),
        api<Worker[]>("/ga/preventive/workers"),
      ]);
      setTemplates(scheduleData);
      setWeekly(weekData);
      setAreas(areaData.filter((x) => x.active && x.status === "ACTIVE"));
      setWorkers(workerData);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Jadwal gagal dimuat.");
    }
  }, [start]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/ga/cleaning-schedules", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          areaId: Number(form.areaId),
          assigneeId: Number(form.assigneeId),
          endDate: form.endDate || null,
          tasks: form.tasks
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      setForm({
        name: "",
        areaId: "",
        assigneeId: "",
        startDate: localDate(),
        endDate: "",
        tasks: "",
        weekdays: [1, 2, 3, 4, 5],
      });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Jadwal gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }
  async function setActive(template: Template) {
    try {
      await api(`/ga/cleaning-schedules/${template.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active: !template.active }),
      });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Jadwal gagal diperbarui.");
    }
  }
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {supervisor && (
        <form className="card space-y-4 p-5" onSubmit={create}>
          <div>
            <h2 className="font-semibold">Template dan jadwal berulang</h2>
            <p className="text-sm text-slate-500">
              Checklist dibuat otomatis untuk area, petugas, dan hari yang
              dipilih.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              Nama jadwal
              <input
                className="input mt-1"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Area
              <select
                className="input mt-1"
                required
                value={form.areaId}
                onChange={(e) => setForm({ ...form, areaId: e.target.value })}
              >
                <option value="">Pilih area aktif</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Petugas
              <select
                className="input mt-1"
                required
                value={form.assigneeId}
                onChange={(e) =>
                  setForm({ ...form, assigneeId: e.target.value })
                }
              >
                <option value="">Pilih petugas</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.fullname}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Mulai
              <input
                className="input mt-1"
                required
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Berakhir (opsional)
              <input
                className="input mt-1"
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Tugas, satu per baris
              <textarea
                className="input mt-1"
                required
                value={form.tasks}
                onChange={(e) => setForm({ ...form, tasks: e.target.value })}
              />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm">Hari kerja</legend>
            <div className="flex flex-wrap gap-3">
              {weekdays.map((day, i) => (
                <label key={day} className="flex gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.weekdays.includes(i)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        weekdays: e.target.checked
                          ? [...form.weekdays, i]
                          : form.weekdays.filter((d) => d !== i),
                      })
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            className="btn-primary"
            disabled={saving || !form.weekdays.length}
          >
            {saving ? "Menyimpan..." : "Simpan Jadwal"}
          </button>
        </form>
      )}
      <section className="card p-5">
        <h2 className="font-semibold">Jadwal tersimpan</h2>
        <div className="mt-3 divide-y">
          {templates.map((t) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 py-3"
              key={t.id}
            >
              <div>
                <b>{t.name}</b>
                <p className="text-sm text-slate-500">
                  {t.area.name} ·{" "}
                  {workers.find((w) => w.id === t.assigneeId)?.fullname ||
                    "Petugas"}{" "}
                  · {t.weekdays.map((i) => weekdays[i]).join(", ")} ·{" "}
                  {t.active ? "Aktif" : "Nonaktif"}
                </p>
              </div>
              {supervisor && (
                <button
                  className="btn-secondary"
                  onClick={() => void setActive(t)}
                >
                  {t.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              )}
            </div>
          ))}
          {!templates.length && (
            <p className="py-3 text-sm text-slate-500">Belum ada jadwal.</p>
          )}
        </div>
      </section>
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Rekap tujuh hari</h2>
            <p className="text-sm text-slate-500">
              Terlambat berarti tanggal tugas sudah lewat dan belum
              diverifikasi.
            </p>
          </div>
          <input
            className="input w-auto"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        {weekly && (
          <>
            <div className="my-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                Terjadwal <b className="block text-lg">{weekly.total}</b>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                Terverifikasi <b className="block text-lg">{weekly.verified}</b>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                Terlambat <b className="block text-lg">{weekly.overdue}</b>
              </div>
            </div>
            <div className="divide-y">
              {weekly.records.map((x) => (
                <div
                  key={x.id}
                  className="flex justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {x.workDate.slice(0, 10)} · {x.area.name}
                  </span>
                  <span>
                    {x.lines.filter((l) => l.completed).length}/{x.lines.length}{" "}
                    · {x.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
