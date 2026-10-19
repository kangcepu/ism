"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/page";

type Device = {
  id: number;
  name: string;
  host: string;
  location: string | null;
  deviceType: string;
  snmpEnabled: boolean;
  lastStatus: string;
  statusFresh: boolean;
  lastCheckedAt: string | null;
  traffic: {
    inBps: number | null;
    outBps: number | null;
    checkedAt: string | null;
    fresh: boolean;
  };
};
type Overview = {
  devices: Device[];
  summary: {
    trafficInBps: number | null;
    trafficOutBps: number | null;
    trafficSources: number;
  };
};
const rate = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} Gbps`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} Mbps`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} Kbps`;
  return `${Math.round(value)} bps`;
};
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
export default function SwitchTrafficPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<Overview>("/monitors/overview"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat traffic.");
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const devices = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.devices || []).filter((row) =>
      [row.name, row.host, row.location, row.deviceType].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    );
  }, [data, query]);
  return (
    <>
      <PageHeader
        title="Switch & Traffic"
        description="Traffic SNMP terkini, status perangkat, dan akses detail port."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Inbound terkini",
            value: rate(data?.summary.trafficInBps ?? null),
            icon: ArrowDownLeft,
            color: "text-cyan-700",
          },
          {
            label: "Outbound terkini",
            value: rate(data?.summary.trafficOutBps ?? null),
            icon: ArrowUpRight,
            color: "text-violet-700",
          },
          {
            label: "Sumber SNMP terkini",
            value: String(data?.summary.trafficSources ?? "—"),
            icon: Activity,
            color: "text-blue-700",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div className="card flex items-center gap-3 p-4" key={label}>
            <span className={`rounded-lg bg-slate-50 p-2 ${color}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-lg font-bold tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <label className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <span className="sr-only">Cari perangkat</span>
            <input
              className="input pl-9"
              placeholder="Cari nama, IP, atau lokasi…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="text-xs text-slate-500">
            Diperbarui otomatis · tampilan setiap 5 detik
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Perangkat",
                  "Status",
                  "Traffic masuk",
                  "Traffic keluar",
                  "Sampel traffic",
                  "Detail",
                ].map((x) => (
                  <th key={x} className="px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {devices.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/monitoring/${row.id}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {row.host}
                      {row.location ? ` · ${row.location}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={row.statusFresh ? row.lastStatus : "unknown"}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-cyan-700">
                    {rate(row.traffic.fresh ? row.traffic.inBps : null)}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-violet-700">
                    {rate(row.traffic.fresh ? row.traffic.outBps : null)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.traffic.fresh
                      ? time(row.traffic.checkedAt)
                      : row.snmpEnabled
                        ? "Belum tersedia"
                        : "SNMP nonaktif"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/monitoring/${row.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      Port &amp; grafik
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data ? (
          <p className="p-5 text-sm text-slate-500">Memuat traffic…</p>
        ) : (
          !devices.length && (
            <p className="p-5 text-sm text-slate-500">
              Perangkat tidak ditemukan.
            </p>
          )
        )}
      </section>
      <p className="mt-3 text-xs text-slate-500">
        Traffic dihitung dari selisih counter SNMP. Angka lama tidak ditampilkan
        sebagai data terkini.
      </p>
    </>
  );
}
