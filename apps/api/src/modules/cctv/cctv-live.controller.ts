import { Controller, Get, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Actor } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { access } from "./cctv.controller";

type Marker = Record<string, unknown>;
type Json = Record<string, unknown>;
type LiveResult = {
  cameraId: number | null;
  markerId: string;
  status: "online" | "offline" | "unknown";
  recording: boolean | null;
  fps: number | null;
  checkedAt: string;
  source: "BLUE_IRIS";
  message: string;
};
function key(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function serverUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const input = value.trim();
    const url = new URL(input.includes("://") ? input : `http://${input}`);
    const parts = url.hostname.split(".").map(Number);
    const privateIp =
      isIP(url.hostname) === 4 &&
      (parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168));
    if (
      !privateIp ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    )
      return null;
    return `${url.origin}/json`;
  } catch {
    return null;
  }
}
function succeeded(value: Json) {
  const result = String(value.result || "").toLowerCase();
  return (
    result === "success" ||
    result === "ok" ||
    (!result && Array.isArray(value.data))
  );
}
async function request(url: string, data: Json): Promise<Json> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") || 0) > 2000000
  )
    throw new Error("Blue Iris unavailable");
  const text = await response.text();
  if (text.length > 2000000) throw new Error("Blue Iris response too large");
  const result: unknown = JSON.parse(text);
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Invalid Blue Iris response");
  return result as Json;
}
function cameraList(response: Json): Json[] {
  let data = response.data ?? response.cameras ?? response.camera;
  if (data && typeof data === "object" && !Array.isArray(data))
    data = (data as Json).cameras;
  return Array.isArray(data)
    ? data.filter((item): item is Json =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}
function status(camera: Json) {
  const states = [
    camera.status,
    camera.state,
    camera.message,
    camera.error,
    camera.reason,
    camera.lastError,
    camera.color,
  ]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  const fpsValues = [
    camera.fps,
    camera.fps2,
    camera.fpsMain,
    camera.fpsSub,
  ].filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  ) as number[];
  const fps = fpsValues.length ? Math.max(...fpsValues) : null;
  let value: LiveResult["status"] = "unknown";
  if (
    /no\s*signal|offline|disconnect|disabled|error|failed|socket|loss|lost/.test(
      states,
    )
  )
    value = "offline";
  else if (
    /\bonline\b|\bconnected\b|\brunning\b|\bactive\b|\bgreen\b|\bok\b/.test(
      states,
    )
  )
    value = "online";
  else if (typeof camera.isOnline === "boolean")
    value = camera.isOnline ? "online" : "offline";
  else if (typeof camera.online === "boolean")
    value = camera.online ? "online" : "offline";
  else if (fps !== null) value = fps > 0 ? "online" : "offline";
  const recording =
    typeof camera.recording === "boolean"
      ? camera.recording
      : typeof camera.isRecording === "boolean"
        ? camera.isRecording
        : null;
  return { status: value, recording, fps };
}

@Injectable()
export class CctvLiveService {
  private expiresAt = 0;
  private cache: LiveResult[] = [];
  private inFlight: Promise<LiveResult[]> | null = null;
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  async current() {
    if (Date.now() < this.expiresAt) return this.cache;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.poll()
      .then((result) => {
        this.cache = result;
        this.expiresAt = Date.now() + 15000;
        return result;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
  private async poll() {
    const [map, cameras] = await Promise.all([
      this.db.floorMapState.findUnique({ where: { key: "default" } }),
      this.db.cctvCamera.findMany({
        where: { sourceMarkerId: { not: null } },
        select: { id: true, sourceMarkerId: true, name: true, address: true },
      }),
    ]);
    const state = map?.state as { markers?: Marker[] } | undefined;
    const markers = new Map(
      (Array.isArray(state?.markers) ? state.markers : []).map((marker) => [
        String(marker.id),
        marker,
      ]),
    );
    const groups = new Map<
      string,
      {
        url: string;
        user: string;
        password: string;
        rows: Array<{ cameraId: number | null; markerId: string; marker: Marker }>;
      }
    >();
    const checkedAt = new Date().toISOString();
    const result: LiveResult[] = [];
    const unknown = (cameraId: number | null, markerId: string, message: string): LiveResult => ({
      cameraId,
      markerId,
      status: "unknown",
      recording: null,
      fps: null,
      checkedAt,
      source: "BLUE_IRIS",
      message,
    });
    const mapped = new Set<string>();
    for (const camera of cameras) {
      const markerId = camera.sourceMarkerId?.startsWith("floor-map:")
        ? camera.sourceMarkerId.slice(10)
        : "";
      const marker = markers.get(markerId);
      const url = serverUrl(marker?.blueIrisServer);
      const user =
        typeof marker?.blueIrisUser === "string" ? marker.blueIrisUser : "";
      let password =
        typeof marker?.blueIrisPass === "string" ? marker.blueIrisPass : "";
      try {
        if (password.startsWith("enc:v1:"))
          password = this.crypto.decrypt(password.slice(7));
      } catch {
        password = "";
      }
      if (!marker || !url) {
        result.push(
          unknown(
            camera.id,
            markerId,
            "Konfigurasi Blue Iris belum tersedia atau alamat tidak didukung.",
          ),
        );
        continue;
      }
      mapped.add(markerId);
      const groupKey = createHash("sha256")
        .update(`${url}\0${user}\0${password}`)
        .digest("hex");
      if (!groups.has(groupKey))
        groups.set(groupKey, { url, user, password, rows: [] });
      groups.get(groupKey)!.rows.push({ cameraId: camera.id, markerId, marker });
    }
    for (const [markerId, marker] of markers) {
      if (mapped.has(markerId) || !String(marker.kind || "").toLowerCase().includes("cctv")) continue;
      const url = serverUrl(marker.blueIrisServer);
      const user = typeof marker.blueIrisUser === "string" ? marker.blueIrisUser : "";
      let password = typeof marker.blueIrisPass === "string" ? marker.blueIrisPass : "";
      try {
        if (password.startsWith("enc:v1:")) password = this.crypto.decrypt(password.slice(7));
      } catch {
        password = "";
      }
      if (!url) {
        result.push(unknown(null, markerId, "Konfigurasi Blue Iris belum tersedia atau alamat tidak didukung."));
        continue;
      }
      const groupKey = createHash("sha256").update(`${url}\0${user}\0${password}`).digest("hex");
      if (!groups.has(groupKey)) groups.set(groupKey, { url, user, password, rows: [] });
      groups.get(groupKey)!.rows.push({ cameraId: null, markerId, marker });
    }
    const allGroups = [...groups.values()];
    for (let index = 0; index < allGroups.length; index += 4) {
      await Promise.all(
        allGroups.slice(index, index + 4).map(async (group) => {
          try {
            let response = await request(group.url, { cmd: "camlist" });
            if (!succeeded(response)) {
              let session =
                typeof response.session === "string" ? response.session : "";
              if (!session) {
                const initial = await request(group.url, { cmd: "login" });
                session =
                  typeof initial.session === "string" ? initial.session : "";
              }
              if (!session || !group.user || !group.password)
                throw new Error("Blue Iris authentication unavailable");
              const digest = createHash("md5")
                .update(`${group.user}:${session}:${group.password}`)
                .digest("hex");
              const login = await request(group.url, {
                cmd: "login",
                session,
                response: digest,
              });
              if (!succeeded(login))
                throw new Error("Blue Iris authentication failed");
              response = await request(group.url, {
                cmd: "camlist",
                session:
                  typeof login.session === "string" ? login.session : session,
              });
            }
            if (!succeeded(response))
              throw new Error("Blue Iris camlist unavailable");
            const entries = cameraList(response);
            for (const row of group.rows) {
              const names = [
                row.marker.blueIrisCameraId,
                row.marker.name,
                row.marker.ip,
              ]
                .map(key)
                .filter(Boolean);
              const matches = entries.filter((item) =>
                [
                  item.shortName,
                  item.optionValue,
                  item.optionDisplay,
                  item.name,
                  item.camera,
                  item.cam,
                  item.display,
                  item.ip,
                  item.address,
                ].some((v) => names.includes(key(v)) && key(v)),
              );
              if (matches.length !== 1) {
                result.push(
                  unknown(
                    row.cameraId,
                    row.markerId,
                    matches.length
                      ? "Kamera Blue Iris tidak unik."
                      : "Kamera tidak ditemukan di Blue Iris.",
                  ),
                );
                continue;
              }
              result.push({
                cameraId: row.cameraId,
                markerId: row.markerId,
                ...status(matches[0]),
                checkedAt,
                source: "BLUE_IRIS",
                message: "Hasil pemeriksaan Blue Iris.",
              });
            }
          } catch {
            for (const row of group.rows)
              result.push(
                  unknown(
                  row.cameraId,
                  row.markerId,
                  "Blue Iris tidak dapat dihubungi atau autentikasi gagal.",
                ),
              );
          }
        }),
      );
    }
    return result;
  }
}

@Controller("cctv")
export class CctvLiveController {
  constructor(private readonly live: CctvLiveService) {}
  @Get("live") liveStatus(@Actor() actor: RequestUser) {
    access(actor);
    return this.live.current();
  }
}
