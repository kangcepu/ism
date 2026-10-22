"use client";

import { useEffect, useMemo, useState } from "react";
import { api, API, ApiError } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";
import { MapCanvas } from "./map-canvas";

type Marker = {
  id: string;
  name?: string;
  kind?: string;
  page?: number;
  x?: number;
  y?: number;
  [key: string]: unknown;
};
type Cable = {
  id: string;
  from?: string;
  to?: string;
  points?: { x: number; y: number }[];
  connections?: {
    start?: { markerId: string; offsetX?: number; offsetY?: number };
    end?: { markerId: string; offsetX?: number; offsetY?: number };
  };
  page?: number;
  [key: string]: unknown;
};
type State = {
  page?: number;
  zoom?: number;
  markers?: Marker[];
  cables?: Cable[];
  pageNames?: Record<string, string>;
  [key: string]: unknown;
};
type Coverage = {
  sourceMarkerId: string;
  rotation: number | null;
  fieldOfView: number;
  coverageArea: string | null;
};
type MarkerLive = {
  status: "online" | "offline" | "degraded" | "unknown";
  source: "BLUE_IRIS" | "UNIFI" | "SNMP";
  checkedAt: string | null;
  message: string;
  recording?: boolean | null;
  fps?: number | null;
  clients?: number | null;
  latencyMs?: number | null;
  temperature?: number | null;
  trafficInBps?: number | null;
  trafficOutBps?: number | null;
  ports?: number;
  openPorts?: string | null;
};
type LiveState = { updatedAt: string; markers: Record<string, MarkerLive> };
const markerId = () => crypto.randomUUID();
const formatRate = (value: number) => {
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let amount = value;
  let index = 0;
  while (amount >= 1000 && index < units.length - 1) {
    amount /= 1000;
    index += 1;
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
};

export default function FloorMapPage() {
  const [state, setState] = useState<State | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [backgrounds, setBackgrounds] = useState<
    {
      page: number;
      version: number;
      width: number;
      height: number;
      format: string;
      hasPng: boolean;
    }[]
  >([]);
  const [icons, setIcons] = useState<{ name: string; url: string }[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [cableFrom, setCableFrom] = useState("");
  const [cableTo, setCableTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [moving, setMoving] = useState(false);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<{ id: string; request: number } | null>(
    null,
  );
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);
  const [hiddenCableTypes, setHiddenCableTypes] = useState<string[]>([]);
  const [live, setLive] = useState<LiveState | null>(null);
  const [panel, setPanel] = useState<"dashboard" | "details" | "layers" | "search" | "cables">("dashboard");
  useEffect(() => {
    api<{ state: State; canEdit: boolean }>("/floor-map/editor")
      .then((value) => {
        setState(value.state);
        setCanEdit(value.canEdit);
        setPage(Number(value.state.page) || 1);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Gagal memuat peta."),
      )
      .finally(() => setLoading(false));
    api<
      {
        page: number;
        version: number;
        width: number;
        height: number;
        format: string;
        hasPng: boolean;
      }[]
    >("/floor-map/backgrounds")
      .then(setBackgrounds)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Gagal memuat background.",
        ),
      );
    api<{ name: string; url: string }[]>("/floor-map/icons")
      .then(setIcons)
      .catch(() => undefined);
    api<Coverage[]>("/floor-map/cctv-coverage")
      .then(setCoverage)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<LiveState>("/floor-map/markers/live")
        .then((value) => active && setLive(value))
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  async function uploadIcon(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("icon", file);
      const icon = await api<{ name: string; url: string }>(
        "/floor-map/icons",
        { method: "PUT", body: form },
      );
      setIcons((current) => [...current, icon]);
      updateMarker({ customIconUrl: icon.name, customIconName: file.name });
      setNotice("Icon berhasil diunggah dan dipasang pada marker.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengunggah icon.");
    } finally {
      setBusy(false);
    }
  }
  async function uploadBackground(file: File) {
    if (!window.confirm(`Ganti background halaman ${page}?`)) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("background", file);
      const result = await api<{
        page: number;
        version: number;
        width: number;
        height: number;
        format: string;
        hasPng: boolean;
      }>(`/floor-map/backgrounds/${page}`, { method: "PUT", body: form });
      setBackgrounds((previous) => [
        ...previous.filter((item) => item.page !== page),
        result,
      ]);
      setNotice("Background berhasil disimpan.");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal mengunggah background.",
      );
    } finally {
      setBusy(false);
    }
  }
  const markers = useMemo(
    () =>
      (state?.markers || []).filter(
        (marker) => Number(marker.page || 1) === page,
      ),
    [state, page],
  );
  const cables = useMemo(
    () =>
      (state?.cables || []).filter((cable) => Number(cable.page || 1) === page),
    [state, page],
  );
  const marker = markers.find((item) => String(item.id) === selected);
  const markerKinds = useMemo(
    () => [...new Set(markers.map((item) => String(item.kind || "other").toLowerCase()))].sort(),
    [markers],
  );
  const cableTypes = useMemo(
    () => [...new Set(cables.map((item) => String(item.type || "lan").toLowerCase()))].sort(),
    [cables],
  );
  const visibleMarkers = markers.filter(
    (item) => !hiddenKinds.includes(String(item.kind || "other").toLowerCase()),
  );
  const visibleCables = cables.filter(
    (item) => !hiddenCableTypes.includes(String(item.type || "lan").toLowerCase()),
  );
  const selectedLive = selected ? live?.markers[selected] : null;
  const dashboard = useMemo(() => {
    const count = (kind: string, status?: string) =>
      markers.filter((item) => String(item.kind || "").toLowerCase().includes(kind) && (!status || live?.markers[String(item.id)]?.status === status)).length;
    return {
      cctv: count("cctv"), cctvOnline: count("cctv", "online"), cctvCheck: count("cctv", "unknown") + count("cctv", "degraded"),
      apOnline: count("ap", "online"), apOffline: count("ap", "offline"),
      switches: markers.filter((item) => ["switch", "router"].some((kind) => String(item.kind || "").toLowerCase().includes(kind))).length,
      switchOnline: markers.filter((item) => ["switch", "router"].some((kind) => String(item.kind || "").toLowerCase().includes(kind)) && live?.markers[String(item.id)]?.status === "online").length,
      switchOffline: markers.filter((item) => ["switch", "router"].some((kind) => String(item.kind || "").toLowerCase().includes(kind)) && live?.markers[String(item.id)]?.status === "offline").length,
    };
  }, [markers, live]);
  const background = backgrounds.find((item) => item.page === page);
  const legacyRatio = background
    ? background.width / background.height
    : 4500 / 6300;
  const legacyWidth =
    Math.abs(legacyRatio / (4500 / 6300) - 1) < 0.01
      ? 4500
      : Math.round(6300 * legacyRatio);
  const dimension = (axis: "x" | "y") => (axis === "x" ? legacyWidth : 6300);
  const percent = (value: number | undefined, axis: "x" | "y") =>
    state?.coordinateSpace === "pixels"
      ? (Number(value || 0) * 100) / dimension(axis)
      : Number(value || 0);
  const coordinate = (value: number, axis: "x" | "y") =>
    state?.coordinateSpace === "pixels"
      ? (value * dimension(axis)) / 100
      : value;
  const endpoint = (cable: Cable, side: "start" | "end") =>
    side === "start"
      ? cable.connections?.start?.markerId || cable.from
      : cable.connections?.end?.markerId || cable.to;
  const resolvedPoints = (cable: Cable) => {
    const points = (cable.points || []).map((point) => ({ ...point }));
    for (const [side, index] of [
      ["start", 0],
      ["end", points.length - 1],
    ] as const) {
      const connection = cable.connections?.[side];
      const connected = markers.find(
        (item) => String(item.id) === String(connection?.markerId),
      );
      if (points.length && connected && connection)
        points[index] = {
          x: Number(connected.x || 0) + Number(connection.offsetX || 0),
          y: Number(connected.y || 0) + Number(connection.offsetY || 0),
        };
    }
    return points;
  };
  function change(next: State) {
    setState(next);
    setDirty(true);
    setNotice("");
  }
  function updateMarker(patch: Partial<Marker>) {
    if (!state || !selected) return;
    change({
      ...state,
      markers: (state.markers || []).map((item) =>
        String(item.id) === selected ? { ...item, ...patch } : item,
      ),
    });
  }
  function addMarker() {
    if (!state) return;
    const item: Marker = {
      id: markerId(),
      name: "Marker baru",
      kind: "switch",
      page,
      x: coordinate(50, "x"),
      y: coordinate(50, "y"),
    };
    change({ ...state, markers: [...(state.markers || []), item] });
    setSelected(item.id);
  }
  function removeMarker() {
    if (
      !state ||
      !selected ||
      !window.confirm("Hapus marker dan kabel yang terhubung?")
    )
      return;
    change({
      ...state,
      markers: (state.markers || []).filter(
        (item) => String(item.id) !== selected,
      ),
      cables: (state.cables || []).filter(
        (item) =>
          String(endpoint(item, "start")) !== selected &&
          String(endpoint(item, "end")) !== selected,
      ),
    });
    setSelected(null);
  }
  function addCable() {
    if (!state || !cableFrom || !cableTo || cableFrom === cableTo) return;
    const from = markers.find((item) => String(item.id) === cableFrom);
    const to = markers.find((item) => String(item.id) === cableTo);
    if (!from || !to) return;
    change({
      ...state,
      cables: [
        ...(state.cables || []),
        { id: markerId(), from: cableFrom, to: cableTo, page, type: "lan", color: "#2563eb", label: "LAN", labelColor: "#2563eb", labelSize: 2.4, points: [{ x: Number(from.x || 0), y: Number(from.y || 0) }, { x: Number(to.x || 0), y: Number(to.y || 0) }], connections: { start: { markerId: cableFrom }, end: { markerId: cableTo } } },
      ],
    });
    setCableFrom("");
    setCableTo("");
  }
  function updateCable(id: string, patch: Partial<Cable>) {
    if (!state) return;
    change({ ...state, cables: (state.cables || []).map((item) => String(item.id) === id ? { ...item, ...patch } : item) });
  }
  function addBend(cable: Cable) {
    const points = resolvedPoints(cable);
    if (points.length < 2) return;
    const index = Math.floor((points.length - 1) / 2);
    const a = points[index]; const b = points[index + 1];
    updateCable(String(cable.id), { points: [...points.slice(0, index + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...points.slice(index + 1)] });
  }
  function snapCable(cable: Cable) {
    const from = markers.find((item) => String(item.id) === String(endpoint(cable, "start")));
    const to = markers.find((item) => String(item.id) === String(endpoint(cable, "end")));
    if (!from || !to) return;
    const points = resolvedPoints(cable);
    points[0] = { x: Number(from.x || 0), y: Number(from.y || 0) };
    points[points.length - 1] = { x: Number(to.x || 0), y: Number(to.y || 0) };
    updateCable(String(cable.id), { points, connections: { start: { markerId: String(from.id) }, end: { markerId: String(to.id) } } });
  }
  async function save() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<{ state: State }>("/floor-map/editor", {
        method: "PUT",
        body: JSON.stringify({ state: { ...state, page } }),
      });
      setState(saved.state);
      setDirty(false);
      setNotice("Peta berhasil disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan peta.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Empty text="Memuat peta…" />;
  if (!state)
    return (
      <>
        <PageHeader
          title="Infrastructure Map"
          description="Editor peta infrastruktur."
        />
        <p role="alert" className="text-rose-700">
          {error || "Peta tidak tersedia."}
        </p>
      </>
    );
  return (
    <>
      <PageHeader
        title="Infrastructure Map"
        description="Atur marker dan kabel di setiap halaman peta."
        actions={
          <div className="flex gap-2">
            <button
              onClick={addMarker}
              disabled={!canEdit}
              className="btn-secondary"
            >
              Tambah Marker
            </button>
            <button
              disabled={!canEdit || busy || !dirty}
              onClick={save}
              className="btn-primary"
            >
              {busy ? "Menyimpan…" : "Simpan Peta"}
            </button>
          </div>
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
      {dirty && (
        <p className="mb-4 text-sm text-amber-700">
          Ada perubahan yang belum disimpan.
        </p>
      )}
      {!canEdit && (
        <p className="mb-4 text-sm text-slate-500">
          Akses Anda hanya untuk melihat peta.
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 sm:flex-none">
          <span className="label">Lantai / halaman</span>
          <select
            className="input"
            value={page}
            onChange={(e) => {
              setPage(Number(e.target.value));
              setSelected(null);
              setMoving(false);
              setCableFrom("");
              setCableTo("");
            }}
          >
            {[
              ...new Set([
                page,
                ...backgrounds.map((item) => item.page),
                ...Object.keys(state.pageNames || {})
                  .map(Number)
                  .filter((value) => value >= 1 && value <= 99),
              ]),
            ]
              .sort((a, b) => a - b)
              .map((value) => (
                <option key={value} value={value}>
                  {value}. {state.pageNames?.[value] || `Halaman ${value}`}
                </option>
              ))}
          </select>
        </label>
        {canEdit && (
          <label className="w-24">
            <span className="label">No. halaman</span>
            <input
              className="input"
              type="number"
              min="1"
              max="99"
              value={page}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 1 && value <= 99) {
                  setPage(value);
                  setSelected(null);
                  setMoving(false);
                  setCableFrom("");
                  setCableTo("");
                }
              }}
            />
          </label>
        )}
        {canEdit && (
          <label className="min-w-36 flex-1 sm:flex-none">
            <span className="label">Nama halaman</span>
            <input
              className="input"
              value={state.pageNames?.[page] || ""}
              onChange={(e) =>
                change({
                  ...state,
                  pageNames: { ...state.pageNames, [page]: e.target.value },
                })
              }
            />
          </label>
        )}
        {canEdit && (
          <label className="text-sm">
            <span className="label">Ganti denah SVG / PNG (maks. 12 MB)</span>
            <input
              className="input max-w-full"
              type="file"
              accept="image/png,image/svg+xml,.svg"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadBackground(file);
              }}
            />
          </label>
        )}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <MapCanvas
            background={background}
            markers={visibleMarkers.map((item) => ({
              id: String(item.id),
              name: String(item.name || item.kind || "Marker"),
              kind: String(item.kind || "other"),
              scale: Number(item.scale || 1),
              color: typeof item.color === "string" ? item.color : undefined,
              strokeColor: typeof item.strokeColor === "string" ? item.strokeColor : undefined,
              labelColor: typeof item.textColor === "string" ? item.textColor : undefined,
              labelSize: typeof item.labelSize === "number" ? item.labelSize : undefined,
              ip: typeof item.ip === "string" ? item.ip : undefined,
              mac: typeof item.apMac === "string" && item.apMac ? item.apMac : undefined,
              notes: typeof item.notes === "string" ? item.notes : undefined,
              iconUrl: item.customIconUrl
                ? `${API}/floor-map/icons/${String(item.customIconUrl).split("/").pop()}`
                : undefined,
              x: percent(item.x, "x"),
              y: percent(item.y, "y"),
              live: live?.markers[String(item.id)],
            }))}
            cables={visibleCables.map((cable) => {
              const from = markers.find(
                (item) => String(item.id) === String(endpoint(cable, "start")),
              );
              const to = markers.find(
                (item) => String(item.id) === String(endpoint(cable, "end")),
              );
              const points = resolvedPoints(cable);
              const resolved =
                points.length >= 2
                  ? points
                  : from && to
                    ? [
                        { x: Number(from.x || 0), y: Number(from.y || 0) },
                        { x: Number(to.x || 0), y: Number(to.y || 0) },
                      ]
                    : [];
              return {
                id: String(cable.id),
                color:
                  typeof cable.color === "string" ? cable.color : "#2563eb",
                label: typeof cable.label === "string" ? cable.label : "",
                labelColor:
                  typeof cable.labelColor === "string"
                    ? cable.labelColor
                    : undefined,
                labelSize:
                  typeof cable.labelSize === "number"
                    ? cable.labelSize
                    : undefined,
                points: resolved.map((point) => ({
                  x: percent(point.x, "x"),
                  y: percent(point.y, "y"),
                })),
              };
            })}
            selected={selected}
            focus={focus}
            coverage={(() => {
              const selectedMarker = markers.find(
                (item) => String(item.id) === selected,
              );
              const camera = coverage.find(
                (item) => item.sourceMarkerId === `floor-map:${selected}`,
              );
              return selectedMarker && camera
                ? {
                    x: percent(selectedMarker.x, "x"),
                    y: percent(selectedMarker.y, "y"),
                    rotation: camera.rotation ?? 0,
                    fieldOfView: camera.fieldOfView,
                  }
                : null;
            })()}
            onSelect={(id) => {
              setSelected(id);
              setMoving(false);
              setPanel("details");
            }}
            moving={moving}
            onMove={(x, y) => {
              updateMarker({ x: coordinate(x, "x"), y: coordinate(y, "y") });
              setMoving(false);
            }}
            onCancelMove={() => setMoving(false)}
          />
          {selected &&
            coverage.some(
              (item) => item.sourceMarkerId === `floor-map:${selected}`,
            ) && (
              <p className="mt-2 text-xs text-slate-500">
                Arah dan sudut mengikuti register CCTV; ukuran tampilan adalah
                ilustrasi, bukan jarak terukur.
              </p>
            )}
        </section>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
          <nav aria-label="Panel denah" className="grid grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {[
              ["dashboard", "Ringkas"],
              ["details", "Detail"],
              ["layers", "Layer"],
              ["search", "Cari"],
              ["cables", "Kabel"],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setPanel(id as typeof panel)} className={`rounded-lg px-2 py-2 text-xs font-semibold ${panel === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
          </nav>
          {panel === "dashboard" && <section className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Dashboard</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Total CCTV", dashboard.cctv, "text-slate-900"], ["CCTV hidup", dashboard.cctvOnline, "text-emerald-600"],
                ["CCTV perlu cek", dashboard.cctvCheck, "text-amber-600"], ["AP online", dashboard.apOnline, "text-emerald-600"],
                ["AP offline", dashboard.apOffline, "text-rose-600"], ["Total switch", dashboard.switches, "text-amber-600"],
                ["Switch online", dashboard.switchOnline, "text-emerald-600"], ["Switch offline", dashboard.switchOffline, "text-rose-600"],
              ].map(([label, value, color]) => <div key={String(label)} className="rounded-lg border border-slate-200 px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p></div>)}
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Properti objek</h3>
              {marker ? <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><p className="font-semibold text-slate-900">{String(marker.name || marker.kind || "Marker")}</p><p className="mt-1 capitalize">{String(marker.kind || "other")}</p>{typeof marker.ip === "string" && marker.ip && <p className="mt-1">IP: {marker.ip}</p>}<button type="button" className="mt-3 text-xs font-semibold text-blue-700" onClick={() => setPanel("details")}>Buka detail objek</button></div> : <p className="mt-3 rounded-lg border border-slate-200 p-3 text-sm leading-5 text-slate-600">Klik CCTV, switch, atau kabel pada denah untuk membuka properti dan status perangkat.</p>}
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">File referensi</h3>
              <a className="btn-secondary mt-3 inline-flex" href={`${API}/floor-map/backgrounds/reference/vsd`} target="_blank" rel="noreferrer">Buka background.vsd</a>
              <p className="mt-2 text-xs text-slate-500">File Visio asli tetap tersedia sebagai referensi; denah operasional memakai versi vektor native.</p>
            </div>
          </section>}
          {panel === "layers" && <section className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Layer denah</h2>
              <button type="button" className="text-xs font-medium text-blue-700" onClick={() => { setHiddenKinds([]); setHiddenCableTypes([]); }}>
                Tampilkan semua
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-slate-500">Marker</p>
              {markerKinds.map((kind) => (
                <label key={kind} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span className="capitalize">{kind}</span>
                  <input type="checkbox" checked={!hiddenKinds.includes(kind)} onChange={() => setHiddenKinds((current) => current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind])} />
                </label>
              ))}
              <p className="pt-2 text-xs font-medium text-slate-500">Kabel</p>
              {cableTypes.map((type) => (
                <label key={type} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span className="uppercase">{type}</span>
                  <input type="checkbox" checked={!hiddenCableTypes.includes(type)} onChange={() => setHiddenCableTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type])} />
                </label>
              ))}
            </div>
          </section>}
          {panel === "details" && marker && (
            <section className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold">Status perangkat</h2><p className="mt-1 text-xs text-slate-500">{selectedLive?.source || "DATA MAP"} · {selectedLive?.checkedAt ? new Date(selectedLive.checkedAt).toLocaleTimeString("id-ID") : "Belum diperiksa"}</p></div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${selectedLive?.status === "online" ? "bg-emerald-50 text-emerald-700" : selectedLive?.status === "offline" ? "bg-rose-50 text-rose-700" : selectedLive?.status === "degraded" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{selectedLive?.status || "unknown"}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{selectedLive?.message || "Status akan diperbarui otomatis."}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                {selectedLive?.latencyMs != null && <><dt className="text-slate-500">Latency</dt><dd className="text-right font-semibold">{selectedLive.latencyMs} ms</dd></>}
                {selectedLive?.temperature != null && <><dt className="text-slate-500">Suhu chassis</dt><dd className="text-right font-semibold">{selectedLive.temperature} °C</dd></>}
                {selectedLive?.trafficInBps != null && <><dt className="text-slate-500">Traffic masuk</dt><dd className="text-right font-semibold">{formatRate(selectedLive.trafficInBps)}</dd></>}
                {selectedLive?.trafficOutBps != null && <><dt className="text-slate-500">Traffic keluar</dt><dd className="text-right font-semibold">{formatRate(selectedLive.trafficOutBps)}</dd></>}
                {selectedLive?.ports != null && <><dt className="text-slate-500">Port terbaca</dt><dd className="text-right font-semibold">{selectedLive.ports}</dd></>}
                {selectedLive?.clients != null && <><dt className="text-slate-500">Klien AP</dt><dd className="text-right font-semibold">{selectedLive.clients}</dd></>}
                {selectedLive?.fps != null && <><dt className="text-slate-500">FPS kamera</dt><dd className="text-right font-semibold">{selectedLive.fps}</dd></>}
                {selectedLive?.recording != null && <><dt className="text-slate-500">Rekaman</dt><dd className="text-right font-semibold">{selectedLive.recording ? "Aktif" : "Tidak aktif"}</dd></>}
              </dl>
            </section>
          )}
          {panel === "details" && <section className="card p-4">
            <h2 className="font-semibold">Marker</h2>
            {marker ? (
              <fieldset disabled={!canEdit} className="mt-4 space-y-3">
                <label className="block">
                  <span className="label">Nama</span>
                  <input
                    className="input"
                    value={String(marker.name || "")}
                    onChange={(e) => updateMarker({ name: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="label">Icon perangkat</span>
                  <select
                    className="input"
                    value={
                      String(marker.customIconUrl || "")
                        .split("/")
                        .pop() || ""
                    }
                    onChange={(e) =>
                      updateMarker({
                        customIconUrl: e.target.value,
                        customIconName:
                          icons.find((item) => item.name === e.target.value)
                            ?.name || "",
                      })
                    }
                  >
                    <option value="">Icon bawaan sesuai jenis</option>
                    {icons.map((icon) => (
                      <option key={icon.name} value={icon.name}>
                        {icon.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Upload icon PNG (maks. 2 MB)</span>
                  <input
                    className="input"
                    type="file"
                    accept="image/png"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadIcon(file);
                    }}
                  />
                </label>
                <label className="block">
                  <span className="label">Jenis</span>
                  <input
                    className="input"
                    list="marker-kinds"
                    value={String(marker.kind || "")}
                    onChange={(e) => updateMarker({ kind: e.target.value })}
                  />
                  <datalist id="marker-kinds">
                    <option value="switch" />
                    <option value="ap" />
                    <option value="cctv" />
                    <option value="other" />
                  </datalist>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label><span className="label">Skala marker</span><input className="input" type="number" min="0.5" max="3" step="0.1" value={Number(marker.scale || 1)} onChange={(e) => updateMarker({ scale: Number(e.target.value) })} /></label>
                  <label><span className="label">Ukuran label</span><input className="input" type="number" min="8" max="32" value={Number(marker.labelSize || 10)} onChange={(e) => updateMarker({ labelSize: Number(e.target.value) })} /></label>
                  <label><span className="label">Warna marker</span><input className="input h-10 p-1" type="color" value={String(marker.color || "#2563eb")} onChange={(e) => updateMarker({ color: e.target.value })} /></label>
                  <label><span className="label">Warna stroke</span><input className="input h-10 p-1" type="color" value={String(marker.strokeColor || "#ffffff")} onChange={(e) => updateMarker({ strokeColor: e.target.value })} /></label>
                  <label><span className="label">Warna label</span><input className="input h-10 p-1" type="color" value={String(marker.textColor || "#334155")} onChange={(e) => updateMarker({ textColor: e.target.value })} /></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["x", "y"] as const).map((key) => (
                    <label key={key}>
                      <span className="label">{key.toUpperCase()} (%)</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={Number(percent(marker[key], key).toFixed(1))}
                        onChange={(e) =>
                          updateMarker({
                            [key]: coordinate(
                              Math.max(
                                0,
                                Math.min(100, Number(e.target.value)),
                              ),
                              key,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={() => setMoving(true)}
                >
                  Pindahkan di denah
                </button>
                <button
                  className="btn-secondary text-rose-700"
                  onClick={removeMarker}
                >
                  Hapus Marker
                </button>
              </fieldset>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Pilih marker untuk mengedit.
              </p>
            )}
          </section>}
          {panel === "search" && <section className="card p-4">
            <h2 className="font-semibold">
              Cari marker{" "}
              <span className="text-sm font-normal text-slate-400">
                ({markers.length})
              </span>
            </h2>
            <input
              className="input mt-3"
              placeholder="Cari nama atau jenis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              {markers
                .filter((item) =>
                  `${item.name || ""} ${item.kind || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .slice(0, 100)
                .map((item) => (
                  <button
                    type="button"
                    key={String(item.id)}
                    onClick={() => {
                      setSelected(String(item.id));
                      setFocus({ id: String(item.id), request: Date.now() });
                      setMoving(false);
                      setPanel("details");
                    }}
                    className={`block w-full rounded-lg px-2 py-2 text-left text-xs ${selected === String(item.id) ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {String(item.name || item.kind || "Marker")}
                  </button>
                ))}
            </div>
          </section>}
          {panel === "cables" && <section className="card p-4">
            <h2 className="font-semibold">Kabel</h2>
            <fieldset disabled={!canEdit} className="mt-3 space-y-3">
              {[
                ["Dari", cableFrom, setCableFrom],
                ["Ke", cableTo, setCableTo],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="block">
                  <span className="label">{String(label)}</span>
                  <select
                    className="input"
                    value={String(value)}
                    onChange={(e) =>
                      (setter as (value: string) => void)(e.target.value)
                    }
                  >
                    <option value="">Pilih marker</option>
                    {markers.map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {String(item.name || item.id)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <button
                disabled={!cableFrom || !cableTo || cableFrom === cableTo}
                className="btn-secondary"
                onClick={addCable}
              >
                Tambah Kabel
              </button>
              {cables.map((cable) => (
                <div
                  key={String(cable.id)}
                  className="space-y-2 border-t pt-2 text-xs"
                >
                  <span className="block truncate">
                    {String(
                      markers.find(
                        (item) =>
                          String(item.id) === String(endpoint(cable, "start")),
                      )?.name ||
                        endpoint(cable, "start") ||
                        "Titik",
                    )}{" "}
                    →{" "}
                    {String(
                      markers.find(
                        (item) =>
                          String(item.id) === String(endpoint(cable, "end")),
                      )?.name ||
                        endpoint(cable, "end") ||
                        "Titik",
                    )}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className="label">Tipe kabel</span><select className="input" value={String(cable.type || "lan")} onChange={(e) => { const type = e.target.value; const colors: Record<string, string> = { lan: "#2563eb", fo: "#16a34a", power: "#dc2626", "current-large": "#ea580c", "current-small": "#a855f7" }; updateCable(String(cable.id), { type, color: colors[type], label: String(cable.label || type.toUpperCase()), labelColor: colors[type] }); }}><option value="lan">LAN</option><option value="fo">Fiber Optic</option><option value="power">Power</option><option value="current-large">Arus besar</option><option value="current-small">Arus kecil</option></select></label>
                    <label><span className="label">Label</span><input className="input" value={String(cable.label || "")} onChange={(e) => updateCable(String(cable.id), { label: e.target.value })} /></label>
                    <label><span className="label">Warna label</span><input className="input h-10 p-1" type="color" value={String(cable.labelColor || cable.color || "#2563eb")} onChange={(e) => updateCable(String(cable.id), { labelColor: e.target.value })} /></label>
                    <label><span className="label">Ukuran label</span><input className="input" type="number" min="1" max="8" step="0.1" value={Number(cable.labelSize || 2.4)} onChange={(e) => updateCable(String(cable.id), { labelSize: Number(e.target.value) })} /></label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => addBend(cable)}>Tambah titik belok</button>
                    <button className="btn-secondary" onClick={() => snapCable(cable)}>Snap ke marker</button>
                    <button className="text-rose-700" onClick={() => {
                      if (window.confirm("Hapus kabel ini?"))
                        change({
                          ...state,
                          cables: (state.cables || []).filter(
                            (item) => item !== cable,
                          ),
                        });
                    }}>Hapus</button>
                  </div>
                  <div className="space-y-1 rounded-lg bg-slate-50 p-2">
                    {resolvedPoints(cable).map((point, index) => <div key={index} className="grid grid-cols-[auto_1fr_1fr] items-center gap-2"><span>Titik {index + 1}</span><input className="input py-1" type="number" value={Number(point.x.toFixed(2))} onChange={(e) => { const points = resolvedPoints(cable); points[index] = { ...point, x: Number(e.target.value) }; updateCable(String(cable.id), { points }); }} /><input className="input py-1" type="number" value={Number(point.y.toFixed(2))} onChange={(e) => { const points = resolvedPoints(cable); points[index] = { ...point, y: Number(e.target.value) }; updateCable(String(cable.id), { points }); }} /></div>)}
                  </div>
                </div>
              ))}
            </fieldset>
          </section>}
        </aside>
      </div>
    </>
  );
}
