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
const markerId = () => crypto.randomUUID();

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
    change({
      ...state,
      cables: [
        ...(state.cables || []),
        { id: markerId(), from: cableFrom, to: cableTo, page },
      ],
    });
    setCableFrom("");
    setCableTo("");
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
            markers={markers.map((item) => ({
              id: String(item.id),
              name: String(item.name || item.kind || "Marker"),
              kind: String(item.kind || "other"),
              iconUrl: item.customIconUrl
                ? `${API}/floor-map/icons/${String(item.customIconUrl).split("/").pop()}`
                : undefined,
              x: percent(item.x, "x"),
              y: percent(item.y, "y"),
            }))}
            cables={cables.map((cable) => {
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
        <aside className="space-y-4">
          <section className="card p-4">
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
          </section>
          <section className="card p-4">
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
                    }}
                    className={`block w-full rounded-lg px-2 py-2 text-left text-xs ${selected === String(item.id) ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {String(item.name || item.kind || "Marker")}
                  </button>
                ))}
            </div>
          </section>
          <section className="card p-4">
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
                  className="flex items-center gap-2 border-t pt-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
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
                  <button
                    className="text-rose-700"
                    onClick={() => {
                      if (window.confirm("Hapus kabel ini?"))
                        change({
                          ...state,
                          cables: (state.cables || []).filter(
                            (item) => item !== cable,
                          ),
                        });
                    }}
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </fieldset>
          </section>
        </aside>
      </div>
    </>
  );
}
