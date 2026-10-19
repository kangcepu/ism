import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  Post,
} from "@nestjs/common";
import {
  Actor,
  AdminOnly,
  FloorEdit,
  FloorView,
} from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { CryptoService } from "../../common/crypto.service";
import {
  AreaDto,
  FloorStateDto,
  PermissionDto,
  PositionDto,
  RoomDto,
} from "./platform.dto";

const floorSecretKey = /password|secret|token|community|pass$/i;
export function redactFloorSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactFloorSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      floorSecretKey.test(key) ? [] : [[key, redactFloorSecrets(item)]],
    ),
  );
}
function protectFloorSecrets(
  value: unknown,
  previous: unknown,
  crypto: CryptoService,
): unknown {
  if (Array.isArray(value)) {
    const before = Array.isArray(previous) ? previous : [];
    return value.map((item, index) => {
      const id =
        item && typeof item === "object" && "id" in item ? item.id : undefined;
      const old =
        id === undefined
          ? before[index]
          : before.find(
              (entry) =>
                entry &&
                typeof entry === "object" &&
                "id" in entry &&
                entry.id === id,
            );
      return protectFloorSecrets(item, old, crypto);
    });
  }
  if (!value || typeof value !== "object") return value;
  const before =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {};
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input)) {
    if (floorSecretKey.test(key)) {
      output[key] =
        typeof item === "string" && item && !item.startsWith("enc:v1:")
          ? `enc:v1:${crypto.encrypt(item)}`
          : item;
    } else output[key] = protectFloorSecrets(item, before[key], crypto);
  }
  for (const [key, item] of Object.entries(before)) {
    if (floorSecretKey.test(key) && !(key in input))
      output[key] =
        typeof item === "string" && item && !item.startsWith("enc:v1:")
          ? `enc:v1:${crypto.encrypt(item)}`
          : item;
  }
  return output;
}
async function canEditFloor(db: PrismaService, actor: RequestUser) {
  if (actor.role === "admin") return true;
  const [direct, memberships] = await Promise.all([
    db.floorMapPermission.findUnique({ where: { userId: actor.id } }),
    db.floorMapGroupMember.findMany({
      where: { userId: actor.id },
      include: { group: true },
    }),
  ]);
  return (
    direct?.access === "edit" ||
    memberships.some((item) => item.group.access === "edit")
  );
}

@FloorView()
@Controller("floor-map")
export class FloorMapController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  @Get("editor") async editor(@Actor() actor: RequestUser) {
    const canEdit = await canEditFloor(this.db, actor);
    const record = (await this.db.floorMapState.findUnique({
      where: { key: "default" },
    })) || {
      key: "default",
      state: { page: 1, zoom: 1, markers: [], cables: [], pageNames: {} },
    };
    return {
      ...record,
      state: redactFloorSecrets(record.state),
      canEdit,
    };
  }
  @Get("cctv-coverage") coverage() {
    return this.db.cctvCamera.findMany({
      where: {
        sourceMarkerId: { startsWith: "floor-map:" },
        fieldOfView: { not: null },
      },
      select: {
        sourceMarkerId: true,
        rotation: true,
        fieldOfView: true,
        coverageArea: true,
      },
      take: 2000,
    });
  }
  @FloorEdit() @Put("editor") async save(
    @Body() dto: FloorStateDto,
    @Actor() actor: RequestUser,
  ) {
    const saved = await this.db.$transaction(async (tx) => {
      const previous = await tx.floorMapState.findUnique({
        where: { key: "default" },
      });
      const state = protectFloorSecrets(
        dto.state,
        previous?.state,
        this.crypto,
      ) as never;
      return tx.floorMapState.upsert({
        where: { key: "default" },
        create: { key: "default", state, updatedBy: actor.id },
        update: { state, updatedBy: actor.id },
      });
    });
    return { ...saved, state: redactFloorSecrets(saved.state) };
  }
  @Get("areas") async areas() {
    const areas = await this.db.floorMapArea.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return areas.map((area) => ({
      ...area,
      state: redactFloorSecrets(area.state),
    }));
  }
  @FloorEdit() @Post("areas") async area(@Body() dto: AreaDto) {
    const area = await this.db.floorMapArea.create({
      data: {
        ...dto,
        state: protectFloorSecrets(dto.state, null, this.crypto) as never,
      },
    });
    return { ...area, state: redactFloorSecrets(area.state) };
  }
  @FloorEdit() @Patch("areas/:id") async areaUpdate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AreaDto,
  ) {
    const area = await this.db.$transaction(async (tx) => {
      const previous = await tx.floorMapArea.findUniqueOrThrow({
        where: { id },
      });
      const state =
        dto.state === undefined
          ? previous.state
          : protectFloorSecrets(dto.state, previous.state, this.crypto);
      return tx.floorMapArea.update({
        where: { id },
        data: { ...dto, state: state as never },
      });
    });
    return { ...area, state: redactFloorSecrets(area.state) };
  }
  @FloorEdit() @Delete("areas/:id") areaDelete(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.floorMapArea.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
  @AdminOnly() @Get("permissions") permissions() {
    return this.db.floorMapPermission.findMany({
      include: { user: { select: { username: true, fullname: true } } },
    });
  }
  @AdminOnly() @Put("permissions") permission(@Body() dto: PermissionDto) {
    return this.db.floorMapPermission.upsert({
      where: { userId: dto.userId },
      create: dto,
      update: { access: dto.access },
    });
  }
}

@FloorView()
@Controller("map-assets")
export class MapAssetsController {
  constructor(private readonly db: PrismaService) {}
  @Get() async map() {
    const [positions, rooms] = await Promise.all([
      this.db.mapAssetPosition.findMany({
        where: { asset: { deletedAt: null } },
        include: {
          asset: {
            include: { category: true, location: true, customData: true },
          },
        },
      }),
      this.db.mapAssetRoom.findMany({
        include: {
          items: {
            where: { asset: { deletedAt: null } },
            include: { asset: { include: { category: true, location: true } } },
          },
        },
      }),
    ]);
    return { positions, rooms };
  }
  @FloorEdit() @Put("items/:itemId/position") async position(
    @Param("itemId", ParseIntPipe) assetId: number,
    @Body() dto: PositionDto,
    @Actor() actor: RequestUser,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.mapAssetRoomItem.deleteMany({ where: { assetId } });
      return tx.mapAssetPosition.upsert({
        where: { assetId },
        create: { assetId, x: dto.x, y: dto.y, placedBy: actor.id },
        update: { x: dto.x, y: dto.y, placedBy: actor.id },
      });
    });
  }
  @FloorEdit() @Delete("items/:itemId/position") removePosition(
    @Param("itemId", ParseIntPipe) assetId: number,
  ) {
    return this.db.mapAssetPosition.deleteMany({ where: { assetId } });
  }
  @FloorEdit() @Post("rooms") room(@Body() dto: RoomDto) {
    return this.db.mapAssetRoom.create({ data: dto });
  }
  @FloorEdit() @Patch("rooms/:id") roomUpdate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: RoomDto,
  ) {
    return this.db.mapAssetRoom.update({ where: { id }, data: dto });
  }
  @FloorEdit() @Delete("rooms/:id") roomDelete(
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.mapAssetRoom.delete({ where: { id } });
  }
  @FloorEdit() @Put("rooms/:roomId/items/:itemId") async addToRoom(
    @Param("roomId", ParseIntPipe) roomId: number,
    @Param("itemId", ParseIntPipe) assetId: number,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.mapAssetPosition.deleteMany({ where: { assetId } });
      await tx.mapAssetRoomItem.deleteMany({ where: { assetId } });
      return tx.mapAssetRoomItem.create({ data: { roomId, assetId } });
    });
  }
  @FloorEdit() @Delete("rooms/:roomId/items/:itemId") removeFromRoom(
    @Param("roomId", ParseIntPipe) roomId: number,
    @Param("itemId", ParseIntPipe) assetId: number,
  ) {
    return this.db.mapAssetRoomItem.delete({
      where: { roomId_assetId: { roomId, assetId } },
    });
  }
  @Get("network-assets") networkAssets() {
    return this.db.asset.findMany({
      where: {
        deletedAt: null,
        category: {
          itemType: {
            in: ["CPU", "telephone", "printer"],
            mode: "insensitive",
          },
        },
      },
      include: { category: true, customData: true },
    });
  }
}

@FloorView()
@Controller("mobile/floor-maps")
export class MobileFloorMapController {
  constructor(private readonly db: PrismaService) {}
  @Get() async list() {
    const [editor, areas] = await Promise.all([
      this.db.floorMapState.findUnique({ where: { key: "default" } }),
      this.db.floorMapArea.findMany({
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    const markers =
      (editor?.state as { markers?: Record<string, unknown>[] } | null)
        ?.markers || [];
    return {
      pages: [...new Set(markers.map((m) => Number(m.page || 1)))].sort(
        (a, b) => a - b,
      ),
      markerSummary: markers.reduce<Record<string, number>>((acc, marker) => {
        const key = String(marker.kind || "other");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
      areas: areas.map((area) => ({
        ...area,
        state: redactFloorSecrets(area.state),
      })),
    };
  }
}
