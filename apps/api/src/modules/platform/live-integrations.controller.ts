import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Actor, FloorEdit, FloorView } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { redactFloorSecrets } from "./floor-map.controller";
import { CctvLiveService } from "../cctv/cctv-live.controller";

type MapMarker = Record<string, unknown>;
type UniFiAp = { markerId: string; status: "online" | "offline" | "unknown"; clients: number | null; updatedAt: string; message: string };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const privateIp = (value: string) => {
  const parts = value.split(".").map(Number);
  return isIP(value) === 4 && (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127 || parts[0] === 200 && parts[1] === 200);
};
const key = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]/g, "");

@Injectable()
export class UniFiLiveService {
  private until = 0;
  private cache = new Map<string, UniFiAp>();
  constructor(private readonly db: PrismaService, private readonly crypto: CryptoService) {}
  private async call(url: URL, path: string, body: object | null, cookies: string, insecure: boolean) {
    return new Promise<{ status: number; body: Record<string, unknown>; cookies: string }>((resolve, reject) => {
      const request = httpsRequest({ protocol: "https:", hostname: url.hostname, port: Number(url.port || 443), path, method: body ? "POST" : "GET", rejectUnauthorized: !insecure, timeout: 5000, headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(cookies ? { cookie: cookies } : {}) } }, (response) => {
        let data = "";
        response.on("data", (chunk: Buffer) => { data += chunk; if (data.length > 2_000_000) request.destroy(new Error("Respons UniFi terlalu besar.")); });
        response.on("end", () => {
          try { resolve({ status: response.statusCode || 0, body: data ? JSON.parse(data) : {}, cookies: (response.headers["set-cookie"] || []).map((item) => item.split(";", 1)[0]).join("; ") }); } catch { reject(new Error("Respons UniFi tidak valid.")); }
        });
      });
      request.on("timeout", () => request.destroy(new Error("UniFi melebihi batas waktu.")));
      request.on("error", reject);
      if (body) request.write(JSON.stringify(body));
      request.end();
    });
  }
  async current(markers: MapMarker[]) {
    if (Date.now() < this.until) return this.cache;
    const apMarkers = markers.filter((marker) => text(marker.kind).toLowerCase().includes("ap"));
    const result = new Map<string, UniFiAp>();
    const now = new Date().toISOString();
    const row = await this.db.integrationResource.findFirst({ where: { domain: "unifi", active: true, deletedAt: null }, orderBy: { updatedAt: "desc" } });
    if (!row || !row.secret) {
      for (const marker of apMarkers) result.set(text(marker.id), { markerId: text(marker.id), status: "unknown", clients: null, updatedAt: now, message: "Controller UniFi belum terhubung." });
      this.cache = result; this.until = Date.now() + 15000; return result;
    }
    try {
      const base = new URL(row.name);
      if (base.protocol !== "https:" || !privateIp(base.hostname)) throw new Error("Alamat UniFi tidak diizinkan.");
      const config = row.config as { site?: string; username?: string; allowSelfSigned?: boolean };
      const password = this.crypto.decrypt(row.secret);
      let login = await this.call(base, "/api/auth/login", { username: config.username || "", password }, "", Boolean(config.allowSelfSigned));
      let prefix = "/proxy/network";
      if (login.status === 404 || login.status === 405) { login = await this.call(base, "/api/login", { username: config.username || "", password }, "", Boolean(config.allowSelfSigned)); prefix = ""; }
      if (login.status < 200 || login.status >= 300 || !login.cookies) throw new Error("Login UniFi ditolak.");
      const site = encodeURIComponent(config.site || "default");
      const devices = await this.call(base, `${prefix}/api/s/${site}/stat/device`, null, login.cookies, Boolean(config.allowSelfSigned));
      const data = Array.isArray(devices.body.data) ? devices.body.data as Record<string, unknown>[] : [];
      for (const marker of apMarkers) {
        const host = text(marker.apHost || marker.ip); const mac = key(marker.apMac); const name = key(marker.name);
        const matches = data.filter((device) => text(device.type).toLowerCase() === "uap" && (mac ? key(device.mac) === mac : host ? text(device.ip) === host : key(device.name) === name));
        const device = matches.length === 1 ? matches[0] : null;
        result.set(text(marker.id), device ? { markerId: text(marker.id), status: Number(device.state) === 1 ? "online" : "offline", clients: Number.isFinite(Number(device.num_sta)) ? Number(device.num_sta) : null, updatedAt: now, message: "Status UniFi realtime." } : { markerId: text(marker.id), status: "unknown", clients: null, updatedAt: now, message: "AP tidak ditemukan pada site UniFi." });
      }
    } catch (error) {
      for (const marker of apMarkers) result.set(text(marker.id), { markerId: text(marker.id), status: "unknown", clients: null, updatedAt: now, message: error instanceof Error ? error.message : "UniFi tidak dapat dihubungi." });
    }
    this.cache = result; this.until = Date.now() + 15000; return result;
  }
}

@Controller("unifi/session")
export class UnifiController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  @Get() async status() {
    const row = await this.db.integrationResource.findFirst({
      where: { domain: "unifi", deletedAt: null },
      select: {
        id: true,
        name: true,
        config: true,
        active: true,
        updatedAt: true,
        secret: true,
      },
    });
    return {
      configured: Boolean(row),
      connected: Boolean(row?.active),
      controller: row?.name || null,
      config: row?.config || null,
      credentialsRemembered: Boolean(row?.secret),
      updatedAt: row?.updatedAt || null,
    };
  }
  @Post() async connect(
    @Body()
    body: {
      url: string;
      site?: string;
      username: string;
      password: string;
      remember?: boolean;
    },
  ) {
    const config = { site: body.site || "default", username: body.username };
    return this.db.integrationResource.upsert({
      where: { domain_name: { domain: "unifi", name: body.url } },
      create: {
        domain: "unifi",
        name: body.url,
        config,
        secret: body.remember ? this.crypto.encrypt(body.password) : null,
        active: true,
      },
      update: {
        config,
        secret: body.remember ? this.crypto.encrypt(body.password) : undefined,
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true, config: true, active: true },
    });
  }
  @Delete() async disconnect() {
    await this.db.integrationResource.updateMany({
      where: { domain: "unifi" },
      data: { active: false, secret: null },
    });
    return { disconnected: true };
  }
}

@FloorView()
@Controller("floor-map/markers")
export class MarkerActionsController {
  constructor(private readonly db: PrismaService, private readonly cctvLive: CctvLiveService, private readonly unifiLive: UniFiLiveService) {}
  private async marker(id: string) {
    const state = await this.db.floorMapState.findUnique({
      where: { key: "default" },
    });
    const markers =
      (state?.state as { markers?: Record<string, unknown>[] } | null)
        ?.markers || [];
    const marker = markers.find((x) => String(x.id) === id);
    if (!marker) throw new NotFoundException("Marker tidak ditemukan.");
    return marker;
  }
  @Get(":id/temperature") async temperature(@Param("id") id: string) {
    const marker = await this.marker(id);
    return {
      markerId: id,
      temperature: marker.temperature ?? null,
      scope: "chassis",
      persisted: true,
    };
  }
  @Get("live") async live() {
    const state = await this.db.floorMapState.findUnique({ where: { key: "default" } });
    const markers = ((state?.state as { markers?: MapMarker[] } | null)?.markers || []);
    const monitors = await this.db.networkMonitor.findMany({ where: { deletedAt: null }, select: { id: true, name: true, host: true, lastStatus: true, latencyMs: true, lastCheckedAt: true, snapshot: true } });
    const [cctv, aps] = await Promise.all([this.cctvLive.current().catch(() => []), this.unifiLive.current(markers)]);
    const cameras = new Map(cctv.map((item) => [item.markerId, item]));
    const updatedAt = new Date().toISOString();
    const data = Object.fromEntries(markers.map((marker) => {
      const id = text(marker.id); const kind = text(marker.kind).toLowerCase();
      if (kind.includes("cctv")) { const item = cameras.get(id); return [id, { status: item?.status || "unknown", source: "BLUE_IRIS", checkedAt: item?.checkedAt || updatedAt, message: item?.message || "Blue Iris belum tersedia.", recording: item?.recording ?? null, fps: item?.fps ?? null }]; }
      if (kind.includes("ap")) { const item = aps.get(id); return [id, { status: item?.status || "unknown", source: "UNIFI", checkedAt: item?.updatedAt || updatedAt, message: item?.message || "UniFi belum tersedia.", clients: item?.clients ?? null }]; }
      const monitor = monitors.find((item) => text(item.host) === text(marker.snmpHost || marker.ip) || key(item.name) === key(marker.name));
      const snapshot = monitor?.snapshot && typeof monitor.snapshot === "object" ? monitor.snapshot as Record<string, unknown> : {};
      const legacy = snapshot.legacy && typeof snapshot.legacy === "object" ? snapshot.legacy as Record<string, unknown> : {};
      const summary = snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary as Record<string, unknown> : {};
      const ports = Array.isArray(snapshot.ports) ? snapshot.ports : [];
      return [id, { status: monitor?.lastStatus || "unknown", source: "SNMP", checkedAt: monitor?.lastCheckedAt?.toISOString() || null, message: monitor ? "Status monitor realtime." : "Monitor SNMP belum dipasangkan.", latencyMs: monitor?.latencyMs ? Number(monitor.latencyMs) : null, temperature: Number(summary.temperature_c ?? legacy.last_temperature_c ?? marker.temperature) || null, trafficInBps: Number(legacy.last_traffic_in_bps ?? summary.traffic_in_bps_total ?? marker.trafficInBps) || null, trafficOutBps: Number(legacy.last_traffic_out_bps ?? summary.traffic_out_bps_total ?? marker.trafficOutBps) || null, ports: ports.length, openPorts: legacy.last_open_ports || null }];
    }));
    return { updatedAt, markers: data };
  }
  @Get(":id/traffic") async traffic(@Param("id") id: string) {
    const marker = await this.marker(id);
    return { markerId: id, traffic: marker.traffic ?? null, persisted: true };
  }
  @Get(":id/ports") async ports(@Param("id") id: string) {
    const marker = await this.marker(id);
    return { markerId: id, ports: marker.ports ?? [], persisted: true };
  }
  @Get(":id/ap-status") async ap(@Param("id") id: string) {
    const marker = await this.marker(id);
    return {
      markerId: id,
      status: marker.status ?? "unknown",
      persisted: true,
    };
  }
  @Get(":id/unifi-detail") async unifi(@Param("id") id: string) {
    return {
      marker: redactFloorSecrets(await this.marker(id)),
      clients: [],
      message: "Live UniFi detail membutuhkan controller terhubung.",
    };
  }
  @Get(":id/cctv-status") async cctv(@Param("id") id: string) {
    const marker = await this.marker(id);
    return {
      markerId: id,
      status: marker.status ?? "unknown",
      persisted: true,
    };
  }
  @Get(":id/cctv-record-count") async records(@Param("id") id: string) {
    await this.marker(id);
    return {
      markerId: id,
      day: 0,
      week: 0,
      month: 0,
      all: 0,
      message: "Blue Iris belum terhubung.",
    };
  }
}

@FloorView()
@Controller("switch-remote")
export class SwitchRemoteController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  @Get("devices") devices() {
    return this.db.integrationResource.findMany({
      where: { domain: "switch-device", deletedAt: null },
      select: {
        id: true,
        name: true,
        config: true,
        active: true,
        updatedAt: true,
      },
    });
  }
  @FloorEdit() @Post("sessions") async session(
    @Body()
    body: {
      host: string;
      name: string;
      markerId?: string;
      location?: string;
      model?: string;
      sshPort?: number;
      portCount?: number;
      username: string;
      password: string;
    },
    @Actor() actor: RequestUser,
  ) {
    const token = this.crypto.token(24);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.db.integrationResource.create({
      data: {
        domain: "switch-session",
        name: this.crypto.hash(token),
        externalId: String(actor.id),
        config: {
          host: body.host,
          name: body.name,
          markerId: body.markerId,
          location: body.location,
          model: body.model,
          sshPort: body.sshPort || 22,
          portCount: body.portCount,
          username: body.username,
          expiresAt: expiresAt.toISOString(),
          used: false,
        },
        secret: this.crypto.encrypt(body.password),
        active: true,
      },
    });
    return { token, expiresAt };
  }
  @Get("sessions/:token") async read(
    @Param("token") token: string,
    @Actor() actor: RequestUser,
  ) {
    const row = await this.db.integrationResource.findFirst({
      where: {
        domain: "switch-session",
        name: this.crypto.hash(token),
        externalId: String(actor.id),
        active: true,
      },
      select: { id: true, config: true },
    });
    if (!row) throw new NotFoundException("Session tidak valid.");
    const config = row.config as { expiresAt?: string; used?: boolean };
    if (
      config.used ||
      !config.expiresAt ||
      new Date(config.expiresAt) < new Date()
    )
      throw new NotFoundException("Session sudah dipakai atau kedaluwarsa.");
    await this.db.integrationResource.update({
      where: { id: row.id },
      data: { active: false, config: { ...config, used: true } },
    });
    return {
      prepared: true,
      config: { ...(row.config as object), used: undefined },
    };
  }
}
