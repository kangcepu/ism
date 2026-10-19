import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { AdminOnly, Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const sessionSchema = z
  .object({ name: z.string().trim().min(1).max(200) })
  .strict();
const entrySchema = z
  .object({
    assetId: z.number().int().positive(),
    actualLocation: z.string().trim().min(1).max(200),
    actualSerial: z.string().trim().max(200).optional(),
    found: z.boolean(),
    condition: z.enum(["new", "good", "fair", "poor", "broken"]).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((e) => `${e.path.join(".") || "data"}: ${e.message}`)
        .join("; "),
    );
  return parsed.data;
}
@Controller("asset-audits")
export class AssetAuditsController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() {
    return this.db.assetAuditSession.findMany({
      include: { _count: { select: { entries: true } } },
      orderBy: { id: "desc" },
    });
  }
  @Get(":id") detail(@Param("id", ParseIntPipe) id: number) {
    return this.db.assetAuditSession.findUniqueOrThrow({
      where: { id },
      include: {
        entries: {
          include: { asset: { select: { code: true, name: true } } },
          orderBy: { id: "desc" },
        },
      },
    });
  }
  @Post() async create(@Actor() actor: RequestUser, @Body() body: unknown) {
    const d = parse(sessionSchema, body);
    return this.db.$transaction(async (tx) => {
      const sequence = await tx.codeSequence.upsert({
        where: { scope: "asset-audit" },
        create: { scope: "asset-audit", value: 1 },
        update: { value: { increment: 1 } },
      });
      return tx.assetAuditSession.create({
        data: {
          name: d.name,
          code: `AOP-${String(sequence.value).padStart(6, "0")}`,
          createdById: actor.id,
        },
      });
    });
  }
  @Post(":id/entries") async entry(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const d = parse(entrySchema, body);
    return this.db.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT status FROM "AssetAuditSession" WHERE id = ${id} FOR UPDATE`;
      if (!sessions[0] || sessions[0].status !== "OPEN")
        throw new ConflictException("Sesi tidak ditemukan atau sudah ditutup.");
      const asset = await tx.asset.findFirst({
        where: { id: d.assetId, deletedAt: null },
        include: { location: true },
      });
      if (!asset) throw new BadRequestException("Aset tidak ditemukan.");
      if (
        await tx.assetAuditEntry.findUnique({
          where: { sessionId_assetId: { sessionId: id, assetId: d.assetId } },
        })
      )
        throw new ConflictException("Aset sudah diperiksa pada sesi ini.");
      return tx.assetAuditEntry.create({
        data: {
          sessionId: id,
          assetId: d.assetId,
          expectedLocation: asset.location.name,
          actualLocation: d.actualLocation,
          expectedSerial: asset.serialNumber,
          actualSerial: d.actualSerial,
          found: d.found,
          condition: d.condition,
          note: d.note,
          countedById: actor.id,
        },
      });
    });
  }
  @AdminOnly() @Post(":id/close") async close(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const sessions = await tx.$queryRaw<
        Array<{ status: string }>
      >`SELECT status FROM "AssetAuditSession" WHERE id = ${id} FOR UPDATE`;
      if (!sessions[0] || sessions[0].status !== "OPEN")
        throw new ConflictException("Sesi tidak ditemukan atau sudah ditutup.");
      if (!(await tx.assetAuditEntry.count({ where: { sessionId: id } })))
        throw new BadRequestException("Sesi belum memiliki pemeriksaan.");
      return tx.assetAuditSession.update({
        where: { id },
        data: {
          status: "CLOSED",
          reviewedById: actor.id,
          closedAt: new Date(),
        },
      });
    });
  }
}
