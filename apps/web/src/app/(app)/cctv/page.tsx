"use client";
import { useCallback, useEffect, useState } from "react";
import { API, ApiError, api } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";

type Monitor = {
  id: number;
  name: string;
  host: string;
  lastStatus: string;
  lastCheckedAt: string | null;
  deletedAt: string | null;
};
type Camera = {
  id: number;
  code: string;
  sourceMarkerId: string | null;
  name: string;
  site: string;
  zone: string | null;
  status: string;
  coverageArea: string | null;
  channel: number | null;
  recorderId: number | null;
  assetId: number | null;
  monitorId: number | null;
  serial: string | null;
  address: string | null;
  floorPage: number | null;
  x: number | null;
  y: number | null;
  rotation: number | null;
  fieldOfView: number | null;
  retentionDays: number | null;
  recorder: { name: string } | null;
  asset: { code: string } | null;
  monitor: Monitor | null;
};
type Recorder = {
  id: number;
  code: string;
  name: string;
  site: string;
  address: string | null;
  monitorId: number | null;
  capacityGb: number | null;
  freeGb: number | null;
  targetRetentionDays: number | null;
  actualRetentionDays: number | null;
  storageCheckedAt: string | null;
  monitor: Monitor | null;
  _count: { cameras: number };
};
type Task = {
  id: number;
  code: string;
  camera: { id: number; name: string };
  kind: string;
  task: string;
  dueAt: string;
  status: string;
  result: string | null;
};
type Verification = {
  id: number;
  code: string;
  camera: { id: number; name: string };
  actualLocation: string;
  serialMatch: boolean;
  channelMatch: boolean;
  installed: boolean;
  createdAt: string;
};
type Evidence = {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  maintenanceId: number | null;
  verificationId: number | null;
};
type LiveCamera = {
  cameraId: number;
  status: string;
  recording: boolean | null;
  fps: number | null;
  checkedAt: string;
  message: string;
};
type Asset = { id: number; name: string; code: string };
const cameraBlank = {
  name: "",
  site: "",
  zone: "",
  assetId: "",
  recorderId: "",
  monitorId: "",
  channel: "",
  serial: "",
  address: "",
  coverageArea: "",
  floorPage: "",
  x: "",
  y: "",
  rotation: "",
  fieldOfView: "",
  retentionDays: "",
};
const recorderBlank = {
  name: "",
  site: "",
  address: "",
  monitorId: "",
  capacityGb: "",
  freeGb: "",
  targetRetentionDays: "",
  actualRetentionDays: "",
};
const taskBlank = {
  cameraId: "",
  kind: "PREVENTIVE",
  task: "",
  dueAt: "",
  ticketReference: "",
};
const verifyBlank = {
  cameraId: "",
  actualLocation: "",
  serialMatch: true,
  channelMatch: true,
  installed: true,
  note: "",
};
function optional(value: string) {
  return value.trim() || undefined;
}
function number(value: string) {
  return value === "" ? undefined : Number(value);
}
function freshness(monitor: Monitor | null) {
  if (!monitor || monitor.deletedAt) return "Belum terhubung";
  if (
    !monitor.lastCheckedAt ||
    Date.now() - new Date(monitor.lastCheckedAt).getTime() > 180000
  )
    return "Data tidak segar";
  return monitor.lastStatus;
}
export default function CctvPage() {
  const [tab, setTab] = useState("cameras"),
    [cameras, setCameras] = useState<Camera[]>([]),
    [recorders, setRecorders] = useState<Recorder[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [verifications, setVerifications] = useState<Verification[]>([]),
    [monitors, setMonitors] = useState<Monitor[]>([]),
    [assets, setAssets] = useState<Asset[]>([]),
    [assetSearch, setAssetSearch] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [editingCamera, setEditingCamera] = useState<number | null>(null),
    [editingRecorder, setEditingRecorder] = useState<number | null>(null);
  const [cameraSearch, setCameraSearch] = useState("");
  const [cameraPage, setCameraPage] = useState(1);
  const [evidenceCamera, setEvidenceCamera] = useState<Camera | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [live, setLive] = useState<LiveCamera[]>([]);
  const [liveError, setLiveError] = useState("");
  const [camera, setCamera] = useState(cameraBlank),
    [recorder, setRecorder] = useState(recorderBlank),
    [task, setTask] = useState(taskBlank),
    [verification, setVerification] = useState(verifyBlank),
    [result, setResult] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        api<Camera[]>("/cctv/cameras"),
        api<Recorder[]>("/cctv/recorders"),
        api<Task[]>("/cctv/maintenance"),
        api<Verification[]>("/cctv/verifications"),
      ]);
      setCameras(a);
      setRecorders(b);
      setTasks(c);
      setVerifications(d);
      setError("");
      const monitorResult = await api<Monitor[]>("/cctv/monitor-options");
      setMonitors(monitorResult);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data CCTV gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab !== "cameras") return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await api<LiveCamera[]>("/cctv/live");
        if (active) {
          setLive(result);
          setLiveError("");
        }
      } catch {
        if (active) setLiveError("Status Blue Iris tidak dapat diperbarui.");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tab]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<Asset[]>(
        `/cctv/asset-options?q=${encodeURIComponent(assetSearch)}`,
      )
        .then((items) => {
          if (!cancelled) setAssets(items);
        })
        .catch(() => {
          if (!cancelled) setAssets([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetSearch]);
  async function send(
    path: string,
    body: object,
    message: string,
    method = "POST",
  ) {
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await load();
      setSuccess(message);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data gagal disimpan.");
      setSuccess("");
      return false;
    }
  }
  async function openEvidence(camera: Camera) {
    try {
      const data = await api<Evidence[]>(`/cctv/cameras/${camera.id}/evidence`);
      setEvidenceCamera(camera);
      setEvidence(data);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bukti gagal dimuat.");
    }
  }
  const label = (name: string, field: React.ReactNode) => (
    <label className="block text-sm font-medium text-slate-700">
      {name}
      <div className="mt-1">{field}</div>
    </label>
  );
  const monitorOptions = (
    <>
      <option value="">Belum dihubungkan</option>
      {monitors.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name} · {m.host}
        </option>
      ))}
    </>
  );
  const cameraQuery = cameraSearch.trim().toLocaleLowerCase();
  const filteredCameras = cameras.filter((c) =>
    [c.code, c.name, c.site, c.zone, c.address, c.serial].some((value) =>
      value?.toLocaleLowerCase().includes(cameraQuery),
    ),
  );
  const cameraPages = Math.max(1, Math.ceil(filteredCameras.length / 10));
  const currentCameraPage = Math.min(cameraPage, cameraPages);
  const visibleCameras = filteredCameras.slice(
    (currentCameraPage - 1) * 10,
    currentCameraPage * 10,
  );
  return (
    <>
      <PageHeader
        title="CCTV Register & Lifecycle"
        description="Daftar kamera dan NVR, cakupan, kondisi jaringan, preventive, dan pemeriksaan fisik."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-emerald-700">
          {success}
        </p>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["cameras", "Kamera"],
          ["recorders", "NVR & Storage"],
          ["maintenance", "Preventive & Repair"],
          ["verification", "Verifikasi Fisik"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
        <button className="btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {tab === "cameras" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="card overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Daftar kamera</h2>
              <p className="text-sm text-slate-500">
                Kondisi jaringan berasal dari monitor yang dihubungkan, bukan
                pemeriksaan rekaman.
              </p>
              <p className="text-sm text-slate-500">
                Status Blue Iris diperbarui saat halaman terbuka setiap 15
                detik. Status rekaman hanya ditampilkan jika tersedia dari
                server.
              </p>
              {liveError && (
                <p className="text-sm text-rose-700" role="alert">
                  {liveError}
                </p>
              )}
              <input
                aria-label="Cari kamera"
                className="input mt-3"
                placeholder="Cari nama, kode, lokasi, IP, atau serial"
                value={cameraSearch}
                onChange={(event) => {
                  setCameraSearch(event.target.value);
                  setCameraPage(1);
                }}
              />
            </div>
            {visibleCameras.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b p-4"
              >
                <div>
                  <b>
                    {c.code} · {c.name}
                  </b>
                  <p className="text-sm text-slate-500">
                    {c.site}
                    {c.zone ? ` · ${c.zone}` : ""} ·{" "}
                    {c.coverageArea || "Cakupan belum diisi"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.asset?.code || "Tanpa aset"} ·{" "}
                    {c.recorder?.name || "Tanpa NVR"}
                    {c.channel ? ` / channel ${c.channel}` : ""}
                  </p>
                  {c.sourceMarkerId && (
                    <p className="text-xs text-slate-500">
                      Impor denah · halaman {c.floorPage ?? "belum ditentukan"}{" "}
                      · perlu verifikasi
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={c.status} />
                  <StatusBadge value={freshness(c.monitor)} />
                  {c.sourceMarkerId && (
                    <span className="text-xs text-slate-600">
                      Blue Iris:{" "}
                      {live.find((entry) => entry.cameraId === c.id)?.status ||
                        "memuat"}{" "}
                      · rekaman{" "}
                      {live.find((entry) => entry.cameraId === c.id)
                        ?.recording === true
                        ? "aktif"
                        : live.find((entry) => entry.cameraId === c.id)
                              ?.recording === false
                          ? "tidak aktif"
                          : "tidak tersedia"}
                    </span>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => void openEvidence(c)}
                  >
                    Bukti
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setCamera({
                        name: c.name,
                        site: c.site,
                        zone: c.zone || "",
                        assetId: String(c.assetId || ""),
                        recorderId: String(c.recorderId || ""),
                        monitorId: String(c.monitorId || ""),
                        channel: String(c.channel || ""),
                        serial: c.serial || "",
                        address: c.address || "",
                        coverageArea: c.coverageArea || "",
                        floorPage: String(c.floorPage || ""),
                        x: c.x == null ? "" : String(c.x),
                        y: c.y == null ? "" : String(c.y),
                        rotation: c.rotation == null ? "" : String(c.rotation),
                        fieldOfView:
                          c.fieldOfView == null ? "" : String(c.fieldOfView),
                        retentionDays:
                          c.retentionDays == null
                            ? ""
                            : String(c.retentionDays),
                      });
                      setEditingCamera(c.id);
                    }}
                  >
                    Edit
                  </button>
                  {c.status === "DRAFT" && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void send(
                          `/cctv/cameras/${c.id}/status`,
                          { status: "COMMISSIONED" },
                          "Kamera siap diaktifkan.",
                        )
                      }
                    >
                      Commission
                    </button>
                  )}
                  {["COMMISSIONED", "INACTIVE"].includes(c.status) && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void send(
                          `/cctv/cameras/${c.id}/status`,
                          { status: "ACTIVE" },
                          "Kamera aktif.",
                        )
                      }
                    >
                      Aktifkan
                    </button>
                  )}
                  {c.status === "ACTIVE" && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void send(
                          `/cctv/cameras/${c.id}/status`,
                          { status: "INACTIVE" },
                          "Kamera dinonaktifkan.",
                        )
                      }
                    >
                      Nonaktifkan
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!filteredCameras.length && (
              <Empty
                text={
                  cameras.length
                    ? "Kamera tidak ditemukan."
                    : "Belum ada kamera terdaftar."
                }
              />
            )}
            {filteredCameras.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-slate-600">
                <span>
                  {filteredCameras.length} kamera · halaman {currentCameraPage}{" "}
                  dari {cameraPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={currentCameraPage === 1}
                    onClick={() => setCameraPage(currentCameraPage - 1)}
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={currentCameraPage === cameraPages}
                    onClick={() => setCameraPage(currentCameraPage + 1)}
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </section>
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (
                  await send(
                    editingCamera
                      ? `/cctv/cameras/${editingCamera}`
                      : "/cctv/cameras",
                    {
                      name: camera.name,
                      site: camera.site,
                      zone: optional(camera.zone) ?? null,
                      assetId: number(camera.assetId) ?? null,
                      recorderId: number(camera.recorderId) ?? null,
                      monitorId: number(camera.monitorId) ?? null,
                      channel: number(camera.channel) ?? null,
                      serial: optional(camera.serial) ?? null,
                      address: optional(camera.address) ?? null,
                      coverageArea: optional(camera.coverageArea) ?? null,
                      floorPage: number(camera.floorPage) ?? null,
                      x: number(camera.x) ?? null,
                      y: number(camera.y) ?? null,
                      rotation: number(camera.rotation) ?? null,
                      fieldOfView: number(camera.fieldOfView) ?? null,
                      retentionDays: number(camera.retentionDays) ?? null,
                    },
                    editingCamera
                      ? "Kamera berhasil diperbarui."
                      : "Kamera berhasil ditambahkan.",
                    editingCamera ? "PATCH" : "POST",
                  )
                ) {
                  setCamera(cameraBlank);
                  setEditingCamera(null);
                }
              })();
            }}
          >
            <h2 className="font-semibold">
              {editingCamera ? "Edit kamera" : "Tambah kamera"}
            </h2>
            {label(
              "Nama kamera",
              <input
                required
                className="input"
                value={camera.name}
                onChange={(e) => setCamera({ ...camera, name: e.target.value })}
              />,
            )}
            {label(
              "Site",
              <input
                required
                className="input"
                value={camera.site}
                onChange={(e) => setCamera({ ...camera, site: e.target.value })}
              />,
            )}
            {label(
              "Zona / lokasi",
              <input
                className="input"
                value={camera.zone}
                onChange={(e) => setCamera({ ...camera, zone: e.target.value })}
              />,
            )}
            {label(
              "Cari aset existing",
              <input
                className="input"
                value={assetSearch}
                placeholder="Kode, nama, atau serial"
                onChange={(e) => setAssetSearch(e.target.value)}
              />,
            )}
            {label(
              "Aset existing (opsional)",
              <select
                className="input"
                value={camera.assetId}
                onChange={(e) =>
                  setCamera({ ...camera, assetId: e.target.value })
                }
              >
                <option value="">Tidak dihubungkan</option>
                {camera.assetId &&
                  !assets.some((a) => String(a.id) === camera.assetId) && (
                    <option value={camera.assetId}>
                      Aset terhubung #{camera.assetId}
                    </option>
                  )}
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "NVR / DVR",
              <select
                className="input"
                value={camera.recorderId}
                onChange={(e) =>
                  setCamera({ ...camera, recorderId: e.target.value })
                }
              >
                <option value="">Tidak dihubungkan</option>
                {recorders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "Channel",
              <input
                className="input"
                type="number"
                min="1"
                value={camera.channel}
                onChange={(e) =>
                  setCamera({ ...camera, channel: e.target.value })
                }
              />,
            )}
            {label(
              "Monitor jaringan",
              <select
                className="input"
                value={camera.monitorId}
                onChange={(e) =>
                  setCamera({ ...camera, monitorId: e.target.value })
                }
              >
                {monitorOptions}
              </select>,
            )}
            {label(
              "Serial",
              <input
                className="input"
                value={camera.serial}
                onChange={(e) =>
                  setCamera({ ...camera, serial: e.target.value })
                }
              />,
            )}
            {label(
              "Alamat IP",
              <input
                className="input"
                value={camera.address}
                onChange={(e) =>
                  setCamera({ ...camera, address: e.target.value })
                }
              />,
            )}
            {label(
              "Area cakupan",
              <input
                className="input"
                value={camera.coverageArea}
                onChange={(e) =>
                  setCamera({ ...camera, coverageArea: e.target.value })
                }
              />,
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                ["floorPage", "Halaman peta"],
                ["x", "X (%)"],
                ["y", "Y (%)"],
                ["rotation", "Arah (°)"],
                ["fieldOfView", "Sudut pandang (°)"],
                ["retentionDays", "Retensi (hari)"],
              ].map(([key, title]) =>
                label(
                  title,
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={camera[key as keyof typeof camera]}
                    onChange={(e) =>
                      setCamera({ ...camera, [key]: e.target.value })
                    }
                  />,
                ),
              )}
            </div>
            <button className="btn-primary">Simpan kamera</button>
            {editingCamera && (
              <button
                type="button"
                className="btn-secondary ml-2"
                onClick={() => {
                  setEditingCamera(null);
                  setCamera(cameraBlank);
                }}
              >
                Batal
              </button>
            )}
          </form>
        </div>
      )}
      {tab === "cameras" && evidenceCamera && (
        <section className="card mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                Bukti foto / video · {evidenceCamera.name}
              </h2>
              <p className="text-sm text-slate-500">
                Lampiran kamera dapat dikaitkan dengan satu pekerjaan atau
                verifikasi.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEvidenceCamera(null)}
            >
              Tutup
            </button>
          </div>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              if (!data.get("maintenanceId")) data.delete("maintenanceId");
              if (!data.get("verificationId")) data.delete("verificationId");
              setEvidenceBusy(true);
              void api(`/cctv/cameras/${evidenceCamera.id}/evidence`, {
                method: "POST",
                body: data,
              })
                .then(async () => {
                  form.reset();
                  await openEvidence(evidenceCamera);
                  setSuccess("Bukti berhasil disimpan.");
                })
                .catch((e) =>
                  setError(
                    e instanceof ApiError ? e.message : "Bukti gagal disimpan.",
                  ),
                )
                .finally(() => setEvidenceBusy(false));
            }}
          >
            <label className="text-sm">
              Foto atau video, maksimal 50 MB
              <input
                required
                className="input mt-1"
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              />
            </label>
            <label className="text-sm">
              Pekerjaan (opsional)
              <select className="input mt-1" name="maintenanceId">
                <option value="">Tanpa pekerjaan</option>
                {tasks
                  .filter((item) => item.camera.id === evidenceCamera.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.task}
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-sm">
              Verifikasi (opsional)
              <select className="input mt-1" name="verificationId">
                <option value="">Tanpa verifikasi</option>
                {verifications
                  .filter((item) => item.camera.id === evidenceCamera.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString("id-ID")}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex items-end">
              <button className="btn-primary" disabled={evidenceBusy}>
                {evidenceBusy ? "Mengunggah…" : "Unggah bukti"}
              </button>
            </div>
          </form>
          <div className="mt-4 divide-y">
            {evidence.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>
                  {item.originalName}
                  <span className="block text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString("id-ID")} ·{" "}
                    {(item.size / 1024 / 1024).toFixed(1)} MB
                    {item.maintenanceId
                      ? " · Pekerjaan"
                      : item.verificationId
                        ? " · Verifikasi"
                        : " · Kamera"}
                  </span>
                </span>
                <a
                  className="btn-secondary"
                  href={`${API}/cctv/evidence/${item.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Lihat bukti
                </a>
              </div>
            ))}
          </div>
          {!evidence.length && (
            <Empty text="Belum ada bukti untuk kamera ini." />
          )}
        </section>
      )}
      {tab === "recorders" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="card overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">NVR & DVR</h2>
              <p className="text-sm text-slate-500">
                Kapasitas dan retensi dicatat manual; belum terhubung langsung
                ke storage.
              </p>
            </div>
            {recorders.map((r) => (
              <div key={r.id} className="border-b p-4">
                <b>
                  {r.code} · {r.name}
                </b>
                <p className="text-sm text-slate-500">
                  {r.site} · {r._count.cameras} kamera · {freshness(r.monitor)}
                </p>
                <p className="mt-1 text-sm">
                  Kapasitas {r.capacityGb ?? "—"} GB · Kosong {r.freeGb ?? "—"}{" "}
                  GB · Retensi {r.actualRetentionDays ?? "—"} /{" "}
                  {r.targetRetentionDays ?? "—"} hari
                </p>
                <p className="text-xs text-slate-500">
                  Dicatat{" "}
                  {r.storageCheckedAt
                    ? new Date(r.storageCheckedAt).toLocaleString("id-ID")
                    : "—"}
                </p>
                <button
                  className="btn-secondary mt-2"
                  onClick={() => {
                    setRecorder({
                      name: r.name,
                      site: r.site,
                      address: r.address || "",
                      monitorId: String(r.monitorId || ""),
                      capacityGb:
                        r.capacityGb == null ? "" : String(r.capacityGb),
                      freeGb: r.freeGb == null ? "" : String(r.freeGb),
                      targetRetentionDays:
                        r.targetRetentionDays == null
                          ? ""
                          : String(r.targetRetentionDays),
                      actualRetentionDays:
                        r.actualRetentionDays == null
                          ? ""
                          : String(r.actualRetentionDays),
                    });
                    setEditingRecorder(r.id);
                  }}
                >
                  Edit
                </button>
              </div>
            ))}
            {!recorders.length && <Empty text="Belum ada NVR/DVR." />}
          </section>
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (
                  await send(
                    editingRecorder
                      ? `/cctv/recorders/${editingRecorder}`
                      : "/cctv/recorders",
                    {
                      name: recorder.name,
                      site: recorder.site,
                      address: optional(recorder.address) ?? null,
                      monitorId: number(recorder.monitorId) ?? null,
                      capacityGb: number(recorder.capacityGb) ?? null,
                      freeGb: number(recorder.freeGb) ?? null,
                      targetRetentionDays:
                        number(recorder.targetRetentionDays) ?? null,
                      actualRetentionDays:
                        number(recorder.actualRetentionDays) ?? null,
                    },
                    editingRecorder
                      ? "NVR berhasil diperbarui."
                      : "NVR berhasil ditambahkan.",
                    editingRecorder ? "PATCH" : "POST",
                  )
                ) {
                  setRecorder(recorderBlank);
                  setEditingRecorder(null);
                }
              })();
            }}
          >
            <h2 className="font-semibold">
              {editingRecorder ? "Edit NVR / DVR" : "Tambah NVR / DVR"}
            </h2>
            {label(
              "Nama",
              <input
                required
                className="input"
                value={recorder.name}
                onChange={(e) =>
                  setRecorder({ ...recorder, name: e.target.value })
                }
              />,
            )}
            {label(
              "Site",
              <input
                required
                className="input"
                value={recorder.site}
                onChange={(e) =>
                  setRecorder({ ...recorder, site: e.target.value })
                }
              />,
            )}
            {label(
              "Alamat IP",
              <input
                className="input"
                value={recorder.address}
                onChange={(e) =>
                  setRecorder({ ...recorder, address: e.target.value })
                }
              />,
            )}
            {label(
              "Monitor jaringan",
              <select
                className="input"
                value={recorder.monitorId}
                onChange={(e) =>
                  setRecorder({ ...recorder, monitorId: e.target.value })
                }
              >
                {monitorOptions}
              </select>,
            )}
            {[
              ["capacityGb", "Kapasitas (GB)"],
              ["freeGb", "Kapasitas kosong (GB)"],
              ["targetRetentionDays", "Target retensi (hari)"],
              ["actualRetentionDays", "Retensi aktual (hari)"],
            ].map(([key, title]) =>
              label(
                title,
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={recorder[key as keyof typeof recorder]}
                  onChange={(e) =>
                    setRecorder({ ...recorder, [key]: e.target.value })
                  }
                />,
              ),
            )}
            <button className="btn-primary">Simpan NVR</button>
            {editingRecorder && (
              <button
                type="button"
                className="btn-secondary ml-2"
                onClick={() => {
                  setEditingRecorder(null);
                  setRecorder(recorderBlank);
                }}
              >
                Batal
              </button>
            )}
          </form>
        </div>
      )}
      {tab === "maintenance" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="card overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Preventive & repair</h2>
            </div>
            {tasks.map((t) => (
              <div className="border-b p-4" key={t.id}>
                <div className="flex items-center justify-between gap-2">
                  <b>
                    {t.code} · {t.camera.name}
                  </b>
                  <StatusBadge value={t.status} />
                </div>
                <p className="text-sm text-slate-500">
                  {t.kind} · {t.task} · Jatuh tempo{" "}
                  {new Date(t.dueAt).toLocaleDateString("id-ID")}
                </p>
                {t.result && <p className="text-sm">Hasil: {t.result}</p>}
                {t.status === "PLANNED" && (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="input"
                      placeholder="Hasil pemeriksaan"
                      value={result[t.id] || ""}
                      onChange={(e) =>
                        setResult({ ...result, [t.id]: e.target.value })
                      }
                    />
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        void send(
                          `/cctv/maintenance/${t.id}/complete`,
                          { result: result[t.id] || "" },
                          "Pemeriksaan disimpan.",
                        )
                      }
                    >
                      Selesai
                    </button>
                  </div>
                )}
                {t.status === "INSPECTED" && (
                  <button
                    className="btn-secondary mt-2"
                    onClick={() =>
                      void send(
                        `/cctv/maintenance/${t.id}/verify`,
                        {},
                        "Pekerjaan diverifikasi.",
                      )
                    }
                  >
                    Verifikasi
                  </button>
                )}
              </div>
            ))}
            {!tasks.length && <Empty text="Belum ada pekerjaan CCTV." />}
          </section>
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (
                  await send(
                    "/cctv/maintenance",
                    {
                      cameraId: Number(task.cameraId),
                      kind: task.kind,
                      task: task.task,
                      dueAt: new Date(task.dueAt).toISOString(),
                      ticketReference: optional(task.ticketReference),
                    },
                    "Pekerjaan dijadwalkan.",
                  )
                )
                  setTask(taskBlank);
              })();
            }}
          >
            <h2 className="font-semibold">Jadwalkan pekerjaan</h2>
            {label(
              "Kamera",
              <select
                required
                className="input"
                value={task.cameraId}
                onChange={(e) => setTask({ ...task, cameraId: e.target.value })}
              >
                <option value="">Pilih kamera</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "Jenis",
              <select
                className="input"
                value={task.kind}
                onChange={(e) => setTask({ ...task, kind: e.target.value })}
              >
                <option value="PREVENTIVE">Preventive</option>
                <option value="REPAIR">Repair</option>
              </select>,
            )}
            {label(
              "Pekerjaan",
              <input
                required
                className="input"
                value={task.task}
                onChange={(e) => setTask({ ...task, task: e.target.value })}
              />,
            )}
            {label(
              "Jatuh tempo",
              <input
                required
                type="date"
                className="input"
                value={task.dueAt}
                onChange={(e) => setTask({ ...task, dueAt: e.target.value })}
              />,
            )}
            {label(
              "Referensi ticket (opsional)",
              <input
                className="input"
                value={task.ticketReference}
                onChange={(e) =>
                  setTask({ ...task, ticketReference: e.target.value })
                }
              />,
            )}
            <button className="btn-primary">Jadwalkan</button>
          </form>
        </div>
      )}
      {tab === "verification" && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <section className="card overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Riwayat verifikasi fisik</h2>
            </div>
            {verifications.map((v) => (
              <div className="border-b p-4" key={v.id}>
                <b>
                  {v.code} · {v.camera.name}
                </b>
                <p className="text-sm text-slate-500">
                  {v.actualLocation} ·{" "}
                  {new Date(v.createdAt).toLocaleString("id-ID")}
                </p>
                <p className="text-sm">
                  Serial {v.serialMatch ? "sesuai" : "tidak sesuai"} · Channel{" "}
                  {v.channelMatch ? "sesuai" : "tidak sesuai"} ·{" "}
                  {v.installed ? "Terpasang" : "Tidak ditemukan"}
                </p>
              </div>
            ))}
            {!verifications.length && (
              <Empty text="Belum ada pemeriksaan fisik." />
            )}
          </section>
          <form
            className="card space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (
                  await send(
                    "/cctv/verifications",
                    {
                      ...verification,
                      cameraId: Number(verification.cameraId),
                      note: optional(verification.note),
                    },
                    "Verifikasi disimpan.",
                  )
                )
                  setVerification(verifyBlank);
              })();
            }}
          >
            <h2 className="font-semibold">Pemeriksaan fisik</h2>
            {label(
              "Kamera",
              <select
                required
                className="input"
                value={verification.cameraId}
                onChange={(e) =>
                  setVerification({ ...verification, cameraId: e.target.value })
                }
              >
                <option value="">Pilih kamera</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>,
            )}
            {label(
              "Lokasi aktual",
              <input
                required
                className="input"
                value={verification.actualLocation}
                onChange={(e) =>
                  setVerification({
                    ...verification,
                    actualLocation: e.target.value,
                  })
                }
              />,
            )}
            {(
              [
                ["serialMatch", "Serial sesuai"],
                ["channelMatch", "Channel sesuai"],
                ["installed", "Kamera terpasang"],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={verification[key]}
                  onChange={(e) =>
                    setVerification({
                      ...verification,
                      [key]: e.target.checked,
                    })
                  }
                />
                {title}
              </label>
            ))}
            {label(
              "Catatan",
              <input
                className="input"
                value={verification.note}
                onChange={(e) =>
                  setVerification({ ...verification, note: e.target.value })
                }
              />,
            )}
            <button className="btn-primary">Simpan pemeriksaan</button>
          </form>
        </div>
      )}
    </>
  );
}
