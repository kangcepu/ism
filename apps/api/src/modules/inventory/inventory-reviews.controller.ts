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
import { Actor, AdminOnly } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { lockBalance, reference } from "./inventory.controller";

const draftSchema = z
  .object({
    kind: z.enum(["COUNT", "ADJUSTMENT"]),
    itemId: z.number().int().positive(),
    binId: z.number().int().positive(),
    quantity: z.number().int().min(-1000000000).max(1000000000),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();
const recountSchema = z
  .object({ quantity: z.number().int().min(0).max(1000000000) })
  .strict();
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException("Data pemeriksaan stok tidak valid.");
  return result.data;
}

@Controller("inventory/stock-reviews")
export class InventoryReviewsController {
  constructor(private readonly db: PrismaService) {}

  @Get() list() {
    return this.db.inventoryStockReview.findMany({
      include: { item: true, bin: true },
      orderBy: { id: "desc" },
      take: 200,
    });
  }

  @Post() create(@Actor() actor: RequestUser, @Body() body: unknown) {
    const data = parse(draftSchema, body);
    if (
      (data.kind === "COUNT" && data.quantity < 0) ||
      (data.kind === "ADJUSTMENT" && data.quantity === 0)
    )
      throw new BadRequestException("Jumlah pemeriksaan stok tidak valid.");
    return this.db.$transaction(async (tx) => {
      const [item, bin] = await Promise.all([
        tx.inventoryItem.findFirst({
          where: { id: data.itemId, active: true },
        }),
        tx.inventoryBin.findFirst({ where: { id: data.binId, active: true } }),
      ]);
      if (!item || !bin)
        throw new BadRequestException(
          "Item atau bin tidak aktif atau tidak ditemukan.",
        );
      if (item.serialControl)
        throw new BadRequestException(
          "Pemeriksaan item serial memerlukan pencatatan nomor serial.",
        );
      const balance = await lockBalance(tx, data.itemId, data.binId);
      const last = await tx.inventoryLedger.findFirst({
        where: { itemId: data.itemId, binId: data.binId },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      const proposedQty =
        data.kind === "COUNT" ? data.quantity : balance.onHand + data.quantity;
      if (
        proposedQty < balance.reserved + balance.hold ||
        proposedQty > 1000000000
      )
        throw new BadRequestException(
          "Jumlah tidak dapat lebih kecil dari stok reserved dan hold.",
        );
      return tx.inventoryStockReview.create({
        data: {
          code: await reference(
            tx,
            "inventory-stock-review",
            data.kind === "COUNT" ? "OPN" : "ADJ",
          ),
          kind: data.kind,
          itemId: data.itemId,
          binId: data.binId,
          snapshotQty: balance.onHand,
          snapshotLedgerId: last?.id,
          proposedQty,
          note: data.note,
          requestedBy: actor.id,
          status:
            data.kind === "COUNT" && proposedQty !== balance.onHand
              ? "RECOUNT_REQUIRED"
              : "PENDING",
        },
      });
    });
  }

  @Post(":id/recount") recount(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const data = parse(recountSchema, body);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryStockReview" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Dokumen tidak ditemukan.");
      const row = await tx.inventoryStockReview.findUniqueOrThrow({
        where: { id },
      });
      if (row.status !== "RECOUNT_REQUIRED")
        throw new ConflictException("Dokumen tidak menunggu recount.");
      if (row.requestedBy === actor.id)
        throw new BadRequestException(
          "Recount harus dilakukan oleh pengguna lain.",
        );
      return tx.inventoryStockReview.update({
        where: { id },
        data: {
          recountQty: data.quantity,
          recountedBy: actor.id,
          recountedAt: new Date(),
          status: "PENDING",
        },
      });
    });
  }

  @AdminOnly() @Post(":id/approve") approve(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryStockReview" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Dokumen tidak ditemukan.");
      const row = await tx.inventoryStockReview.findUniqueOrThrow({
        where: { id },
      });
      if (row.status !== "PENDING")
        throw new ConflictException("Dokumen belum siap atau sudah diproses.");
      if (row.requestedBy === actor.id)
        throw new BadRequestException(
          "Persetujuan harus dilakukan oleh pengguna lain.",
        );
      const balance = await lockBalance(tx, row.itemId, row.binId);
      const last = await tx.inventoryLedger.findFirst({
        where: { itemId: row.itemId, binId: row.binId },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (
        balance.onHand !== row.snapshotQty ||
        (last?.id ?? null) !== row.snapshotLedgerId
      )
        throw new ConflictException(
          "Stok berubah setelah pemeriksaan. Batalkan dan buat pemeriksaan baru.",
        );
      const target =
        row.kind === "COUNT"
          ? (row.recountQty ?? row.proposedQty)
          : row.proposedQty;
      if (target < balance.reserved + balance.hold)
        throw new ConflictException(
          "Jumlah lebih kecil dari stok reserved dan hold.",
        );
      const delta = target - balance.onHand;
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: target },
      });
      const entry = await tx.inventoryLedger.create({
        data: {
          reference: await reference(
            tx,
            `inventory-${row.kind.toLowerCase()}`,
            row.kind,
          ),
          itemId: row.itemId,
          binId: row.binId,
          type: row.kind === "COUNT" ? "COUNT" : "ADJUSTMENT",
          qty: delta,
          actorId: actor.id,
          note: row.code,
        },
      });
      return tx.inventoryStockReview.update({
        where: { id },
        data: {
          status: "POSTED",
          resultId: entry.id,
          approvedBy: actor.id,
          approvedAt: new Date(),
        },
      });
    });
  }

  @Post(":id/cancel") async cancel(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const result = await this.db.inventoryStockReview.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "RECOUNT_REQUIRED"] },
        ...(actor.role === "admin" ? {} : { requestedBy: actor.id }),
      },
      data: { status: "CANCELLED" },
    });
    if (!result.count)
      throw new ConflictException("Dokumen tidak dapat dibatalkan.");
    return { status: "CANCELLED" };
  }
}
