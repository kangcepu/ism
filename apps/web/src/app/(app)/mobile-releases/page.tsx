"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { API, api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";

type Release = {
  id: number;
  versionName: string;
  versionCode: number;
  notes: string | null;
  forceUpdate: boolean;
  active: boolean;
  originalName: string;
  size: number;
  checksum: string;
  publishedAt: string | null;
};
export default function MobileReleasesPage() {
  const [rows, setRows] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionCode, setVersionCode] = useState("");
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const load = useCallback(async () => {
    try {
      setRows(await api<Release[]>("/mobile-releases"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat rilis.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("apk", file);
    body.append("versionName", versionName);
    body.append("versionCode", versionCode);
    body.append("notes", notes);
    body.append("forceUpdate", String(force));
    try {
      await api("/mobile-releases", { method: "POST", body });
      setOpen(false);
      setVersionName("");
      setVersionCode("");
      setNotes("");
      setForce(false);
      setFile(null);
      await load();
      setNotice("APK berhasil diunggah.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function update(
    row: Release,
    patch: { active?: boolean; forceUpdate?: boolean },
  ) {
    if (
      !window.confirm(
        patch.active === true
          ? "Publikasikan rilis ini?"
          : patch.active === false
            ? "Nonaktifkan rilis ini?"
            : "Ubah status wajib update?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/mobile-releases/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      setNotice("Rilis diperbarui.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memperbarui rilis.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Mobile Releases"
        description="Upload dan publikasikan aplikasi Android."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Upload APK
          </button>
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
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Versi",
                  "File",
                  "Status",
                  "Force Update",
                  "SHA-256",
                  "Aksi",
                ].map((label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <b>{row.versionName}</b>
                    <p className="text-xs text-slate-500">
                      Build {row.versionCode}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {row.originalName}
                    <p className="text-xs text-slate-500">
                      {(row.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={row.active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">
                    {row.forceUpdate ? "Ya" : "Tidak"}
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 font-mono text-xs"
                    title={row.checksum}
                  >
                    {row.checksum}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`${API}/mobile-releases/${row.id}/download`}
                        className="btn-secondary"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                      <button
                        disabled={busy}
                        onClick={() => update(row, { active: !row.active })}
                        className="btn-secondary"
                      >
                        {row.active ? "Nonaktifkan" : "Publish"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          update(row, { forceUpdate: !row.forceUpdate })
                        }
                        className="btn-secondary"
                      >
                        {row.forceUpdate ? "Hapus Wajib" : "Wajibkan"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? <Empty text="Memuat rilis…" /> : !rows.length && <Empty />}
        </div>
      </section>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-title"
            onSubmit={upload}
            className="w-full max-w-lg rounded-2xl bg-white p-5"
          >
            <h2 id="release-title" className="mb-4 text-lg font-bold">
              Upload APK
            </h2>
            {error && (
              <p role="alert" className="mb-4 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="space-y-4">
              <label className="block">
                <span className="label">Nama Versi</span>
                <input
                  required
                  className="input"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">Nomor Build</span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  className="input"
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">File APK</span>
                <input
                  required
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  className="block w-full text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <label className="block">
                <span className="label">Catatan Rilis</span>
                <textarea
                  className="input h-24 py-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                />
                Wajib update
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
              >
                Batal
              </button>
              <button disabled={busy} className="btn-primary">
                {busy ? "Mengunggah…" : "Upload"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
