"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CircleAlert,
  CircleCheck,
  Clock3,
  Gauge,
  Network,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/page";

type Device = {
  id: number;
  name: string;
  host: string;
  location: string | null;
  lastStatus: string;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  traffic: { inBps: number | null; outBps: number | null; fresh: boolean };
  temperature: { celsius: number | null; fresh: boolean };
};
type Summary = {
  totalAssets: number;
  statuses: Array<{ status: string; _count: number }>;
  recentActivity: Array<{
    id: number;
    eventType: string;
    createdAt: string;
    asset: { code: string; name: string };
  }>;
  monitoring: {
    total: number;
    online: number;
    attention: number;
    unknown: number;
    averageLatencyMs: number | null;
    trafficInBps: number | null;
    trafficOutBps: number | null;
  };
  network: { devices: Device[] };
};
const rate = (value: number | null) => {
  if (value === null) return "—";
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let index = 0;
  let result = value;
  while (result >= 1000 && index < units.length - 1) {
    result /= 1000;
    index += 1;
  }
  return `${result.toFixed(result >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export default function Dashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    const load = () =>
      api<Summary>("/dashboard/summary")
        .then((result) => {
          setData(result);
          setUpdatedAt(new Date());
        })
        .catch(() => setData(null));
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, []);
  const assetCount = (status: string) =>
    data?.statuses.find((item) => item.status === status)?._count || 0;
  const devices = data?.network.devices || [];
  const attention = devices.filter((device) =>
    ["offline", "degraded", "unknown"].includes(device.lastStatus),
  );
  const metrics: Array<{
    label: string;
    value: string | number;
    icon: typeof Network;
    tone: string;
  }> = [
    {
      label: "Perangkat",
      value: data?.monitoring.total ?? "—",
      icon: Network,
      tone: "text-sky-600",
    },
    {
      label: "Online",
      value: data?.monitoring.online ?? "—",
      icon: CircleCheck,
      tone: "text-emerald-600",
    },
    {
      label: "Perlu perhatian",
      value: data?.monitoring.attention ?? "—",
      icon: CircleAlert,
      tone: "text-amber-600",
    },
    {
      label: "Latency rata-rata",
      value:
        data?.monitoring.averageLatencyMs !== null &&
        data?.monitoring.averageLatencyMs !== undefined
          ? `${data.monitoring.averageLatencyMs.toFixed(1)} ms`
          : "—",
      icon: Gauge,
      tone: "text-violet-600",
    },
  ];
  return (
    <>
      <PageHeader
        title="Network Operations"
        description="Kondisi jaringan dan switch diperbarui otomatis setiap 15 detik."
        actions={
          <Link href="/monitoring" className="btn-secondary">
            Buka Monitoring
          </Link>
        }
      />
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Activity className="h-5 w-5 text-blue-600" /> Status jaringan
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {updatedAt
                ? `Diperbarui ${updatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "Memuat status perangkat…"}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Auto
            refresh aktif
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <Icon className={`h-5 w-5 ${tone}`} />
              <p className="mt-3 text-xs text-slate-600">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-cyan-800">
              <ArrowDownToLine className="h-4 w-4" /> Traffic masuk
            </span>
            <b className="tabular-nums text-cyan-800">
              {rate(data?.monitoring.trafficInBps ?? null)}
            </b>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-violet-800">
              <ArrowUpFromLine className="h-4 w-4" /> Traffic keluar
            </span>
            <b className="tabular-nums text-violet-800">
              {rate(data?.monitoring.trafficOutBps ?? null)}
            </b>
          </div>
        </div>
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Perangkat perlu perhatian</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Offline, degraded, atau status pemeriksaan sudah tidak segar.
              </p>
            </div>
            <Link
              href="/monitoring"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Lihat semua
            </Link>
          </div>
          <div className="divide-y">
            {attention.length ? (
              attention.slice(0, 6).map((device) => (
                <Link
                  key={device.id}
                  href={`/monitoring/${device.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-50 text-rose-600">
                    <WifiOff className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{device.name}</b>
                    <span className="block truncate text-xs text-slate-500">
                      {device.host}
                      {device.location ? ` · ${device.location}` : ""}
                    </span>
                  </span>
                  <StatusBadge value={device.lastStatus} />
                </Link>
              ))
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                <CircleCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                Tidak ada perangkat yang membutuhkan perhatian.
              </div>
            )}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Inventaris singkat</h2>
          <p className="mt-1 text-sm text-slate-500">Status aset saat ini.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-blue-50 p-4">
              <Boxes className="h-5 w-5 text-blue-600" />
              <p className="mt-3 text-xs text-slate-600">Total aset</p>
              <b className="mt-1 block text-2xl">{data?.totalAssets ?? "—"}</b>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <CircleCheck className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs text-slate-600">Tersedia</p>
              <b className="mt-1 block text-2xl">{assetCount("available")}</b>
            </div>
          </div>
          <Link href="/assets" className="btn-secondary mt-4 w-full">
            Kelola Aset
          </Link>
        </section>
      </div>
      <section className="card mt-5 overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Aktivitas aset terbaru</h2>
        </div>
        <div className="divide-y">
          {data?.recentActivity?.length ? (
            data.recentActivity.map((row) => (
              <div key={row.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100">
                  <Clock3 className="h-4 w-4 text-slate-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {row.asset.code} · {row.asset.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(row.createdAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <StatusBadge value={row.eventType} />
              </div>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-slate-400">
              Belum ada aktivitas.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
