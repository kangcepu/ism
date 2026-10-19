"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { MapCanvas } from "../floor-map/map-canvas";
import { Empty, PageHeader } from "@/components/page";

type Asset = {
  id: number;
  code: string;
  name: string;
  status: string;
  category: { name: string };
  location: { name: string };
};
type Position = { assetId: number; x: number; y: number; asset: Asset };
type Room = {
  id: number;
  name: string;
  x: number;
  y: number;
  items: { assetId: number; asset: Asset }[];
};
type MapData = { positions: Position[]; rooms: Room[] };
type Background = {
  page: number;
  version: number;
  width: number;
  height: number;
  format: string;
  hasPng: boolean;
};

export default function MapAssetsPage() {
  const [data, setData] = useState<MapData>({ positions: [], rooms: [] });
  const [background, setBackground] = useState<Background>();
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("");
  const [roomName, setRoomName] = useState("");
  const [x, setX] = useState("50");
  const [y, setY] = useState("50");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const [map, inventory, backgrounds] = await Promise.all([
        api<MapData>("/map-assets"),
        api<Asset[]>(`/assets?perPage=100&q=${encodeURIComponent(search)}`),
        api<Background[]>("/floor-map/backgrounds"),
      ]);
      setData(map);
      setAssets(inventory);
      setBackground(backgrounds.find((item) => item.page === 1));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat peta aset.");
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(path: string, method: string, body?: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await load();
      setNotice("Peta aset diperbarui.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memperbarui peta.");
    } finally {
      setBusy(false);
    }
  }
  const markers = useMemo(
    () => [
      ...data.positions.map((position) => ({
        id: `asset-${position.assetId}`,
        name: `${position.asset.code} · ${position.asset.name}`,
        kind: position.asset.category.name,
        x: position.x,
        y: position.y,
      })),
      ...data.rooms.map((item) => ({
        id: `room-${item.id}`,
        name: `${item.name} · ${item.items.length} aset`,
        kind: "room",
        x: item.x,
        y: item.y,
      })),
    ],
    [data],
  );
  function selectMarker(id: string) {
    setMapSelected(id);
    setPlacing(false);
    if (id.startsWith("asset-")) {
      const item = data.positions.find(
        (position) => `asset-${position.assetId}` === id,
      );
      if (!item) return;
      setSelected(String(item.assetId));
      setRoom("");
      setX(String(item.x));
      setY(String(item.y));
    } else {
      const item = data.rooms.find((entry) => `room-${entry.id}` === id);
      if (!item) return;
      setRoom(String(item.id));
      setSelected("");
      setX(String(item.x));
      setY(String(item.y));
    }
  }
  function moveMarker(nextX: number, nextY: number) {
    if (!mapSelected) return;
    setPlacing(false);
    if (mapSelected.startsWith("asset-"))
      void act(`/map-assets/items/${mapSelected.slice(6)}/position`, "PUT", {
        x: nextX,
        y: nextY,
      });
    else
      void act(`/map-assets/rooms/${mapSelected.slice(5)}`, "PATCH", {
        x: nextX,
        y: nextY,
      });
  }
  if (loading) return <Empty text="Memuat peta aset…" />;
  return (
    <>
      <PageHeader
        title="Map Asset"
        description="Tempatkan aset atau kelompokkan ke dalam ruangan."
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
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <MapCanvas
            background={background}
            markers={markers}
            cables={[]}
            selected={mapSelected}
            focus={null}
            onSelect={selectMarker}
            onMove={moveMarker}
            moving={placing}
            onCancelMove={() => setPlacing(false)}
          />
          <p className="mt-3 text-xs text-slate-500">
            Denah Visio ditampilkan sebagai SVG vektor. Geser untuk menjelajah,
            scroll atau cubit untuk zoom, lalu pilih marker untuk melihat aset.
          </p>
        </div>
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold">Tempatkan Aset</h2>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="label">Cari Aset</span>
                <input
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kode atau nama aset"
                />
              </label>
              <label className="block">
                <span className="label">Aset</span>
                <select
                  className="input"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Pilih aset</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.code} · {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["X (%)", x, setX],
                  ["Y (%)", y, setY],
                ].map(([label, value, setter]) => (
                  <label key={String(label)}>
                    <span className="label">{String(label)}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      className="input"
                      value={String(value)}
                      onChange={(e) =>
                        (setter as (value: string) => void)(e.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!selected || busy}
                className="btn-secondary w-full"
                onClick={() => {
                  setMapSelected(`asset-${selected}`);
                  setPlacing(true);
                }}
              >
                Pilih Lokasi pada Denah
              </button>
              <button
                disabled={
                  !selected ||
                  busy ||
                  x === "" ||
                  y === "" ||
                  Number(x) < 0 ||
                  Number(x) > 100 ||
                  Number(y) < 0 ||
                  Number(y) > 100
                }
                className="btn-primary w-full"
                onClick={() =>
                  act(`/map-assets/items/${selected}/position`, "PUT", {
                    x: Number(x),
                    y: Number(y),
                  })
                }
              >
                Tempatkan di Peta
              </button>
              <button
                disabled={!selected || busy}
                className="btn-secondary w-full"
                onClick={() => {
                  if (window.confirm("Hapus posisi aset dari peta?"))
                    void act(
                      `/map-assets/items/${selected}/position`,
                      "DELETE",
                    );
                }}
              >
                Hapus Posisi
              </button>
            </div>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold">Ruangan</h2>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="label">Ruangan</span>
                <select
                  className="input"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                >
                  <option value="">Pilih ruangan</option>
                  {data.rooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!room || !selected || busy}
                className="btn-secondary w-full"
                onClick={() =>
                  act(`/map-assets/rooms/${room}/items/${selected}`, "PUT")
                }
              >
                Masukkan Aset ke Ruangan
              </button>
              <button
                disabled={
                  !room ||
                  !selected ||
                  busy ||
                  !data.rooms
                    .find((item) => String(item.id) === room)
                    ?.items.some((item) => String(item.assetId) === selected)
                }
                className="btn-secondary w-full"
                onClick={() => {
                  if (window.confirm("Keluarkan aset dari ruangan?"))
                    void act(
                      `/map-assets/rooms/${room}/items/${selected}`,
                      "DELETE",
                    );
                }}
              >
                Keluarkan Aset
              </button>
              <label className="block">
                <span className="label">Nama Ruangan Baru</span>
                <input
                  className="input"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </label>
              <button
                disabled={
                  !roomName.trim() ||
                  busy ||
                  x === "" ||
                  y === "" ||
                  Number(x) < 0 ||
                  Number(x) > 100 ||
                  Number(y) < 0 ||
                  Number(y) > 100
                }
                className="btn-secondary w-full"
                onClick={() =>
                  act("/map-assets/rooms", "POST", {
                    name: roomName,
                    x: Number(x),
                    y: Number(y),
                  })
                }
              >
                Tambah di Koordinat X/Y
              </button>
              <button
                disabled={!room || busy}
                className="btn-secondary w-full text-rose-700"
                onClick={() => {
                  if (
                    window.confirm(
                      "Hapus ruangan dari peta? Aset tidak dihapus dari inventaris.",
                    )
                  )
                    void act(`/map-assets/rooms/${room}`, "DELETE");
                }}
              >
                Hapus Ruangan
              </button>
            </div>
            {data.rooms
              .find((item) => String(item.id) === room)
              ?.items.map((item) => (
                <p key={item.assetId} className="mt-2 text-xs text-slate-500">
                  {item.asset.code} · {item.asset.name}
                </p>
              ))}
          </section>
        </aside>
      </div>
    </>
  );
}
