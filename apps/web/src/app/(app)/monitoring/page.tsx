"use client";

import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { monitorTypes } from "@/lib/monitor-types";

type Status = "online" | "offline" | "degraded" | "unknown";
type View = "devices" | "vlans" | "temperatures" | "users";
type Vlan = {
  id: number;
  name: string;
  inBps: number | null;
  outBps: number | null;
  interfaceCount: number;
  estimated: boolean;
  available: boolean;
};
type Monitor = {
  id: number;
  name: string;
  host: string;
  deviceType: string;
  location: string | null;
  timeoutMs: number;
  snmpEnabled: boolean;
  lastStatus: string;
  statusFresh: boolean;
  latencyMs: number | null;
  lastMessage: string | null;
  lastCheckedAt: string | null;
  singlePortProbe: boolean;
  openPorts: number[];
  openPortsCheckedAt: string | null;
  traffic: {
    inBps: number | null;
    outBps: number | null;
    scope: string | null;
    interfaceLabel: string | null;
    checkedAt: string | null;
    fresh: boolean;
  };
  temperature: {
    celsius: number | null;
    checkedAt: string | null;
    fresh: boolean;
  };
  cachedPorts: number;
  cachedSensors: number;
  detailCachedAt: string | null;
};
type Overview = {
  devices: Monitor[];
  summary: {
    total: number;
    online: number;
    attention: number;
    unknown: number;
    singlePortProbes: number;
    averageLatencyMs: number | null;
    trafficInBps: number | null;
    trafficOutBps: number | null;
    trafficSources: number;
    trafficOldestAt: string | null;
    trafficNewestAt: string | null;
    vlanOldestAt: string | null;
    vlanNewestAt: string | null;
  };
  vlans: Vlan[];
};
type TopUser = {
  deviceId: number;
  deviceName: string;
  user: string;
  port: string;
  vlanId: number | null;
  vlanEstimated: boolean;
  inBps: number | null;
  outBps: number | null;
  checkedAt: string | null;
};
type TopUsers = {
  users: TopUser[];
  pageInfo: { page: number; perPage: number; total: number; pages: number };
  sourceDevices: number;
  missingDevices: number;
};
type MonitorForm = {
  name: string;
  deviceType: string;
  host: string;
  location: string;
  timeoutMs: string;
  customPorts: string;
  snmpEnabled: boolean;
  snmpPort: string;
  snmpCommunity: string;
};
const emptyForm: MonitorForm = {
  name: "",
  deviceType: "",
  host: "",
  location: "",
  timeoutMs: "3000",
  customPorts: "",
  snmpEnabled: false,
  snmpPort: "161",
  snmpCommunity: "",
};
const labels: Record<Status, string> = {
  online: "Online",
  offline: "Offline",
  degraded: "Degraded",
  unknown: "Unknown",
};
const badges: Record<Status, string> = {
  online: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  offline: "bg-rose-50 text-rose-700 ring-rose-600/10",
  degraded: "bg-amber-50 text-amber-700 ring-amber-600/10",
  unknown: "bg-slate-100 text-slate-600 ring-slate-600/10",
};
const dots: Record<Status, string> = {
  online: "bg-emerald-500",
  offline: "bg-rose-500",
  degraded: "bg-amber-500",
  unknown: "bg-slate-400",
};
const statusOf = (status: string): Status =>
  status === "online" || status === "offline" || status === "degraded"
    ? status
    : "unknown";
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Permintaan gagal. Coba lagi.";
const formatDate = (value: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Belum tersedia";
const rate = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "—";
  const n = Math.max(0, value);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} Gbps`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} Mbps`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} Kbps`;
  return `${Math.round(n)} bps`;
};
const typeLabel = (type: string) =>
  type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function MonitoringPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MonitorForm>(emptyForm);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [deviceType, setDeviceType] = useState("all");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<View>("devices");
  const [topUsers, setTopUsers] = useState<TopUsers | null>(null);
  const [topUsersLoading, setTopUsersLoading] = useState(false);
  const [vlanFilter, setVlanFilter] = useState("all");
  const [usersRefresh, setUsersRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      setOverview(await api<Overview>("/monitors/overview"));
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
      setUsersRefresh((value) => value + 1);
    };
    const interval = window.setInterval(refresh, 5000);
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
  }, []);
  useEffect(() => {
    if (view !== "users") return;
    const controller = new AbortController();
    setTopUsersLoading(true);
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        perPage: String(pageSize),
      });
      if (vlanFilter !== "all") params.set("vlan", vlanFilter);
      api<TopUsers>(`/monitors/top-users?${params}`, {
        signal: controller.signal,
      })
        .then((result) => {
          setTopUsers(result);
          setError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setTopUsersLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [view, query, vlanFilter, page, pageSize, usersRefresh]);

  const rows = overview?.devices || [];
  const deviceTypes = useMemo(
    () => [...new Set(rows.map((row) => row.deviceType))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = rows.filter(
      (row) =>
        (filter === "all" || statusOf(row.lastStatus) === filter) &&
        (deviceType === "all" || row.deviceType === deviceType) &&
        (!term ||
          [row.name, row.host, row.deviceType, row.location].some((value) =>
            value?.toLowerCase().includes(term),
          )),
    );
    const chosenSort = view === "temperatures" ? "temperature" : sort;
    return [...result].sort((a, b) => {
      if (chosenSort === "traffic")
        return (
          (b.traffic.inBps ?? 0) +
          (b.traffic.outBps ?? 0) -
          ((a.traffic.inBps ?? 0) + (a.traffic.outBps ?? 0))
        );
      if (chosenSort === "temperature")
        return (
          (b.temperature.fresh
            ? (b.temperature.celsius ?? -Infinity)
            : -Infinity) -
          (a.temperature.fresh
            ? (a.temperature.celsius ?? -Infinity)
            : -Infinity)
        );
      if (chosenSort === "attention")
        return (
          ["offline", "degraded", "unknown", "online"].indexOf(
            statusOf(a.lastStatus),
          ) -
          ["offline", "degraded", "unknown", "online"].indexOf(
            statusOf(b.lastStatus),
          )
        );
      if (chosenSort === "location")
        return (a.location || "").localeCompare(b.location || "", "id");
      return a.name.localeCompare(b.name, "id", { numeric: true });
    });
  }, [rows, query, filter, deviceType, sort, view]);
  const currentItems = view === "vlans" ? overview?.vlans || [] : filtered;
  const totalItems =
    view === "users" ? topUsers?.pageInfo.total || 0 : currentItems.length;
  const pages =
    view === "users"
      ? topUsers?.pageInfo.pages || 1
      : Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage =
    view === "users" ? topUsers?.pageInfo.page || 1 : Math.min(page, pages);
  const visibleDevices =
    view === "vlans" || view === "users"
      ? []
      : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleVlans =
    view === "vlans"
      ? (overview?.vlans || []).slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        )
      : [];
  const firstRow = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, totalItems);

  async function probe(id: number) {
    setBusyId(id);
    setError("");
    try {
      await api(`/monitors/${id}/probes`, { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ports = form.customPorts.trim()
      ? form.customPorts.split(",").map((value) => Number(value.trim()))
      : [];
    if (
      ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      setFormError(
        "Port harus berupa angka antara 1 dan 65535, pisahkan dengan koma.",
      );
      return;
    }
    if (form.snmpEnabled && !form.snmpCommunity.trim()) {
      setFormError("Community SNMP wajib diisi saat SNMP diaktifkan.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api("/monitors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          deviceType: form.deviceType,
          host: form.host,
          location: form.location,
          timeoutMs: Number(form.timeoutMs),
          customPorts: ports,
          snmpEnabled: form.snmpEnabled,
          ...(form.snmpEnabled
            ? {
                snmpVersion: "2c",
                snmpPort: Number(form.snmpPort),
                snmpCommunity: form.snmpCommunity,
              }
            : {}),
          httpEnabled: false,
        }),
      });
      setModal(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  function exportCsv() {
    const cell = (value: unknown) => {
      const s = String(value ?? "");
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [
      [
        "Nama",
        "Host",
        "Tipe",
        "Lokasi",
        "Status",
        "Latency (ms)",
        "Probe terakhir",
        "Port terbuka tersimpan",
        "Traffic masuk (bps)",
        "Traffic keluar (bps)",
        "Traffic tersimpan",
        "Suhu chassis (C)",
        "Suhu tersimpan",
      ],
      ...filtered.map((row) => [
        row.name,
        row.host,
        row.deviceType,
        row.location,
        row.lastStatus,
        row.latencyMs,
        row.lastCheckedAt,
        row.openPorts.join(", "),
        row.traffic.inBps,
        row.traffic.outBps,
        row.traffic.checkedAt,
        row.temperature.celsius,
        row.temperature.checkedAt,
      ]),
    ]
      .map((line) => line.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "network-monitoring.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  const summary = overview?.summary;
  const cards = [
    {
      label: "Perangkat",
      short: "Total",
      value: summary?.total,
      icon: Server,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Online",
      short: "Online",
      value: summary?.online,
      icon: CheckCircle2,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Perlu perhatian",
      short: "Masalah",
      value: summary?.attention,
      icon: AlertCircle,
      color: "bg-rose-50 text-rose-600",
    },
    {
      label: "Rata-rata latency online",
      short: "Latency",
      value:
        summary?.averageLatencyMs == null
          ? "—"
          : `${summary.averageLatencyMs.toFixed(1)} ms`,
      icon: Gauge,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "Inbound terkini",
      short: "Inbound",
      value: rate(summary?.trafficInBps ?? null),
      icon: ArrowDownLeft,
      color: "bg-cyan-50 text-cyan-600",
    },
    {
      label: "Outbound terkini",
      short: "Outbound",
      value: rate(summary?.trafficOutBps ?? null),
      icon: ArrowUpRight,
      color: "bg-violet-50 text-violet-600",
    },
  ];
  const tabs: [View, string][] = [
    ["devices", "Perangkat"],
    ["vlans", "Traffic VLAN"],
    ["temperatures", "Suhu chassis"],
    ["users", "Traffic pengguna"],
  ];
  const deviceGrid =
    "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.7fr)_130px_100px] lg:grid-cols-[minmax(0,1.7fr)_110px_90px_125px_75px_75px_32px]";

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-0 flex-col gap-2.5 sm:h-[calc(100dvh-7rem)] sm:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 [@media(max-height:650px)]:hidden">
            <Activity className="h-3.5 w-3.5" /> Network operations
          </div>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl [@media(max-height:650px)]:text-base">
            Network Monitoring
          </h1>
          <p className="text-xs text-slate-500 [@media(max-height:650px)]:hidden">
            Status, traffic, port, VLAN, dan suhu perangkat jaringan.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            title="Export data perangkat ke CSV"
            aria-label="Export data perangkat ke CSV"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
          </button>
          {user?.role === "admin" && (
            <button
              onClick={() => {
                setFormError("");
                setModal(true);
              }}
              className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tambah Perangkat</span>
              <span className="sm:hidden">Tambah</span>
            </button>
          )}
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2 lg:grid-cols-6">
        {cards.map(({ label, short, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm sm:px-3 [@media(max-height:650px)]:py-1"
          >
            <span
              className={`hidden h-9 w-9 shrink-0 place-items-center rounded-lg xl:grid [@media(max-height:650px)]:hidden ${color}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium text-slate-500">
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{short}</span>
              </p>
              <p className="truncate text-[13px] font-bold leading-tight tabular-nums text-slate-900 sm:text-lg">
                {loading ? "—" : (value ?? "—")}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="hidden shrink-0 grid-cols-5 gap-2 xl:grid [@media(max-height:750px)]:hidden"
        aria-label="Ringkasan traffic VLAN tersimpan"
      >
        {overview?.vlans.map((vlan) => (
          <button
            key={vlan.id}
            onClick={() => {
              setView("vlans");
              setPage(1);
            }}
            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-blue-200"
          >
            <div className="flex min-w-0 justify-between gap-1">
              <span className="truncate text-[10px] font-bold text-slate-700">
                VLAN {vlan.id}{" "}
                <span className="font-normal text-slate-400">{vlan.name}</span>
              </span>
              <span className="shrink-0 text-[9px] text-slate-400">
                {vlan.estimated ? "Estimasi · " : ""}
                {vlan.interfaceCount} port
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[11px] font-semibold tabular-nums">
              <span className="truncate text-cyan-700">
                IN {rate(vlan.inBps)}
              </span>
              <span className="truncate text-violet-700">
                OUT {rate(vlan.outBps)}
              </span>
            </div>
          </button>
        ))}
      </div>
      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        aria-label="Daftar perangkat monitoring"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
          <label className="min-w-0 flex-1 sm:hidden">
            <span className="sr-only">Tampilan monitoring</span>
            <select
              value={view}
              onChange={(e) => {
                setView(e.target.value as View);
                setPage(1);
              }}
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
            >
              {tabs.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="hidden min-w-0 gap-1 sm:flex"
            aria-label="Tampilan monitoring"
          >
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setView(key);
                  setPage(1);
                }}
                aria-pressed={view === key}
                className={`whitespace-nowrap rounded-lg px-2 py-2 text-[11px] font-semibold sm:px-3 sm:text-xs ${view === key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              void load();
              setUsersRefresh((value) => value + 1);
            }}
            disabled={refreshing}
            title="Muat ulang data tersimpan"
            aria-label="Muat ulang data tersimpan"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
        {view !== "vlans" && (
          <div className="flex shrink-0 gap-2 border-b border-slate-100 px-3 py-2 sm:px-4">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <span className="sr-only">Cari perangkat</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari nama, IP, lokasi..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-2 text-xs outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </label>
            {view === "users" ? (
              <label>
                <span className="sr-only">Filter VLAN</span>
                <select
                  value={vlanFilter}
                  onChange={(e) => {
                    setVlanFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 max-w-[120px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                >
                  <option value="all">Semua VLAN</option>
                  {[1, 40, 50, 70, 80].map((vlan) => (
                    <option key={vlan} value={vlan}>
                      VLAN {vlan}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  <span className="sr-only">Filter status</span>
                  <select
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 max-w-[120px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  >
                    <option value="all">Semua status</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="degraded">Degraded</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="hidden md:block">
                  <span className="sr-only">Filter tipe</span>
                  <select
                    value={deviceType}
                    onChange={(e) => {
                      setDeviceType(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 max-w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600"
                  >
                    <option value="all">Semua tipe</option>
                    {deviceTypes.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hidden lg:block">
                  <span className="sr-only">Urutkan perangkat</span>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(1);
                    }}
                    disabled={view === "temperatures"}
                    className="h-9 max-w-[150px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 disabled:opacity-50"
                  >
                    <option value="name">Nama A–Z</option>
                    <option value="location">Lokasi A–Z</option>
                    <option value="attention">Perlu perhatian</option>
                    <option value="traffic">Traffic tertinggi</option>
                    <option value="temperature">Suhu tertinggi</option>
                  </select>
                </label>
              </>
            )}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700"
          >
            {error}
          </div>
        )}
        {view === "users" ? (
          <div className="grid shrink-0 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-4">
            <span>Pengguna / port</span>
            <span>Inbound</span>
            <span>Outbound</span>
          </div>
        ) : view === "vlans" ? (
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-4">
            <span>VLAN / port</span>
            <span>Inbound</span>
            <span>Outbound</span>
          </div>
        ) : (
          <div
            className={`grid shrink-0 ${deviceGrid} gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-4`}
          >
            <span>Perangkat</span>
            <span>Status</span>
            <span className="hidden sm:block">
              {view === "temperatures" ? "Suhu" : "Latency"}
            </span>
            <span className="hidden lg:block">Traffic IN / OUT</span>
            <span className="hidden lg:block">Suhu</span>
            <span className="hidden lg:block">Port</span>
            <span className="hidden lg:block">Aksi</span>
          </div>
        )}
        <div ref={listRef} className="min-h-0 flex-1 overflow-hidden">
          {loading || (view === "users" && topUsersLoading) ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat perangkat...
            </div>
          ) : view === "users" ? (
            topUsers?.users.length ? (
              topUsers.users.map((entry, index) => (
                <div
                  key={`${entry.deviceId}-${entry.port}-${index}`}
                  className="grid h-14 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/monitoring/${entry.deviceId}`}
                      title={`Cache SNMP: ${formatDate(entry.checkedAt)}`}
                      className="block truncate text-xs font-semibold text-slate-800 hover:text-blue-600"
                    >
                      {entry.user}
                    </Link>
                    <p className="truncate text-[10px] text-slate-400">
                      {entry.deviceName} · {entry.port}
                      {entry.vlanId
                        ? ` · VLAN ${entry.vlanId}${entry.vlanEstimated ? " estimasi" : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="truncate text-xs font-semibold tabular-nums text-cyan-700">
                    {rate(entry.inBps)}
                  </span>
                  <span className="truncate text-xs font-semibold tabular-nums text-violet-700">
                    {rate(entry.outBps)}
                  </span>
                </div>
              ))
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-xs text-slate-400">
                Belum ada traffic pengguna tersimpan untuk filter ini.
              </div>
            )
          ) : view === "vlans" ? (
            visibleVlans.map((vlan) => (
              <div
                key={vlan.id}
                className="grid h-14 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 border-b border-slate-100 px-3 sm:px-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    VLAN {vlan.id} · {vlan.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {vlan.interfaceCount} port{" "}
                    {vlan.estimated
                      ? "· estimasi"
                      : vlan.available
                        ? "· tersimpan"
                        : "· belum tersedia"}
                  </p>
                </div>
                <span className="truncate text-xs font-semibold tabular-nums text-cyan-700">
                  {rate(vlan.inBps)}
                </span>
                <span className="truncate text-xs font-semibold tabular-nums text-violet-700">
                  {rate(vlan.outBps)}
                </span>
              </div>
            ))
          ) : visibleDevices.length ? (
            visibleDevices.map((row) => {
              const status = statusOf(row.lastStatus);
              return (
                <div
                  key={row.id}
                  className={`grid h-14 ${deviceGrid} items-center gap-2 border-b border-slate-100 px-3 hover:bg-slate-50/70 sm:px-4`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href={`/monitoring/${row.id}`}
                        className="truncate text-xs font-semibold text-slate-800 hover:text-blue-600"
                      >
                        {row.name}
                      </Link>
                      {row.snmpEnabled && (
                        <span className="hidden shrink-0 rounded bg-cyan-50 px-1 py-0.5 text-[9px] font-bold text-cyan-700 sm:inline">
                          SNMP
                        </span>
                      )}
                      {user?.role === "admin" && (
                        <Link
                          href={`/monitoring/${row.id}`}
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50"
                          aria-label={`Kelola ${row.name}`}
                        >
                          Kelola
                        </Link>
                      )}
                    </div>
                    <p className="hidden truncate text-[10px] text-slate-400 sm:block">
                      {row.host} · {typeLabel(row.deviceType)}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                    <p className="truncate text-[10px] text-slate-400 sm:hidden">
                      {view === "temperatures"
                        ? `Suhu: ${!row.temperature.fresh || row.temperature.celsius == null ? "—" : `${row.temperature.celsius} °C`} · ${formatDate(row.temperature.checkedAt)}`
                        : `${row.host} · IN ${rate(row.traffic.fresh ? row.traffic.inBps : null)} · OUT ${rate(row.traffic.fresh ? row.traffic.outBps : null)}`}
                    </p>
                  </div>
                  <span className="flex items-center justify-end gap-1 sm:justify-start">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${badges[status]}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${dots[status]}`}
                      />
                      {labels[status]}
                      {!row.statusFresh && (
                        <span title="Menunggu pemeriksaan terbaru">lama</span>
                      )}
                    </span>
                    {user?.role === "admin" && (
                      <button
                        onClick={() => void probe(row.id)}
                        disabled={busyId !== null}
                        aria-label={`Jalankan probe ${row.name}`}
                        title={`Jalankan probe ${row.name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 lg:hidden"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${busyId === row.id ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}
                  </span>
                  <div
                    className="hidden min-w-0 sm:block"
                    title={
                      view === "temperatures"
                        ? `Suhu tersimpan: ${formatDate(row.temperature.checkedAt)}`
                        : `Probe: ${formatDate(row.lastCheckedAt)}${row.lastMessage ? ` · ${row.lastMessage}` : ""}`
                    }
                  >
                    <p className="truncate text-xs font-semibold text-slate-700">
                      {view === "temperatures"
                        ? !row.temperature.fresh ||
                          row.temperature.celsius == null
                          ? "—"
                          : `${row.temperature.celsius} °C`
                        : !row.statusFresh || row.latencyMs == null
                          ? "—"
                          : `${row.latencyMs} ms`}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {view === "temperatures"
                        ? formatDate(row.temperature.checkedAt)
                        : `Timeout ${row.timeoutMs} ms`}
                    </p>
                  </div>
                  <div
                    className="hidden min-w-0 text-[10px] tabular-nums lg:block"
                    title={`Traffic ${row.traffic.fresh ? "terkini" : "lama"}: ${formatDate(row.traffic.checkedAt)} · ${row.traffic.scope || "interface"}`}
                  >
                    <p className="truncate font-semibold text-cyan-700">
                      IN {row.traffic.fresh ? rate(row.traffic.inBps) : "—"}
                    </p>
                    <p className="truncate font-semibold text-violet-700">
                      OUT {row.traffic.fresh ? rate(row.traffic.outBps) : "—"}
                    </p>
                  </div>
                  <span
                    className="hidden text-xs font-semibold text-slate-700 lg:block"
                    title={`Suhu tersimpan: ${formatDate(row.temperature.checkedAt)}`}
                  >
                    {!row.temperature.fresh || row.temperature.celsius == null
                      ? "—"
                      : `${row.temperature.celsius} °C`}
                  </span>
                  <span
                    className="hidden truncate text-xs text-slate-600 lg:block"
                    title={`Port terbuka tersimpan: ${formatDate(row.openPortsCheckedAt)}`}
                  >
                    {row.openPorts.length ? row.openPorts.join(", ") : "—"}
                  </span>
                  <span className="hidden lg:block">
                    {user?.role === "admin" && (
                      <button
                        onClick={() => void probe(row.id)}
                        disabled={busyId !== null}
                        aria-label={`Jalankan probe ${row.name}`}
                        title={`Jalankan probe ${row.name}`}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${busyId === row.id ? "animate-spin" : ""}`}
                        />
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <CircleHelp className="mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {rows.length
                  ? "Perangkat tidak ditemukan"
                  : "Belum ada perangkat"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {rows.length
                  ? "Coba ubah pencarian atau filter."
                  : "Tambahkan monitor untuk mulai melihat perangkat."}
              </p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 sm:px-4">
          <p className="text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">
              {firstRow}–{lastRow}
            </span>{" "}
            dari {totalItems}{" "}
            {view === "vlans"
              ? "VLAN"
              : view === "users"
                ? "port"
                : "perangkat"}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              {currentPage} / {pages}
            </span>
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Halaman sebelumnya"
              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= pages}
              aria-label="Halaman berikutnya"
              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
      <p
        className="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500"
        title={`Traffic: ${formatDate(summary?.trafficOldestAt || null)} – ${formatDate(summary?.trafficNewestAt || null)}; VLAN: ${formatDate(summary?.vlanOldestAt || null)} – ${formatDate(summary?.vlanNewestAt || null)}`}
      >
        <Clock3 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {view === "users"
            ? `Diperbarui otomatis · Identitas berdasarkan label port · ${topUsers?.sourceDevices ?? 0} switch`
            : `Diperbarui otomatis · ${summary?.trafficSources ?? 0} sumber traffic terkini · ${summary?.unknown ?? 0} status belum diketahui`}
        </span>
      </p>
      {modal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(false);
          }}
        >
          <form
            onSubmit={create}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-monitor-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="create-monitor-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Tambah monitor
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Tambahkan perangkat yang ingin dipantau.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(false)}
                aria-label="Tutup"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {formError}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["name", "Nama perangkat", "Contoh: Core Switch"],
                  ["host", "Host / IP", "Contoh: 192.168.1.1"],
                  ["location", "Lokasi", "Contoh: Server Room"],
                  ["timeoutMs", "Timeout (ms)", "3000"],
                  [
                    "customPorts",
                    "Port (pisahkan dengan koma)",
                    "Contoh: 80, 443",
                  ],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key}>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    {label}
                  </span>
                  <input
                    required={[
                      "name",
                      "deviceType",
                      "host",
                      "timeoutMs",
                    ].includes(key)}
                    type={key === "timeoutMs" ? "number" : "text"}
                    min={key === "timeoutMs" ? 250 : undefined}
                    max={key === "timeoutMs" ? 30000 : undefined}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    placeholder={placeholder}
                    className="input"
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
                  <option value="">Pilih tipe perangkat</option>
                  {monitorTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700">
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
                    required
                    autoComplete="off"
                    className="input"
                    value={form.snmpCommunity}
                    onChange={(e) =>
                      setForm({ ...form, snmpCommunity: e.target.value })
                    }
                  />
                </label>
                <p className="text-xs text-slate-500 sm:col-span-2">
                  Community disimpan terenkripsi. SNMP dipoll otomatis jika
                  perangkat dapat dihubungi.
                </p>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="btn-secondary"
              >
                Batal
              </button>
              <button disabled={saving} className="btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
                monitor
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
