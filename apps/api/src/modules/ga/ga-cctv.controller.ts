import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { CctvOfflineDto } from "./ga-cctv.dto";

const access = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";
const supervisor = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const active = ["DETECTED", "VALIDATED", "IT_ESCALATED", "IN_REPAIR"] as const;

@Controller("ga/cctv-offline")
export class GaCctvOfflineController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  async list(@Actor() actor: RequestUser, @Query("status") status?: string) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaCctvOfflineCase.findMany({
      where: status ? { status: status as never } : {},
      include: {
        cameraAsset: { select: { code: true, name: true } },
        area: { select: { code: true, name: true } },
      },
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
    });
  }

  @Get("summary")
  async summary(@Actor() actor: RequestUser) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const [open, recovered, average] = await Promise.all([
      this.db.gaCctvOfflineCase.count({
        where: { status: { in: [...active] } },
      }),
      this.db.gaCctvOfflineCase.count({ where: { status: "VERIFIED" } }),
      this.db.gaCctvOfflineCase.aggregate({
        where: { offlineMinutes: { not: null } },
        _avg: { offlineMinutes: true },
      }),
    ]);
    return { open, recovered, meanOfflineMinutes: average._avg.offlineMinutes };
  }

  @Get("cameras")
  async cameras(@Actor() actor: RequestUser) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.asset.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: "cctv", mode: "insensitive" } },
          { category: { name: { contains: "cctv", mode: "insensitive" } } },
        ],
      },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  @Post()
  async create(@Actor() actor: RequestUser, @Body() dto: CctvOfflineDto) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const duplicate = dto.cameraAssetId
      ? await this.db.gaCctvOfflineCase.findFirst({
          where: {
            cameraAssetId: dto.cameraAssetId,
            status: { in: [...active] },
          },
        })
      : null;
    if (duplicate)
      throw new ConflictException(
        "Kamera ini masih memiliki event offline aktif.",
      );
    return this.db.gaCctvOfflineCase.create({
      data: {
        ...dto,
        detectedAt: new Date(dto.detectedAt),
        source: dto.source || "MANUAL",
        severity: dto.severity || "MEDIUM",
        createdById: actor.id,
      },
    });
  }

  @Post(":id/validate")
  async validate(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.transition(id, "DETECTED", {
      status: "VALIDATED",
      validatedAt: new Date(),
    });
  }

  @Post(":id/escalate")
  async escalate(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.transition(id, "VALIDATED", {
      status: "IT_ESCALATED",
      escalatedAt: new Date(),
    });
  }

  @Post(":id/repair")
  async repair(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.transition(id, "IT_ESCALATED", {
      status: "IN_REPAIR",
      repairStartedAt: new Date(),
    });
  }

  @Post(":id/recover")
  async recover(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const item = await this.db.gaCctvOfflineCase.findUniqueOrThrow({
      where: { id },
    });
    if (item.status !== "IN_REPAIR")
      throw new ConflictException("Event belum memasuki proses perbaikan.");
    const recoveredAt = new Date();
    return this.db.gaCctvOfflineCase.update({
      where: { id },
      data: {
        status: "RECOVERED",
        recoveredAt,
        offlineMinutes: Math.max(
          1,
          Math.round(
            (recoveredAt.getTime() - item.detectedAt.getTime()) / 60000,
          ),
        ),
      },
    });
  }

  @Post(":id/verify")
  async verify(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.transition(id, "RECOVERED", {
      status: "VERIFIED",
      verifiedById: actor.id,
      verifiedAt: new Date(),
    });
  }

  private async transition(id: number, current: string, data: object) {
    const item = await this.db.gaCctvOfflineCase.findUniqueOrThrow({
      where: { id },
    });
    if (item.status !== current)
      throw new ConflictException("Transisi status tidak valid.");
    return this.db.gaCctvOfflineCase.update({ where: { id }, data });
  }
}
