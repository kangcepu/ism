"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  Camera,
  Crosshair,
  Minus,
  Network,
  Plus,
  Radio,
  RotateCcw,
} from "lucide-react";
import { API } from "@/lib/api";

type MapMarker = {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  iconUrl?: string;
  scale?: number;
  color?: string;
  strokeColor?: string;
  labelColor?: string;
  labelSize?: number;
  ip?: string;
  mac?: string;
  notes?: string;
  live?: {
    status: "online" | "offline" | "degraded" | "unknown";
    source: string;
    message: string;
    checkedAt: string | null;
    temperature?: number | null;
    trafficInBps?: number | null;
    trafficOutBps?: number | null;
    fps?: number | null;
    clients?: number | null;
  };
};
type MapCable = {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  label?: string;
  labelColor?: string;
  labelSize?: number;
};
type Background = {
  page: number;
  version: number;
  width: number;
  height: number;
  format: string;
  hasPng: boolean;
};
type Point = { x: number; y: number };

function safeSvg(input: string) {
  const purifier = DOMPurify;
  const hook = (
    _node: Element,
    data: { attrName: string; attrValue: string; keepAttr: boolean },
  ) => {
    const name = data.attrName.toLowerCase();
    const value = data.attrValue;
    if (value.includes("\\") || name === "xml:base") data.keepAttr = false;
    if (name === "style") {
      const declarations = value.split(";").filter(Boolean);
      if (
        declarations.some(
          (entry) =>
            !/^\s*(fill|stroke|opacity|white-space|font-size|font-weight|font-family)\s*:\s*[\w\s.,%#()\-]+\s*$/i.test(
              entry,
            ) ||
            (/url\s*\(/i.test(entry) && !/url\(#[\w-]+\)/i.test(entry)),
        )
      )
        data.keepAttr = false;
    }
    if ((name === "href" || name === "xlink:href") && !/^#[\w.-]+$/.test(value))
      data.keepAttr = false;
    if (
      /url\s*\(/i.test(value) &&
      !/^\s*(?:[\w-]+\s*:\s*)?url\(#[\w-]+\)\s*;?\s*$/i.test(value)
    )
      data.keepAttr = false;
  };
  purifier.addHook("uponSanitizeAttribute", hook);
  try {
    const clean = purifier.sanitize(input, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: [
        "style",
        "image",
        "a",
        "foreignObject",
        "animate",
        "animateTransform",
        "animateMotion",
        "set",
      ],
    });
    const document = new DOMParser().parseFromString(clean, "image/svg+xml");
    const svg = document.documentElement;
    if (svg.localName !== "svg" || !svg.getAttribute("viewBox"))
      throw new Error("Denah SVG harus memiliki viewBox.");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "none");
    return new XMLSerializer().serializeToString(svg);
  } finally {
    purifier.removeHook("uponSanitizeAttribute");
  }
}

const rate = (value: number) => {
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  let amount = value;
  let index = 0;
  while (amount >= 1000 && index < units.length - 1) {
    amount /= 1000;
    index += 1;
  }
  return `${amount >= 100 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
};

export function MapCanvas({
  background,
  markers,
  cables,
  selected,
  focus,
  coverage,
  onSelect,
  onMove,
  moving,
  onCancelMove,
}: {
  background?: Background;
  markers: MapMarker[];
  cables: MapCable[];
  selected: string | null;
  focus: { id: string; request: number } | null;
  coverage?: {
    x: number;
    y: number;
    rotation: number;
    fieldOfView: number;
  } | null;
  onSelect: (id: string) => void;
  onMove: (x: number, y: number) => void;
  moving: boolean;
  onCancelMove: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const multiTouch = useRef(false);
  const gesture = useRef<{
    center: Point;
    distance: number;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [view, setView] = useState(viewRef.current);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [vector, setVector] = useState("");
  const [vectorError, setVectorError] = useState(false);
  const [showCables, setShowCables] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showRaster, setShowRaster] = useState(false);
  const updateView = useCallback(
    (next: { x: number; y: number; zoom: number }) => {
      viewRef.current = next;
      setView(next);
    },
    [],
  );
  const reset = useCallback(
    () => updateView({ x: 0, y: 0, zoom: 1 }),
    [updateView],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    reset();
    setShowRaster(false);
  }, [background?.page, reset]);
  useEffect(() => {
    setVector("");
    setVectorError(false);
    if (background?.format !== "svg") return;
    const abort = new AbortController();
    fetch(
      `${API}/floor-map/backgrounds/${background.page}/vector?v=${background.version}`,
      { credentials: "include", signal: abort.signal },
    )
      .then((response) => {
        if (!response.ok) throw new Error("Gagal memuat SVG");
        return response.text();
      })
      .then((text) => setVector(safeSvg(text)))
      .catch((error) => {
        if (error.name !== "AbortError") setVectorError(true);
      });
    return () => abort.abort();
  }, [background?.page, background?.version, background?.format]);
  const ratio = background ? background.width / background.height : 4500 / 6300;
  const baseWidth = Math.min(
    Math.max(size.width - 32, 1),
    Math.max(size.height - 32, 1) * ratio,
  );
  const baseHeight = baseWidth / ratio;
  const left = (size.width - baseWidth * view.zoom) / 2 + view.x;
  const top = (size.height - baseHeight * view.zoom) / 2 + view.y;
  useEffect(() => {
    if (!focus) return;
    const target = markers.find((item) => item.id === focus.id);
    if (!target) return;
    const zoom = Math.max(viewRef.current.zoom, 3);
    updateView({
      zoom,
      x: (0.5 - target.x / 100) * baseWidth * zoom,
      y: (0.5 - target.y / 100) * baseHeight * zoom,
    });
  }, [focus, baseWidth, baseHeight, updateView]);
  const zoomAt = useCallback(
    (zoom: number, point: Point) => {
      const current = viewRef.current;
      const nextZoom = Math.max(1, Math.min(12, zoom));
      const factor = nextZoom / current.zoom;
      updateView({
        zoom: nextZoom,
        x:
          point.x -
          size.width / 2 -
          (point.x - size.width / 2 - current.x) * factor,
        y:
          point.y -
          size.height / 2 -
          (point.y - size.height / 2 - current.y) * factor,
      });
    },
    [size, updateView],
  );
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      zoomAt(viewRef.current.zoom * Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [zoomAt]);
  function startGesture() {
    const items = [...pointers.current.values()];
    if (!items.length) {
      gesture.current = null;
      return;
    }
    const center =
      items.length > 1
        ? { x: (items[0].x + items[1].x) / 2, y: (items[0].y + items[1].y) / 2 }
        : items[0];
    const distance =
      items.length > 1
        ? Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y)
        : 0;
    gesture.current = { center, distance, ...viewRef.current };
  }
  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1) multiTouch.current = false;
    if (pointers.current.size > 1) multiTouch.current = true;
    startGesture();
  }
  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const items = [...pointers.current.values()];
    const center =
      items.length > 1
        ? { x: (items[0].x + items[1].x) / 2, y: (items[0].y + items[1].y) / 2 }
        : items[0];
    const start = gesture.current;
    const distance =
      items.length > 1
        ? Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y)
        : 0;
    const zoom =
      start.distance && distance
        ? Math.max(1, Math.min(12, (start.zoom * distance) / start.distance))
        : start.zoom;
    const rect = viewport.current!.getBoundingClientRect();
    const anchorX = start.center.x - rect.left - size.width / 2;
    const anchorY = start.center.y - rect.top - size.height / 2;
    const factor = zoom / start.zoom;
    updateView({
      zoom,
      x: anchorX - (anchorX - start.x) * factor + center.x - start.center.x,
      y: anchorY - (anchorY - start.y) * factor + center.y - start.center.y,
    });
  }
  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    const moved = start
      ? Math.hypot(
          event.clientX - start.center.x,
          event.clientY - start.center.y,
        )
      : 0;
    pointers.current.delete(event.pointerId);
    if (
      moving &&
      !multiTouch.current &&
      start &&
      moved < 5 &&
      pointers.current.size === 0 &&
      stage.current
    ) {
      const rect = stage.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) onMove(x, y);
    }
    startGesture();
  }
  const center = { x: size.width / 2, y: size.height / 2 };
  return (
    <section
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      aria-label="Denah infrastruktur"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span
            className={`h-2 w-2 rounded-full ${background?.format === "svg" && !showRaster && !vectorError ? "bg-emerald-500" : "bg-amber-400"}`}
          />
          {background?.format === "svg" && !showRaster && !vectorError
            ? "DENAH VEKTOR"
            : background
              ? "DENAH GAMBAR"
              : "BELUM ADA DENAH"}
          <span className="font-normal text-slate-400">
            · {markers.length} marker · {cables.length} kabel
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showCables}
              onChange={(e) => setShowCables(e.target.checked)}
            />{" "}
            Kabel
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />{" "}
            Nama marker
          </label>
          {background?.format === "svg" && background.hasPng && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showRaster}
                onChange={(e) => setShowRaster(e.target.checked)}
              />{" "}
              PNG lama
            </label>
          )}
        </div>
      </div>
      <div
        ref={viewport}
        className={`relative h-[58vh] min-h-[380px] max-h-[760px] overflow-hidden bg-slate-100 lg:h-[calc(100vh-15rem)] ${moving ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        style={{ touchAction: "none" }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          startGesture();
        }}
      >
        <div
          ref={stage}
          className="absolute bg-white shadow-sm"
          style={{
            width: baseWidth,
            height: baseHeight,
            left,
            top,
            transform: `scale(${view.zoom})`,
            transformOrigin: "top left",
          }}
        >
          {background &&
            (background.format === "svg" && !showRaster && vector ? (
              <div
                className="pointer-events-none absolute inset-0"
                dangerouslySetInnerHTML={{ __html: vector }}
              />
            ) : background.hasPng ? (
              <img
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full"
                src={`${API}/floor-map/backgrounds/${background.page}?v=${background.version}`}
              />
            ) : null)}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {coverage &&
              Number.isFinite(coverage.rotation) &&
              Number.isFinite(coverage.fieldOfView) &&
              coverage.fieldOfView > 0 &&
              coverage.fieldOfView <= 360 &&
              (() => {
                const steps = Math.max(4, Math.ceil(coverage.fieldOfView / 6));
                const points = Array.from({ length: steps + 1 }, (_, index) => {
                  const radians =
                    ((coverage.rotation -
                      coverage.fieldOfView / 2 +
                      (coverage.fieldOfView * index) / steps -
                      90) *
                      Math.PI) /
                    180;
                  return `${coverage.x + 8 * Math.cos(radians)},${coverage.y + ((8 * baseWidth) / baseHeight) * Math.sin(radians)}`;
                });
                return (
                  <polygon
                    points={`${coverage.x},${coverage.y} ${points.join(" ")}`}
                    fill="#0ea5e9"
                    fillOpacity="0.2"
                    stroke="#0284c7"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })()}
            {showCables &&
              cables
                .filter((cable) => cable.points.length > 1)
                .map((cable) => (
                  <g key={cable.id}>
                  <polyline
                    points={cable.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={cable.color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {cable.label && cable.points.length > 1 && (() => {
                    const point = cable.points[Math.floor(cable.points.length / 2)];
                    return <text x={point.x} y={point.y - 1.5} fill={cable.labelColor || cable.color} fontSize={cable.labelSize || 2.4} fontWeight="600" textAnchor="middle">{cable.label}</text>;
                  })()}
                  </g>
                ))}
          </svg>
          {markers.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.name}
              aria-label={item.name}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.id);
              }}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: `translate(-50%, -50%) scale(${(item.scale || 1) / view.zoom})`,
                backgroundColor: item.color,
                borderColor: item.strokeColor,
              }}
              className={`group absolute z-10 grid h-7 w-7 place-items-center overflow-hidden rounded-full border-2 border-white shadow-md focus:z-30 focus:outline-none focus:ring-2 focus:ring-blue-500 ${selected === item.id ? "z-20 bg-blue-700 ring-2 ring-blue-300" : item.kind.toLowerCase().includes("cctv") ? "bg-emerald-600" : item.kind.toLowerCase().includes("ap") ? "bg-violet-600" : "bg-blue-600"}`}
            >
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="h-full w-full object-contain p-0.5"
                />
              ) : item.kind.toLowerCase().includes("cctv") ? (
                <Camera size={15} className="text-white" />
              ) : item.kind.toLowerCase().includes("ap") ? (
                <Radio size={15} className="text-white" />
              ) : (
                <Network size={15} className="text-white" />
              )}
              <span
                className={`pointer-events-none absolute left-1/2 top-full mt-1 w-max max-w-44 -translate-x-1/2 truncate rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold shadow ${showLabels || selected === item.id ? "block" : "hidden group-hover:block group-focus:block"}`}
                style={{ color: item.labelColor || "#334155", fontSize: item.labelSize || 10 }}
              >
                {item.name}
              </span>
              {item.live && (
                <span
                  aria-hidden="true"
                  className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white ${item.live.status === "online" ? "bg-emerald-500" : item.live.status === "offline" ? "bg-rose-500" : item.live.status === "degraded" ? "bg-amber-400" : "bg-slate-400"}`}
                />
              )}
              {item.live && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-xl group-hover:block group-focus:block">
                  <span className="block font-semibold text-slate-900">{item.name}</span>
                  <span className="mt-1 block capitalize">{item.live.status} · {item.live.source}</span>
                  {item.ip && <span className="mt-1 block">IP: {item.ip}</span>}
                  {item.mac && <span className="block">MAC: {item.mac}</span>}
                  {item.live.temperature != null && <span className="mt-1 block">Suhu chassis: {item.live.temperature} °C</span>}
                  {item.live.trafficInBps != null && <span className="block">Masuk: {rate(item.live.trafficInBps)}</span>}
                  {item.live.trafficOutBps != null && <span className="block">Keluar: {rate(item.live.trafficOutBps)}</span>}
                  {item.live.fps != null && <span className="block">FPS kamera: {item.live.fps}</span>}
                  {item.live.clients != null && <span className="block">Klien AP: {item.live.clients}</span>}
                  {item.notes && <span className="mt-1 block text-slate-500">{item.notes}</span>}
                  <span className="mt-1 block text-slate-500">{item.live.message}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        {vectorError && !showRaster && (
          <div
            role="alert"
            className="absolute left-3 top-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            {background?.hasPng
              ? "Denah vektor gagal dimuat; menampilkan PNG."
              : "Denah vektor gagal dimuat."}
          </div>
        )}
        {moving && (
          <div className="absolute left-3 top-3 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white">
            Ketuk posisi baru pada denah.{" "}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onCancelMove}
              className="ml-2 underline"
            >
              Batal
            </button>
          </div>
        )}
        <div
          className="absolute bottom-3 right-3 flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Perkecil denah"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={() => zoomAt(viewRef.current.zoom / 1.5, center)}
          >
            <Minus size={17} />
          </button>
          <span className="min-w-12 text-center text-xs font-semibold text-slate-600">
            {Math.round(view.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Perbesar denah"
            className="rounded-lg p-2 hover:bg-slate-100"
            onClick={() => zoomAt(viewRef.current.zoom * 1.5, center)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            aria-label="Tampilkan seluruh denah"
            className="rounded-lg border-l border-slate-200 p-2 hover:bg-slate-100"
            onClick={reset}
          >
            <RotateCcw size={16} />
          </button>
        </div>
        {!background && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
            <span className="flex items-center gap-2">
              <Crosshair size={18} /> Unggah denah untuk halaman ini
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-xs text-slate-500">
        <span>
          Geser untuk menjelajah · scroll atau cubit untuk zoom · pilih titik
          untuk melihat marker
        </span>
        <span className="text-slate-400">
          {background?.format === "svg" && !showRaster && !vectorError
            ? "SVG"
            : "PNG"}
        </span>
      </div>
    </section>
  );
}
