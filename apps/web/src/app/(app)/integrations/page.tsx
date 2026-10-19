"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/page";

type Settings = Record<string, Record<string, string | null>>;
const integrations = [
  {
    key: "hr",
    name: "HR Directory",
    fields: ["url"],
    href: "/settings",
    detail: "Pengaturan sumber data karyawan.",
  },
  {
    key: "asset_sync",
    name: "Asset Sync",
    fields: ["url"],
    href: "/settings",
    detail: "Pengaturan sumber sinkronisasi aset.",
  },
  {
    key: "storage",
    name: "S3 / MinIO",
    fields: ["endpoint", "bucket"],
    href: "/settings",
    detail: "Pengaturan penyimpanan.",
  },
  {
    key: "smtp",
    name: "SMTP",
    fields: ["host", "port"],
    href: "/settings",
    detail: "Pengaturan email.",
  },
  {
    key: "ollama",
    name: "Ollama",
    fields: ["base_url", "model"],
    href: "/settings",
    detail: "Model untuk AI Assistant.",
  },
] as const;
export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Settings>("/settings")
      .then(setSettings)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Gagal memuat konfigurasi.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <PageHeader
        title="External Integrations"
        description="Lihat konfigurasi integrasi dan buka halaman pengelolaannya."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-slate-500">Memuat konfigurasi…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((item) => {
            const configured = item.fields.every((field) =>
              Boolean(settings[item.key]?.[field]),
            );
            return (
              <section className="card p-5" key={item.key}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{item.name}</h2>
                  <span
                    className={`badge ${configured ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {configured ? "Terisi" : "Belum lengkap"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">{item.detail}</p>
                <Link
                  className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
                  href={item.href}
                >
                  Buka Pengaturan
                </Link>
              </section>
            );
          })}
          <section className="card p-5">
            <h2 className="font-semibold">Active Directory</h2>
            <p className="mt-3 text-sm text-slate-500">
              Konfigurasi dan jelajahi service ADDS.
            </p>
            <Link
              className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
              href="/adds"
            >
              Buka ADDS
            </Link>
          </section>
          <section className="card p-5">
            <h2 className="font-semibold">ZeroTier</h2>
            <p className="mt-3 text-sm text-slate-500">
              Kelola account, network, dan member.
            </p>
            <Link
              className="mt-4 inline-block text-sm font-medium text-blue-700 underline"
              href="/zerotier"
            >
              Buka ZeroTier
            </Link>
          </section>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        Status terisi menunjukkan konfigurasi sudah diisi; status tersebut tidak
        menguji koneksi.
      </p>
    </>
  );
}
