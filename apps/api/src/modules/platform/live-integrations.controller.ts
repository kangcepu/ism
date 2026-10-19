import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { Actor, FloorEdit, FloorView } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { redactFloorSecrets } from "./floor-map.controller";

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
  constructor(private readonly db: PrismaService) {}
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
