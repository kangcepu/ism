"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";

type Port = {
  id?: string | number;
  name?: string;
  label?: string;
  state?: string;
  vlan_display?: string;
  speed?: string;
};
type Device = {
  id: number;
  name: string;
  config: {
    model?: string;
    ip?: string;
    location?: string;
    ports?: number;
    online?: boolean;
    last_monitor_at?: string;
    last_monitor_message?: string;
    ports_data?: Port[];
  };
};

export default function SwitchDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Device[]>("/switch-remote/devices")
      .then((items) => {
        setDevices(items);
        setSelected(items[0]?.id || null);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Gagal memuat switch."),
      )
      .finally(() => setLoading(false));
  }, []);
  const device = devices.find((item) => item.id === selected);
  if (loading) return <Empty text="Memuat switch…" />;
  return (
    <>
      <PageHeader
        title="Switch Devices"
        description="Daftar switch dan hasil monitoring port yang tersimpan."
      />
      {error && (
        <p role="alert" className="mb-4 text-rose-700">
          {error}
        </p>
      )}
      {!devices.length ? (
        <Empty text="Belum ada switch tersimpan." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <nav aria-label="Daftar switch" className="card h-fit p-2">
            {devices.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setSelected(item.id)}
                aria-current={selected === item.id ? "page" : undefined}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${selected === item.id ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <strong>{item.name}</strong>
                <span className="block text-xs">{item.config.ip || "—"}</span>
              </button>
            ))}
          </nav>
          {device && (
            <section className="card p-5">
              <h2 className="text-lg font-semibold">{device.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {[device.config.model, device.config.ip, device.config.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                {device.config.last_monitor_at
                  ? `Hasil tersimpan: ${new Date(device.config.last_monitor_at).toLocaleString("id-ID")}`
                  : "Belum ada waktu pemeriksaan tersimpan."}{" "}
                {device.config.last_monitor_message || ""}
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3">Port</th>
                      <th className="pr-3">Status</th>
                      <th className="pr-3">VLAN</th>
                      <th>Kecepatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(device.config.ports_data || []).map((port, index) => (
                      <tr key={String(port.id || index)} className="border-b">
                        <td className="py-2 pr-3">
                          {port.label ||
                            port.name ||
                            String(port.id || index + 1)}
                        </td>
                        <td className="pr-3">{port.state || "—"}</td>
                        <td className="pr-3">{port.vlan_display || "—"}</td>
                        <td>{port.speed || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!device.config.ports_data?.length && (
                  <p className="py-4 text-sm text-slate-500">
                    Belum ada data port tersimpan.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
