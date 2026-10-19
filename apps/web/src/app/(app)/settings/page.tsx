"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, API } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";

type Field = {
  key: string;
  label: string;
  type?: "text" | "password" | "number" | "url" | "email" | "boolean" | "select";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
};
type Group = { key: string; label: string; fields: Field[] };
type Settings = Record<string, Record<string, string | null>>;
const groups: Group[] = [
  {
    key: "general",
    label: "Umum",
    fields: [
      { key: "app_name", label: "Nama Aplikasi" },
      { key: "app_subtitle", label: "Subjudul" },

      {
        key: "default_user_role",
        label: "Role Default",
        type: "select",
        options: [
          { value: "user", label: "User" },
          { value: "admin", label: "Administrator" },
        ],
      },
    ],
  },
  {
    key: "alerts",
    label: "Alerts",
    fields: [
      { key: "enabled", label: "Aktifkan Alert", type: "boolean" },
      { key: "threshold", label: "Threshold Suhu", type: "number" },
      { key: "hysteresis", label: "Hysteresis", type: "number", min: 0 },
      { key: "recipients", label: "Email Penerima" },
    ],
  },
  {
    key: "smtp",
    label: "SMTP",
    fields: [
      { key: "host", label: "Host" },
      { key: "port", label: "Port", type: "number", min: 1, max: 65535 },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", type: "password" },
      { key: "encryption", label: "Enkripsi" },
      { key: "from_email", label: "Email Pengirim", type: "email" },
      { key: "from_name", label: "Nama Pengirim" },
    ],
  },
  {
    key: "storage",
    label: "Storage",
    fields: [
      { key: "endpoint", label: "Endpoint", type: "url" },
      { key: "region", label: "Region" },
      { key: "bucket", label: "Bucket" },
      { key: "access_key", label: "Access Key", type: "password" },
      { key: "secret_key", label: "Secret Key", type: "password" },
    ],
  },
  {
    key: "hr",
    label: "HR Directory",
    fields: [
      { key: "enabled", label: "Aktifkan", type: "boolean" },
      { key: "url", label: "URL API", type: "url" },
      { key: "api_key", label: "API Key", type: "password" },
      {
        key: "search_path",
        label: "Path pencarian (pisahkan dengan koma)",
        placeholder: "Default: employee-uc, employee-ru, employee",
      },
      { key: "method", label: "Metode HTTP", placeholder: "GET" },
      {
        key: "key_header",
        label: "Header API Key",
        placeholder: "Authorization",
      },
      { key: "key_prefix", label: "Prefix API Key", placeholder: "Bearer" },
      {
        key: "query_param",
        label: "Parameter pencarian",
        placeholder: "keyword",
      },
      { key: "result_path", label: "Path hasil JSON", placeholder: "Otomatis" },
      { key: "field_name", label: "Field nama", placeholder: "Otomatis" },
      { key: "field_code", label: "Field kode", placeholder: "Otomatis" },
      { key: "field_company", label: "Field company", placeholder: "Otomatis" },
      {
        key: "timeout_ms",
        label: "Timeout (ms)",
        type: "number",
        min: 1000,
        max: 60000,
        placeholder: "5000",
      },
      {
        key: "cache_ttl_seconds",
        label: "Cache (detik)",
        type: "number",
        min: 0,
        max: 3600,
        placeholder: "300",
      },
      {
        key: "verify_tls",
        label: "Verifikasi sertifikat TLS",
        type: "boolean",
      },
    ],
  },
  {
    key: "monitoring",
    label: "Network Monitoring",
    fields: [
      {
        key: "traffic_poll_seconds",
        label: "Interval polling switch (detik)",
        type: "number",
        min: 10,
        max: 300,
        placeholder: "15",
      },
    ],
  },
  {
    key: "asset_sync",
    label: "Asset Sync",
    fields: [
      { key: "enabled", label: "Aktifkan", type: "boolean" },
      { key: "url", label: "URL API", type: "url" },
      { key: "api_key", label: "API Key", type: "password" },
      { key: "key_header", label: "Header API Key", placeholder: "x-api-key" },
      {
        key: "timeout_ms",
        label: "Timeout (ms)",
        type: "number",
        min: 1000,
        max: 60000,
      },
      {
        key: "default_location_id",
        label: "ID Lokasi Default",
        type: "number",
        min: 1,
      },
    ],
  },
  {
    key: "adds",
    label: "ADDS",
    fields: [
      { key: "default_service", label: "Service Default" },
      { key: "auto_sync", label: "Sinkronisasi Otomatis", type: "boolean" },
      { key: "interval", label: "Interval", type: "number", min: 1 },
      {
        key: "auto_create_users",
        label: "Buat User Otomatis",
        type: "boolean",
      },
      { key: "default_email_domain", label: "Domain Email Default" },
      { key: "account_suffix", label: "Account Suffix" },
      { key: "notes", label: "Catatan" },
    ],
  },
  {
    key: "zerotier",
    label: "ZeroTier",
    fields: [{ key: "token", label: "Token", type: "password" }],
  },
  {
    key: "ollama",
    label: "Ollama",
    fields: [
      { key: "base_url", label: "Base URL", type: "url" },
      { key: "model", label: "Model Default" },
    ],
  },
];
const mask = "••••••••";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [group, setGroup] = useState(groups[0].key);
  const [clear, setClear] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const current = groups.find((item) => item.key === group)!;
  useEffect(() => {
    api<Settings>("/settings")
      .then(setSettings)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Gagal memuat pengaturan.",
        ),
      )
      .finally(() => setLoading(false));
    api<{ logoUrl: string | null }>("/public/branding")
      .then((branding) => setLogoUrl(branding.logoUrl))
      .catch(() => setLogoUrl(null));
  }, []);
  function update(key: string, value: string) {
    if (group === "ollama" && key === "base_url") setModels(null);
    setSettings((old) => ({
      ...old,
      [group]: { ...old[group], [key]: value },
    }));
    setClear((old) => old.filter((item) => item !== `${group}.${key}`));
    setNotice("");
  }
  async function uploadLogo(file?: File) {
    if (!file) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("logo", file);
      const result = await api<{ logoUrl: string }>("/settings/branding/logo", {
        method: "POST",
        body: form,
      });
      setLogoUrl(result.logoUrl);
      setLogoVersion(Date.now());
      window.dispatchEvent(new Event("branding-updated"));
      setNotice("Logo aplikasi berhasil diperbarui.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Logo gagal diunggah.");
    } finally {
      setSaving(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify({
          settings: { [group]: settings[group] || {} },
          clearSecrets: clear.filter((item) => item.startsWith(`${group}.`)),
        }),
      });
      setSettings(saved);
      setClear([]);
      if (group === "general")
        window.dispatchEvent(new Event("branding-updated"));
      setNotice("Pengaturan tersimpan.");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal menyimpan pengaturan.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function checkOllama() {
    setChecking(true);
    setError("");
    try {
      const result = await api<{ models: { name: string }[] }>(
        "/settings/ollama/models",
      );
      setModels(result.models.map((item) => item.name));
      setNotice(
        "Koneksi Ollama berhasil. Daftar model menggunakan pengaturan yang tersimpan.",
      );
    } catch (e) {
      setModels(null);
      setError(e instanceof ApiError ? e.message : "Gagal memeriksa Ollama.");
    } finally {
      setChecking(false);
    }
  }
  async function checkStorage() {
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ reachable: boolean; message: string }>(
        "/settings/storage/test",
      );
      if (result.reachable)
        setNotice(`${result.message} Menggunakan pengaturan yang tersimpan.`);
      else setError(result.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memeriksa storage.");
    } finally {
      setChecking(false);
    }
  }
  async function testEmail() {
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ recipient: string }>("/settings/test-email", {
        method: "POST",
      });
      setNotice(
        `Email uji dikirim ke ${result.recipient} menggunakan konfigurasi yang tersimpan.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengirim email uji.");
    } finally {
      setChecking(false);
    }
  }
  async function checkHr() {
    setChecking(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        enabled: boolean;
        reachable: boolean;
        partial: boolean;
        matched: number;
      }>("/hr/test?q=a&limit=10");
      if (!result.enabled)
        setError(
          "HR Directory belum aktif. Simpan pengaturan terlebih dahulu.",
        );
      else if (!result.reachable)
        setError("HR Directory tidak dapat dihubungi.");
      else
        setNotice(
          `Koneksi HR berhasil${result.partial ? ", tetapi sebagian sumber tidak merespons" : ""}. ${result.matched} karyawan ditemukan. Menggunakan pengaturan yang tersimpan.`,
        );
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal memeriksa HR Directory.",
      );
    } finally {
      setChecking(false);
    }
  }
  if (loading) return <Empty text="Memuat pengaturan…" />;
  return (
    <>
      <PageHeader
        title="Application Settings"
        description="Atur branding dan konfigurasi integrasi."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Grup pengaturan" className="card h-fit p-2">
          {groups.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setGroup(item.key);
                setError("");
                setNotice("");
              }}
              aria-current={group === item.key ? "page" : undefined}
              className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${group === item.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <form onSubmit={save} className="card p-5">
          <h2 className="font-semibold">{current.label}</h2>
          {group === "general" && (
            <section className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-200">
                  {logoUrl ? (
                    <img
                      src={`${API}/public/branding/logo?v=${logoVersion}`}
                      alt="Logo aplikasi"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <span className="text-xs text-slate-300">Belum ada</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">Logo aplikasi</p>
                  <p className="mt-1 text-xs text-slate-500">
                    PNG, JPG, WEBP, atau SVG. Maksimal 2 MB.
                  </p>
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(event) =>
                      void uploadLogo(event.target.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    className="btn-secondary mt-3"
                    disabled={saving}
                    onClick={() => logoInput.current?.click()}
                  >
                    {saving ? "Mengunggah…" : "Pilih File Logo"}
                  </button>
                </div>
              </div>
            </section>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {current.fields.map((field) => {
              const value = settings[group]?.[field.key] || "";
              const clearing = clear.includes(`${group}.${field.key}`);
              if (group === "ollama" && field.key === "model" && models)
                return (
                  <label key={field.key}>
                    <span className="label">Model Default</span>
                    <select
                      className="input"
                      value={value}
                      onChange={(e) => update(field.key, e.target.value)}
                    >
                      <option value="">Pilih model</option>
                      {value && !models.includes(value) && (
                        <option value={value}>{value} (tidak tersedia)</option>
                      )}
                      {models.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              if (field.type === "boolean")
                return (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={
                        value === "true" ||
                        (group === "hr" &&
                          field.key === "verify_tls" &&
                          value === "")
                      }
                      onChange={(e) =>
                        update(field.key, String(e.target.checked))
                      }
                    />
                    {field.label}
                  </label>
                );
              if (field.type === "select")
                return (
                  <label key={field.key}>
                    <span className="label">{field.label}</span>
                    <select
                      className="input"
                      value={value}
                      onChange={(e) => update(field.key, e.target.value)}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              return (
                <label key={field.key}>
                  <span className="label">{field.label}</span>
                  <input
                    type={field.type || "text"}
                    min={field.min}
                    max={field.max}
                    className="input"
                    value={value === mask || clearing ? "" : value}
                    placeholder={
                      value === mask && !clearing
                        ? "Tersimpan (kosongkan untuk mempertahankan)"
                        : field.placeholder || ""
                    }
                    onChange={(e) => update(field.key, e.target.value)}
                  />
                  {field.type === "password" && value === mask && (
                    <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={clearing}
                        onChange={(e) =>
                          setClear((old) =>
                            e.target.checked
                              ? [...old, `${group}.${field.key}`]
                              : old.filter(
                                  (item) => item !== `${group}.${field.key}`,
                                ),
                          )
                        }
                      />
                      Hapus secret tersimpan
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          {group === "monitoring" && (
            <p className="mt-4 text-xs text-slate-500">
              Nilai minimum 10 detik. Polling berlangsung maksimal empat switch
              secara paralel dan siklus berikutnya menunggu siklus aktif
              selesai.
            </p>
          )}
          {group === "hr" && (
            <div className="mt-5">
              <button
                type="button"
                className="btn-secondary"
                disabled={checking}
                onClick={() => void checkHr()}
              >
                {checking ? "Memeriksa…" : "Tes Koneksi HR Directory"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Tes memakai pengaturan yang sudah disimpan.
              </p>
            </div>
          )}
          {group === "smtp" && (
            <div className="mt-5">
              <button
                type="button"
                className="btn-secondary"
                disabled={checking}
                onClick={() => void testEmail()}
              >
                {checking ? "Mengirim…" : "Kirim Email Uji"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Email uji dikirim ke alamat email akun admin menggunakan
                konfigurasi yang sudah disimpan.
              </p>
            </div>
          )}
          {group === "storage" && (
            <div className="mt-5">
              <button
                type="button"
                className="btn-secondary"
                disabled={checking}
                onClick={() => void checkStorage()}
              >
                {checking ? "Memeriksa…" : "Tes Koneksi MinIO / S3"}
              </button>
            </div>
          )}
          {group === "ollama" && (
            <div className="mt-5">
              <button
                type="button"
                className="btn-secondary"
                disabled={checking}
                onClick={() => void checkOllama()}
              >
                {checking ? "Memeriksa…" : "Tes Koneksi dan Daftar Model"}
              </button>
              {models && (
                <p className="mt-2 text-sm text-slate-500">
                  {models.length
                    ? `${models.length} model tersedia. Pilih model default di atas, lalu simpan pengaturan.`
                    : "Belum ada model pada server."}
                </p>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-end border-t pt-4">
            <button disabled={saving} className="btn-primary">
              {saving ? "Menyimpan…" : "Simpan Pengaturan"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
