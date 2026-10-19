import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { GaAreaDto } from "./ga.dto";

const include = {
  parent: { select: { id: true, code: true, name: true } },
  ownerGa: { select: { id: true, fullname: true, gaRole: true } },
  _count: { select: { children: true } },
};
const writable = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const readable = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";

@Controller("ga/areas")
export class GaAreasController {
  constructor(private readonly db: PrismaService) {}
  @Get() async list(@Actor() actor: RequestUser, @Query("q") q?: string) {
    if (!readable(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaArea.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });
  }
  @Get("summary") async summary(@Actor() actor: RequestUser) {
    if (!readable(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const [total, active, mapped] = await Promise.all([
      this.db.gaArea.count(),
      this.db.gaArea.count({ where: { status: "ACTIVE", active: true } }),
      this.db.gaArea.count({
        where: {
          status: "ACTIVE",
          active: true,
          x: { not: null },
          y: { not: null },
          floorPage: { not: null },
        },
      }),
    ]);
    return {
      total,
      active,
      mapped,
      coverage: active ? (mapped / active) * 100 : null,
    };
  }
  @Post() async create(@Actor() actor: RequestUser, @Body() dto: GaAreaDto) {
    if (!writable(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const { code: _code, ...data } = dto;
    const scope = `ga-area-${data.type}`;
    const sequence = await this.db.codeSequence.upsert({
      where: { scope },
      create: { scope, value: 1 },
      update: { value: { increment: 1 } },
    });
    const prefix: Record<string, string> = {
      building: "BLD",
      floor: "FLR",
      zone: "ZON",
      area: "ARE",
      point: "PNT",
    };
    const code = `GA-${prefix[data.type]}-${String(sequence.value).padStart(5, "0")}`;
    const area = await this.db.gaArea.create({
      data: { ...data, code },
      include,
    });
    await this.db.gaAreaHistory.create({
      data: {
        areaId: area.id,
        actorId: actor.id,
        action: "create",
        snapshot: area,
      },
    });
    return area;
  }
  @Patch(":id") async update(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: GaAreaDto,
  ) {
    if (!writable(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const { code: _code, ...data } = dto;
    const area = await this.db.gaArea.update({
      where: { id },
      data,
      include,
    });
    await this.db.gaAreaHistory.create({
      data: {
        areaId: area.id,
        actorId: actor.id,
        action: "update",
        snapshot: area,
      },
    });
    return area;
  }
  @Get(":id/history") async history(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!readable(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaAreaHistory.findMany({
      where: { areaId: id },
      include: { actor: { select: { fullname: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
