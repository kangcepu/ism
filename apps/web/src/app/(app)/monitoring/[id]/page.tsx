"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { monitorTypes } from "@/lib/monitor-types";
import { StatusBadge } from "@/components/page";

type Monitor = {
  id: number;
  name: string;
  host: string;
  deviceType: string;
  location: string | null;
  timeoutMs: number;
  customPorts: number[];
  notes: string | null;
  lastStatus: string;
  latencyMs: string | number | null;
  lastMessage: string | null;
  lastCheckedAt: string | null;
  snmpEnabled: boolean;
  snmpVersion: string | null;
  snmpPort: number;
};
type Vlan = {
  id: number;
  name: string;
  inBps: number | null;
  outBps: number | null;
  interfaceCount: number;
  estimated: boolean;
};
type DeviceOverview = {
  lastStatus: string;
  statusFresh: boolean;
  traffic: {
    inBps: number | null;
    outBps: number | null;
    scope: string | null;
    checkedAt: string | null;
    fresh: boolean;
  };
  temperature: {
    celsius: number | null;
    checkedAt: string | null;
    fresh: boolean;
  };
  openPorts: number[];
  openPortsCheckedAt: string | null;
  vlans: Vlan[];
  vlanCheckedAt: string | null;
  vlanFresh: boolean;
  detailCachedAt: string | null;
};
type Sample = {
  id: string;
  status: string | null;
  latencyMs: number | string | null;
  temperature: number | string | null;
  trafficInBps: string | null;
  trafficOutBps: string | null;
  createdAt: string;
};
type Event = {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  message: string | null;
  startedAt: string;
  endedAt: string | null;
};
type Uptime = { percent: number | null; sampleCount: number };
type Tab = "overview" | "ports" | "sensors" | "vlans" | "history" | "events";
type Chart = "latency" | "traffic" | "temperature";
type Form = {
  name: string;
  host: string;
  deviceType: string;
  location: string;
  timeoutMs: string;
  customPorts: string;
  notes: string;
  snmpEnabled: boolean;
  snmpPort: string;
  snmpCommunity: string;
};
const initialForm: Form = {
  name: "",
  host: "",
  deviceType: "",
  location: "",
  timeoutMs: "",
  customPorts: "",
  notes: "",
  snmpEnabled: false,
  snmpPort: "161",
  snmpCommunity: "",
};
const tabs: [Tab, string][] = [
  ["overview", "Ringkasan"],
  ["ports", "Port switch"],
  ["sensors", "Sensor"],
  ["vlans", "VLAN"],
  ["history", "Riwayat"],
  ["events", "Event"],
];
const stamp = (value: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const rate = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbps`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mbps`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} Kbps`;
  return `${Math.round(value)} bps`;
};
const finite = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Permintaan gagal.";

export default function MonitorDetailPage() {
  const id = String(useParams().id);
  const router = useRouter();
  const { user } = useAuth();
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [telemetry, setTelemetry] = useState<DeviceOverview | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [uptime, setUptime] = useState<Uptime | null>(null);
  const [ports, setPorts] = useState<unknown[]>([]);
  const [sensors, setSensors] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [timingInfo, setTimingInfo] = useState(false);
  const [selected, setSelected] = useState<{
    kind: "ports" | "sensors";
    row: Record<string, unknown>;
  } | null>(null);
  const [form, setForm] = useState<Form>(initialForm);
  const [tab, setTab] = useState<Tab>("overview");
  const [chart, setChart] = useState<Chart>("latency");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try {
      const [
        device,
        deviceOverview,
        history,
        changes,
        availability,
        switchPorts,
        switchSensors,
      ] = await Promise.all([
        api<Monitor>(`/monitors/${id}`),
        api<DeviceOverview>(`/monitors/${id}/overview`),
        api<Sample[]>(`/monitors/${id}/history`),
        api<Event[]>(`/monitors/${id}/events`),
        api<Uptime>(`/monitors/${id}/uptime`),
        api<unknown[]>(`/monitors/${id}/ports`),
        api<unknown[]>(`/monitors/${id}/sensors`),
      ]);
      setMonitor(device);
      setTelemetry(deviceOverview);
      setSamples(history);
      setEvents(changes);
      setUptime(availability);
      setPorts(switchPorts);
      setSensors(switchSensors);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const update = () =>
      setPageSize(Math.max(1, Math.floor(element.clientHeight / 56)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, monitor]);
  async function probe() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await api(`/monitors/${id}/probes`, { method: "POST", body: "{}" });
      await load();
      setNotice("Pengecekan ping dan port selesai.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const customPorts = form.customPorts.trim()
      ? form.customPorts.split(",").map((value) => Number(value.trim()))
      : [];
    if (
      customPorts.some(
        (port) => !Number.isInteger(port) || port < 1 || port > 65535,
      )
    ) {
      setError("Port harus berupa angka antara 1 dan 65535.");
      return;
    }
    if (
      form.snmpEnabled &&
      !monitor?.snmpEnabled &&
      !form.snmpCommunity.trim()
    ) {
      setError("Community SNMP wajib diisi saat mengaktifkan SNMP.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/monitors/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          host: form.host,
          deviceType: form.deviceType,
          location: form.location,
          timeoutMs: Number(form.timeoutMs),
          customPorts,
          notes: form.notes,
          snmpEnabled: form.snmpEnabled,
          snmpVersion: "2c",
          snmpPort: Number(form.snmpPort),
          ...(form.snmpCommunity.trim()
            ? { snmpCommunity: form.snmpCommunity }
            : {}),
        }),
      });
      setEditing(false);
      await load();
      setNotice("Monitor diperbarui.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm("Hapus monitor ini?")) return;
    setBusy(true);
    try {
      await api(`/monitors/${id}`, { method: "DELETE" });
      router.push("/monitoring");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="grid h-[calc(100dvh-7rem)] place-items-center text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Memuat monitor…
      </div>
    );
  if (!monitor)
    return (
      <div className="text-sm text-rose-700" role="alert">
        {error || "Monitor tidak ditemukan."}{" "}
        <Link href="/monitoring" className="text-blue-600 underline">
          Kembali
        </Link>
      </div>
    );

  const values = (sample: Sample): [number | null, number | null] => [
    finite(
      chart === "traffic"
        ? sample.trafficInBps
        : chart === "temperature"
          ? sample.temperature
          : sample.latencyMs,
    ),
    chart === "traffic" ? finite(sample.trafficOutBps) : null,
  ];
  const graph = [...samples]
    .reverse()
    .filter((sample) => values(sample).some((value) => value !== null))
    .slice(-50);
  const max = Math.max(
    1,
    ...graph.flatMap((sample) =>
      values(sample).filter((value): value is number => value !== null),
    ),
  );
  const points = (series: 0 | 1) =>
    graph
      .flatMap((sample, index) => {
        const value = values(sample)[series];
        return value === null
          ? []
          : [
              `${graph.length < 2 ? 0 : (index * 100) / (graph.length - 1)},${100 - (value * 90) / max}`,
            ];
      })
      .join(" ");
  const items: unknown[] =
    tab === "ports"
      ? ports
      : tab === "sensors"
        ? sensors
        : tab === "vlans"
          ? telemetry?.vlans || []
          : tab === "history"
            ? samples
            : tab === "events"
              ? events
              : [];
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const visible = items.slice((current - 1) * pageSize, current * pageSize);
  const first = items.length ? (current - 1) * pageSize + 1 : 0;
  const last = Math.min(current * pageSize, items.length);
  const cards = [
    [
      "Status",
      <StatusBadge key="status" value={telemetry?.lastStatus || "unknown"} />,
    ],
    [
      "Latency",
      !telemetry?.statusFresh || monitor.latencyMs == null
        ? "—"
        : `${monitor.latencyMs} ms`,
    ],
    ["Uptime", uptime?.percent == null ? "—" : `${uptime.percent.toFixed(2)}%`],
    [
      "Traffic masuk",
      rate(telemetry?.traffic.fresh ? telemetry.traffic.inBps : null),
    ],
    [
      "Traffic keluar",
      rate(telemetry?.traffic.fresh ? telemetry.traffic.outBps : null),
    ],
    [
      "Suhu chassis",
      !telemetry?.temperature.fresh || telemetry.temperature.celsius == null
        ? "—"
        : `${telemetry.temperature.celsius} °C`,
    ],
  ];

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col gap-2.5 sm:h-[calc(100dvh-7rem)] sm:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/monitoring"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Monitoring
          </Link>
          <h1 className="truncate text-lg font-bold text-slate-950 sm:text-xl">
            {monitor.name}
          </h1>
          <p className="truncate text-xs text-slate-500 [@media(max-height:650px)]:hidden">
            {monitor.host} · {monitor.deviceType.replaceAll("_", " ")}{" "}
            {monitor.location ? `· ${monitor.location}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => setTimingInfo(true)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
          >
            Waktu data
          </button>
          {user?.role === "admin" && (
            <>
              <button
                disabled={busy}
                onClick={probe}
                title="Jalankan probe ping dan port"
                aria-label="Jalankan probe ping dan port"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={() => {
                  setForm({
                    name: monitor.name,
                    host: monitor.host,
                    deviceType: monitor.deviceType,
                    location: monitor.location || "",
                    timeoutMs: String(monitor.timeoutMs),
                    customPorts: monitor.customPorts.join(", "),
                    notes: monitor.notes || "",
                    snmpEnabled: monitor.snmpEnabled,
                    snmpPort: String(monitor.snmpPort),
                    snmpCommunity: "",
                  });
                  setError("");
                  setEditing(true);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                Edit
              </button>
              <button
                disabled={busy}
                onClick={remove}
                className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700"
              >
                Hapus
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div
            key={String(label)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm [@media(max-height:650px)]:py-1"
          >
            <p className="truncate text-[10px] font-medium text-slate-500">
              {label}
            </p>
            <div className="truncate text-sm font-bold text-slate-900">
              {value}
            </div>
          </div>
        ))}
      </div>
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {error || notice}
        </p>
      )}
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-label="Detail monitoring"
      >
        <div className="shrink-0 border-b border-slate-100 px-3 py-2">
          <label className="sm:hidden">
            <span className="sr-only">Tampilan detail monitoring</span>
            <select
              value={tab}
              onChange={(e) => {
                setTab(e.target.value as Tab);
                setPage(1);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              {tabs.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="hidden flex-wrap gap-1 sm:flex">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
                aria-pressed={tab === key}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "overview" && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-800">
                Riwayat monitoring
              </h2>
              <p className="text-[10px] text-slate-400">
                {samples.length} sampel terakhir
              </p>
            </div>
            <label>
              <span className="sr-only">Pilih metrik grafik</span>
              <select
                value={chart}
                onChange={(e) => setChart(e.target.value as Chart)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
              >
                <option value="latency">Latency</option>
                <option value="traffic">Traffic masuk / keluar</option>
                <option value="temperature">Suhu</option>
              </select>
            </label>
          </div>
        )}
        <div ref={listRef} className="min-h-0 flex-1 overflow-hidden">
          {tab === "overview" ? (
            <div className="flex h-full flex-col px-4 py-3">
              <div className="grid shrink-0 grid-cols-2 gap-2 text-[11px] text-slate-600 lg:grid-cols-4">
                <p className="truncate" title={monitor.lastMessage || ""}>
                  <span className="text-slate-400">Hasil probe:</span>{" "}
                  {monitor.lastMessage || "—"}
                </p>
                <p className="truncate">
                  <span className="text-slate-400">Probe:</span>{" "}
                  {stamp(monitor.lastCheckedAt)}
                </p>
                <p className="truncate">
                  <span className="text-slate-400">
                    Port terbuka tersimpan:
                  </span>{" "}
                  {telemetry?.openPorts.join(", ") || "—"}
                </p>
                <p className="truncate">
                  <span className="text-slate-400">Port dicek:</span>{" "}
                  {stamp(telemetry?.openPortsCheckedAt || null)}
                </p>
              </div>
              {graph.length ? (
                <div className="mt-3 flex min-h-0 flex-1 flex-col">
                  <svg
                    role="img"
                    aria-label={`Grafik ${chart} sampel terakhir`}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="min-h-0 w-full flex-1 border-b border-l border-slate-200"
                  >
                    <polyline
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                      points={points(0)}
                    />
                    {chart === "traffic" && (
                      <polyline
                        fill="none"
                        stroke="#a855f7"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        points={points(1)}
                      />
                    )}
                  </svg>
                  <p className="mt-2 shrink-0 text-[11px] text-slate-500">
                    Maksimum{" "}
                    {chart === "traffic"
                      ? rate(max)
                      : `${max} ${chart === "temperature" ? "°C" : "ms"}`}{" "}
                    · {graph.length} sampel
                    {chart === "traffic" ? " · Biru: masuk, ungu: keluar" : ""}
                  </p>
                </div>
              ) : (
                <p className="grid flex-1 place-items-center text-xs text-slate-400">
                  Belum ada sampel untuk metrik ini.
                </p>
              )}
            </div>
          ) : visible.length ? (
            visible.map((entry, index) => {
              const row = record(entry);
              let primary = "";
              let secondary = "";
              let right = "";
              let rightSecondary = "";
              if (tab === "ports") {
                primary = text(row.label || row.name || row.index);
                secondary = `${text(row.scope)} · ${text(row.alias)}`;
                right = `${text(row.oper_state)} · ${finite(row.speed_mbps) === null ? "—" : `${row.speed_mbps} Mbps tersimpan`}`;
                rightSecondary = `IN ${rate(telemetry?.traffic.fresh ? finite(row.in_bps) : null)} · OUT ${rate(telemetry?.traffic.fresh ? finite(row.out_bps) : null)}`;
              }
              if (tab === "sensors") {
                primary = text(row.name);
                secondary = `${text(row.scope)} · ${text(row.type)}`;
                right = text(row.display ?? row.value);
                rightSecondary = text(row.status);
              }
              if (tab === "vlans") {
                primary = `VLAN ${text(row.id)} · ${text(row.name)}`;
                secondary = `${text(row.interfaceCount)} port${row.estimated ? " · estimasi" : ""}`;
                right = `IN ${rate(telemetry?.vlanFresh ? finite(row.inBps) : null)}`;
                rightSecondary = `OUT ${rate(telemetry?.vlanFresh ? finite(row.outBps) : null)}`;
              }
              if (tab === "history") {
                primary = stamp(text(row.createdAt));
                secondary = `${text(row.status)} · ${finite(row.latencyMs) === null ? "—" : `${row.latencyMs} ms`} · ${finite(row.temperature) === null ? "—" : `${row.temperature} °C`}`;
                right = `IN ${rate(finite(row.trafficInBps))}`;
                rightSecondary = `OUT ${rate(finite(row.trafficOutBps))}`;
              }
              if (tab === "events") {
                primary = `${text(row.previousStatus)} → ${text(row.newStatus)}`;
                secondary = text(row.message);
                right = stamp(text(row.startedAt));
                rightSecondary = row.endedAt
                  ? `Selesai: ${stamp(text(row.endedAt))}`
                  : "Belum selesai";
              }
              return (
                <div
                  key={String(row.id ?? row.index ?? index)}
                  className="relative flex h-14 items-center justify-between gap-4 border-b border-slate-100 px-3 sm:px-4"
                >
                  {(tab === "ports" || tab === "sensors") && (
                    <button
                      type="button"
                      onClick={() => setSelected({ kind: tab, row })}
                      aria-label={`Lihat detail ${primary}`}
                      className="absolute inset-0 rounded text-left hover:bg-blue-50/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {primary}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {secondary}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="truncate text-xs font-semibold text-slate-700">
                      {right}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {rightSecondary}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="grid h-full place-items-center text-xs text-slate-400">
              Belum ada data tersimpan.
            </div>
          )}
        </div>
        {tab !== "overview" && (
          <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-3 py-2 sm:px-4">
            <p className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">
                {first}–{last}
              </span>{" "}
              dari {items.length} data
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                {current} / {pages}
              </span>
              <button
                onClick={() => setPage(current - 1)}
                disabled={current <= 1}
                aria-label="Halaman sebelumnya"
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(current + 1)}
                disabled={current >= pages}
                aria-label="Halaman berikutnya"
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
      <p
        className="shrink-0 truncate text-[10px] text-slate-500"
        title={`Traffic: ${stamp(telemetry?.traffic.checkedAt || null)}; suhu: ${stamp(telemetry?.temperature.checkedAt || null)}; port: ${stamp(telemetry?.detailCachedAt || null)}; VLAN: ${stamp(telemetry?.vlanCheckedAt || null)}; detail sensor berasal dari data tersimpan`}
      >
        Diperbarui otomatis · Traffic{" "}
        {stamp(telemetry?.traffic.checkedAt || null)} · Suhu{" "}
        {stamp(telemetry?.temperature.checkedAt || null)} · Port{" "}
        {stamp(telemetry?.detailCachedAt || null)} · VLAN{" "}
        {stamp(telemetry?.vlanCheckedAt || null)}
      </p>
      {timingInfo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-timing-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2
                id="monitor-timing-title"
                className="font-bold text-slate-900"
              >
                Waktu data perangkat
              </h2>
              <button
                type="button"
                onClick={() => setTimingInfo(false)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Status, traffic, dan status port diperbarui berkala. Kecepatan
              port dan detail sensor lain masih berasal dari data tersimpan.
            </p>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                ["Probe terakhir", monitor.lastCheckedAt],
                ["Port terbuka", telemetry?.openPortsCheckedAt],
                ["Traffic SNMP", telemetry?.traffic.checkedAt],
                ["Suhu chassis", telemetry?.temperature.checkedAt],
                ["Traffic VLAN", telemetry?.vlanCheckedAt],
                ["Detail port", telemetry?.detailCachedAt],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {stamp(value || null)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="monitor-data-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="monitor-data-title"
                className="truncate font-bold text-slate-900"
              >
                {selected.kind === "ports" ? "Detail port" : "Detail sensor"} ·{" "}
                {text(selected.row.label || selected.row.name)}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {selected.kind === "sensors"
                ? "Detail sensor berasal dari data tersimpan."
                : `Status dan counter port: ${stamp(telemetry?.detailCachedAt || null)}. Kecepatan dan atribut lain berasal dari data tersimpan.`}
            </p>
            <dl className="mt-4 divide-y divide-slate-100 text-xs">
              {Object.entries(selected.row)
                .flatMap(([key, value]) =>
                  key === "meta"
                    ? Object.entries(record(value)).map(
                        ([subKey, subValue]) =>
                          [
                            `Sensor ${subKey.replaceAll("_", " ")}`,
                            subValue,
                          ] as const,
                      )
                    : [[key.replaceAll("_", " "), value] as const],
                )
                .map(([key, value]) => (
                  <div key={key} className="grid grid-cols-2 gap-4 py-2">
                    <dt className="capitalize text-slate-500">{key}</dt>
                    <dd className="break-words text-right font-medium text-slate-800">
                      {typeof value === "boolean"
                        ? value
                          ? "Ya"
                          : "Tidak"
                        : typeof value === "object" && value !== null
                          ? JSON.stringify(value)
                          : key === "in bps" || key === "out bps"
                            ? rate(finite(value))
                            : text(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-monitor-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="edit-monitor-title" className="text-lg font-bold">
                Edit monitor
              </h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <p role="alert" className="mb-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Nama"],
                  ["host", "Host / IP"],
                  ["location", "Lokasi"],
                  ["timeoutMs", "Timeout (ms)"],
                  ["customPorts", "Port (pisahkan koma)"],
                  ["notes", "Catatan"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    {label}
                  </span>
                  <input
                    required={[
                      "name",
                      "host",
                      "deviceType",
                      "timeoutMs",
                    ].includes(key)}
                    type={key === "timeoutMs" ? "number" : "text"}
                    min={key === "timeoutMs" ? 250 : undefined}
                    max={key === "timeoutMs" ? 30000 : undefined}
                    className="input"
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Tipe perangkat
                </span>
                <select
                  required
                  className="input"
                  value={form.deviceType}
                  onChange={(e) =>
                    setForm({ ...form, deviceType: e.target.value })
                  }
                >
                  {!monitorTypes.some(
                    ([value]) => value === form.deviceType,
                  ) && (
                    <option value={form.deviceType}>{form.deviceType}</option>
                  )}
                  {monitorTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.snmpEnabled}
                onChange={(e) =>
                  setForm({ ...form, snmpEnabled: e.target.checked })
                }
              />{" "}
              Konfigurasi SNMP v2c
            </label>
            {form.snmpEnabled && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Port SNMP
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    required
                    className="input"
                    value={form.snmpPort}
                    onChange={(e) =>
                      setForm({ ...form, snmpPort: e.target.value })
                    }
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Community SNMP
                  </span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Kosongkan untuk mempertahankan"
                    className="input"
                    value={form.snmpCommunity}
                    onChange={(e) =>
                      setForm({ ...form, snmpCommunity: e.target.value })
                    }
                  />
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Community disimpan terenkripsi. Pembacaan SNMP otomatis belum
                  tersedia.
                </p>
              </div>
            )}
            <div className="mt-5 flex justify-between gap-2 border-t pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="text-xs font-semibold text-rose-700 sm:hidden"
              >
                Hapus monitor
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary"
                >
                  Batal
                </button>
                <button disabled={busy} className="btn-primary">
                  Simpan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
