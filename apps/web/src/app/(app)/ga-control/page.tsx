"use client";
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
const blankAngle = { cameraName: "", coverage: "", gapDescription: "" };
const blankReconciliation = {
  ticketNumber: "",
  securityTime: "",
  cctvTime: "",
  cameraName: "",
  plateNumber: "",
  discrepancyReason: "",
};
const blankFinding = {
  title: "",
  description: "",
  source: "GA",
  severity: "MEDIUM",
  dueDate: "",
};
export default function GaControlPage() {
  const [tab, setTab] = useState("dashboard"),
    [data, setData] = useState<any>({}),
    [form, setForm] = useState<any>({}),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [dashboard, angles, reconciliations, findings] = await Promise.all([
        api<any>("/ga/control/dashboard"),
        api<any[]>("/ga/control/angles"),
        api<any[]>("/ga/control/reconciliations"),
        api<any[]>("/ga/control/findings"),
      ]);
      setData({ dashboard, angles, reconciliations, findings });
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data GA gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(path: string) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(form) });
      setForm({});
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data gagal disimpan.");
    }
  }
  async function action(path: string) {
    try {
      await api(path, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Aksi gagal.");
    }
  }
  const fields = (items: string[]) =>
    items.map((k) => (
      <label key={k}>
        <span className="label">{k}</span>
        <input
          className="input"
          required
          value={form[k] || ""}
          type={k.toLowerCase().includes("time") ? "datetime-local" : "text"}
          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        />
      </label>
    ));
  return (
    <>
      <PageHeader
        title="GA Control & Audit"
        description="CCTV angle, rekonsiliasi timbangan, finding, tindak lanjut, dan ringkasan operasional GA."
      />
      {error && (
        <p className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["dashboard", "Dashboard"],
          ["angles", "CCTV Angle"],
          ["reconciliations", "Timbangan"],
          ["findings", "Finding"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setForm({});
            }}
            className={tab === id ? "btn-primary" : "btn-secondary"}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "dashboard" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.dashboard || {}).map(([k, v]) => (
            <section className="card p-4" key={k}>
              <p className="text-sm text-slate-500">{k}</p>
              <b className="text-2xl">{String(v)}</b>
            </section>
          ))}
        </div>
      )}
      {tab === "angles" && (
        <section className="card p-5">
          <h2 className="font-semibold">Inspeksi Angle & Coverage</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create("/ga/control/angles");
            }}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            {fields(["cameraName", "coverage", "gapDescription"])}
            <button className="btn-primary self-end">Simpan Inspeksi</button>
          </form>
          <div className="mt-5 divide-y">
            {(data.angles || []).map((x: any) => (
              <div
                className="flex items-center justify-between py-3"
                key={x.id}
              >
                <span>
                  <b>{x.cameraName}</b>
                  <small className="block text-slate-500">
                    {x.coverage || "Belum ada coverage"}{" "}
                    {x.gapDescription && `· ${x.gapDescription}`}
                  </small>
                </span>
                <div className="flex gap-2">
                  <StatusBadge value={x.status} />
                  {x.status === "INSPECTED" && (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void action(`/ga/control/angles/${x.id}/match`)
                        }
                      >
                        Sesuai
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          void action(`/ga/control/angles/${x.id}/gap`)
                        }
                      >
                        Gap
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "reconciliations" && (
        <section className="card p-5">
          <h2 className="font-semibold">
            Rekonsiliasi CCTV Timbangan & Security
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create("/ga/control/reconciliations");
            }}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            {fields([
              "ticketNumber",
              "securityTime",
              "cctvTime",
              "cameraName",
              "plateNumber",
              "discrepancyReason",
            ])}
            <button className="btn-primary self-end">Rekonsiliasi</button>
          </form>
          <div className="mt-5 divide-y">
            {(data.reconciliations || []).map((x: any) => (
              <div
                className="flex items-center justify-between py-3"
                key={x.id}
              >
                <span>
                  <b>{x.ticketNumber}</b>
                  <small className="block text-slate-500">
                    {x.cameraName} · {x.plateNumber || "—"} · selisih{" "}
                    {x.durationMinutes || 0} menit
                  </small>
                </span>
                <div className="flex gap-2">
                  <StatusBadge value={x.status} />
                  {x.status !== "VERIFIED" && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void action(
                          `/ga/control/reconciliations/${x.id}/verify`,
                        )
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Verifikasi
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "findings" && (
        <section className="card p-5">
          <h2 className="font-semibold">Finding & Follow-Up</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create("/ga/control/findings");
            }}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            {fields(["title", "description", "source", "severity", "dueDate"])}
            <button className="btn-primary self-end">Buat Finding</button>
          </form>
          <div className="mt-5 divide-y">
            {(data.findings || []).map((x: any) => (
              <div
                className="flex items-center justify-between py-3"
                key={x.id}
              >
                <span>
                  <b>
                    {x.code} · {x.title}
                  </b>
                  <small className="block text-slate-500">
                    {x.description}
                  </small>
                </span>
                <div className="flex gap-2">
                  <StatusBadge value={x.status} />
                  {x.status === "OPEN" && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void action(`/ga/control/findings/${x.id}/start`)
                      }
                    >
                      Proses
                    </button>
                  )}
                  {x.status === "IN_PROGRESS" && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void action(`/ga/control/findings/${x.id}/resolve`)
                      }
                    >
                      Selesai
                    </button>
                  )}
                  {x.status === "RESOLVED" && (
                    <button
                      className="btn-primary"
                      onClick={() =>
                        void action(`/ga/control/findings/${x.id}/close`)
                      }
                    >
                      Tutup
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!(data.findings || []).length && <Empty text="Belum ada finding." />}
        </section>
      )}
    </>
  );
}
