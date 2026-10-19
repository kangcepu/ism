"use client";

import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Play,
  Plus,
  Send,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Area = { id: number; code: string; name: string; active: boolean };
type Worker = { id: number; fullname: string; gaRole: string };
type Plan = {
  id: number;
  title: string;
  targetDate: string;
  weekNo: number;
  standardWork: string;
  status: string;
  priority: string;
  area: { code: string; name: string };
  job: { id: number } | null;
};
type Job = {
  id: number;
  status: string;
  targetDate: string;
  standardWork: string;
  result: string | null;
  beforePhoto: string | null;
  afterPhoto: string | null;
  reworkReason: string | null;
  area: { code: string; name: string };
  plan: { title: string; priority: string };
};
const monthNow = () => new Date().toISOString().slice(0, 7);
const blank = {
  title: "",
  areaId: "",
  standardWork: "",
  weekNo: "",
  targetDate: "",
  recurrence: "",
  pic1Id: "",
  pic2Id: "",
  priority: "NORMAL",
  toolsRequired: "",
};

export default function GaPreventivePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [areas, setAreas] = useState<Area[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<{
    job: Job;
    result: string;
    beforePhoto: string;
    afterPhoto: string;
  } | null>(null);
  const supervisor = user?.role === "admin" || user?.gaRole === "supervisor";
  const load = useCallback(async () => {
    try {
      const [planData, jobData, areaData, workerData] = await Promise.all([
        api<Plan[]>(`/ga/preventive/plans?month=${month}`),
        api<Job[]>(`/ga/preventive/jobs?month=${month}`),
        api<Area[]>("/ga/areas"),
        api<Worker[]>("/ga/preventive/workers"),
      ]);
      setPlans(planData);
      setJobs(jobData);
      setAreas(areaData.filter((area) => area.active));
      setWorkers(workerData);
      setError("");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Data preventive gagal dimuat.",
      );
    }
  }, [month]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/ga/preventive/plans", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          areaId: Number(form.areaId),
          weekNo: Number(form.weekNo),
          pic1Id: Number(form.pic1Id),
          pic2Id: form.pic2Id ? Number(form.pic2Id) : undefined,
          recurrence: form.recurrence || undefined,
          toolsRequired: form.toolsRequired || undefined,
        }),
      });
      setForm(blank);
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Rencana gagal disimpan.");
    }
  }
  async function action(path: string, body?: object) {
    try {
      await api(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Perubahan status gagal.");
    }
  }
  async function submitEvidence(event: React.FormEvent) {
    event.preventDefault();
    if (!evidence) return;
    try {
      await api(`/ga/preventive/jobs/${evidence.job.id}/result`, {
        method: "PATCH",
        body: JSON.stringify({
          result: evidence.result,
          beforePhoto: evidence.beforePhoto,
          afterPhoto: evidence.afterPhoto,
        }),
      });
      await action(`/ga/preventive/jobs/${evidence.job.id}/submit`);
      setEvidence(null);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Bukti pekerjaan gagal disimpan.",
      );
    }
  }
  return (
    <>
      <PageHeader
        title="Preventive GA"
        description="Rencanakan jadwal preventive, tetapkan PIC, jalankan pekerjaan, dan verifikasi hasilnya."
        actions={
          supervisor ? (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Buat Rencana
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
      <section className="card mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-blue-600" />
          <div>
            <b>Kalender preventive</b>
            <p className="text-sm text-slate-500">
              Jadwal, PIC, standar pekerjaan, dan realisasi dalam satu alur.
            </p>
          </div>
        </div>
        <input
          className="input w-auto"
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </section>
      <section className="card mb-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <CalendarDays className="h-5 w-5 text-violet-600" />
          <h2 className="font-semibold">Rencana & Kalender</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Tanggal",
                  "Kegiatan",
                  "Area",
                  "Minggu",
                  "Prioritas",
                  "Status",
                  "Aksi",
                ].map((label) => (
                  <th className="px-4 py-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td className="px-4 py-3">
                    {new Date(plan.targetDate).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-3">
                    <b>{plan.title}</b>
                    <span className="block max-w-xs truncate text-xs text-slate-500">
                      {plan.standardWork}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {plan.area.code} · {plan.area.name}
                  </td>
                  <td className="px-4 py-3">Ke-{plan.weekNo}</td>
                  <td className="px-4 py-3">{plan.priority}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={plan.status} />
                  </td>
                  <td className="px-4 py-3">
                    {supervisor && plan.status === "DRAFT" && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void action(`/ga/preventive/plans/${plan.id}/propose`)
                        }
                      >
                        Ajukan
                      </button>
                    )}
                    {supervisor && plan.status === "PROPOSED" && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void action(`/ga/preventive/plans/${plan.id}/approve`)
                        }
                      >
                        Setujui
                      </button>
                    )}
                    {supervisor && plan.status === "APPROVED" && (
                      <button
                        className="btn-primary"
                        onClick={() =>
                          void action(`/ga/preventive/plans/${plan.id}/release`)
                        }
                      >
                        Rilis
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!plans.length && (
            <Empty text="Belum ada rencana preventive pada bulan ini." />
          )}
        </div>
      </section>
      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <ClipboardCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold">Pelaksanaan & Verifikasi</h2>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <article className="rounded-xl border p-4" key={job.id}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {job.area.code} ·{" "}
                    {new Date(job.targetDate).toLocaleDateString("id-ID")}
                  </p>
                  <h3 className="mt-1 font-semibold">{job.plan.title}</h3>
                </div>
                <StatusBadge value={job.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{job.standardWork}</p>
              {job.result && (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <b>Hasil:</b> {job.result}
                </p>
              )}
              {job.reworkReason && (
                <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                  <b>Rework:</b> {job.reworkReason}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {["RELEASED", "OVERDUE", "REWORK"].includes(job.status) && (
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      void action(`/ga/preventive/jobs/${job.id}/start`)
                    }
                  >
                    <Play className="h-4 w-4" />
                    Mulai
                  </button>
                )}
                {["STARTED", "OVERDUE", "REWORK"].includes(job.status) && (
                  <button
                    className="btn-primary"
                    onClick={() =>
                      setEvidence({
                        job,
                        result: job.result || "",
                        beforePhoto: job.beforePhoto || "",
                        afterPhoto: job.afterPhoto || "",
                      })
                    }
                  >
                    <Send className="h-4 w-4" />
                    Isi Hasil
                  </button>
                )}
                {supervisor && job.status === "SUBMITTED" && (
                  <>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        const reason = window.prompt("Alasan rework");
                        if (reason)
                          void action(`/ga/preventive/jobs/${job.id}/rework`, {
                            reason,
                          });
                      }}
                    >
                      Rework
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() =>
                        void action(`/ga/preventive/jobs/${job.id}/verify`)
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Verifikasi
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        {!jobs.length && (
          <Empty text="Belum ada pekerjaan preventive yang dirilis." />
        )}
      </section>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5"
            onSubmit={create}
          >
            <h2 className="text-lg font-bold">Rencana Preventive</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                ["title", "Nama kegiatan"],
                ["targetDate", "Tanggal target"],
                ["weekNo", "Minggu ke"],
                ["recurrence", "Pengulangan"],
                ["toolsRequired", "Peralatan"],
              ].map(([key, label]) => (
                <label className="block text-sm font-medium" key={key}>
                  {label}
                  <input
                    className="input mt-1"
                    required={key !== "recurrence" && key !== "toolsRequired"}
                    type={
                      key === "targetDate"
                        ? "date"
                        : key === "weekNo"
                          ? "number"
                          : "text"
                    }
                    value={form[key as keyof typeof blank]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
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
                    <option key={area.id} value={area.id}>
                      {area.code} · {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                PIC 1
                <select
                  className="input mt-1"
                  required
                  value={form.pic1Id}
                  onChange={(event) =>
                    setForm({ ...form, pic1Id: event.target.value })
                  }
                >
                  <option value="">Pilih PIC</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.fullname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                PIC 2
                <select
                  className="input mt-1"
                  value={form.pic2Id}
                  onChange={(event) =>
                    setForm({ ...form, pic2Id: event.target.value })
                  }
                >
                  <option value="">Tidak ada</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.fullname}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Prioritas
                <select
                  className="input mt-1"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value })
                  }
                >
                  <option>NORMAL</option>
                  <option>TINGGI</option>
                  <option>KRITIS</option>
                </select>
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Standar pekerjaan
                <textarea
                  className="input mt-1 min-h-28"
                  required
                  value={form.standardWork}
                  onChange={(event) =>
                    setForm({ ...form, standardWork: event.target.value })
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
              <button className="btn-primary">Simpan Draft</button>
            </div>
          </form>
        </div>
      )}
      {evidence && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            className="w-full max-w-xl rounded-2xl bg-white p-5"
            onSubmit={submitEvidence}
          >
            <h2 className="text-lg font-bold">Hasil Pekerjaan</h2>
            <p className="mt-1 text-sm text-slate-500">
              Foto sebelum dan sesudah wajib disertakan sebagai bukti.
            </p>
            <label className="mt-4 block text-sm font-medium">
              Hasil pekerjaan
              <textarea
                className="input mt-1"
                required
                value={evidence.result}
                onChange={(event) =>
                  setEvidence({ ...evidence, result: event.target.value })
                }
              />
            </label>
            {[
              ["beforePhoto", "Foto sebelum"],
              ["afterPhoto", "Foto sesudah"],
            ].map(([key, label]) => (
              <label className="mt-4 block text-sm font-medium" key={key}>
                {label}
                <input
                  className="mt-1 block w-full text-sm"
                  type="file"
                  accept="image/*"
                  required
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setEvidence((value) =>
                        value
                          ? { ...value, [key]: String(reader.result) }
                          : value,
                      );
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            ))}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEvidence(null)}
              >
                Batal
              </button>
              <button className="btn-primary">Kirim Verifikasi</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
