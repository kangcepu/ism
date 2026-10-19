import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AdminOnly, Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const id = z.number().int().positive();
const qty = z.number().int().positive().max(1000000000);
const note = z.string().trim().max(1000).optional();
const moveSchema = z.object({ itemId: id, binId: id, qty, note }).strict();
const reservationMoveSchema = z
  .object({ reservationId: id, qty, note })
  .strict();
const transferSchema = z
  .object({ itemId: id, fromBinId: id, toBinId: id, qty, note })
  .strict()
  .refine((v) => v.fromBinId !== v.toBinId, {
    message: "Bin asal dan tujuan harus berbeda.",
  });
const itemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    uom: z.string().trim().min(1).max(30).default("PCS"),
    stockType: z
      .enum(["CONSUMABLE", "SPARE_PART", "SERIALIZED"])
      .default("CONSUMABLE"),
    reorderLevel: z.number().int().min(0).max(1000000000).default(0),
    assetId: id.optional(),
  })
  .strict();
const binSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    warehouse: z.string().trim().min(1).max(200),
    site: z.string().trim().max(200).optional(),
    zone: z.string().trim().max(200).optional(),
    rack: z.string().trim().max(200).optional(),
  })
  .strict();
type Tx = Prisma.TransactionClient;
type Movement = z.infer<typeof moveSchema>;
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((e) => `${e.path.join(".") || "data"}: ${e.message}`)
        .join("; "),
    );
  return result.data;
}
export async function reference(tx: Tx, scope: string, prefix: string) {
  const sequence = await tx.codeSequence.upsert({
    where: { scope },
    create: { scope, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(sequence.value).padStart(6, "0")}`;
}
export async function lockBalance(tx: Tx, itemId: number, binId: number) {
  await tx.inventoryBalance.upsert({
    where: { itemId_binId: { itemId, binId } },
    create: { itemId, binId },
    update: {},
  });
  const rows = await tx.$queryRaw<
    Array<{ id: number; onHand: number; reserved: number; hold: number }>
  >`SELECT id, "onHand", reserved, hold FROM "InventoryBalance" WHERE "itemId" = ${itemId} AND "binId" = ${binId} FOR UPDATE`;
  if (!rows[0]) throw new BadRequestException("Saldo tidak ditemukan.");
  return rows[0];
}
@Controller("inventory")
export class InventoryController {
  constructor(private readonly db: PrismaService) {}
  @Get("assets") async assets(
    @Query("page") page?: string,
    @Query("q") query?: string,
  ) {
    const pageNumber = page ? Number(page) : 1;
    if (!Number.isInteger(pageNumber) || pageNumber < 1)
      throw new BadRequestException("Halaman tidak valid.");
    const q = query?.trim().slice(0, 100);
    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { serialNumber: { contains: q, mode: "insensitive" } },
              { category: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.asset.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          serialNumber: true,
          status: true,
          category: { select: { name: true } },
          location: { select: { name: true } },
        },
        orderBy: { id: "asc" },
        skip: (pageNumber - 1) * 100,
        take: 100,
      }),
      this.db.asset.count({ where }),
    ]);
    return {
      items,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(total / 100)),
    };
  }
  @Get("items") items() {
    return this.db.inventoryItem.findMany({
      where: { active: true },
      include: { asset: { select: { id: true, code: true, name: true } } },
      orderBy: { name: "asc" },
    });
  }
  @Get("bins") bins() {
    return this.db.inventoryBin.findMany({
      where: { active: true },
      orderBy: [{ warehouse: "asc" }, { name: "asc" }],
    });
  }
  @Get("balances") balances() {
    return this.db.inventoryBalance.findMany({
      include: { item: true, bin: true },
      orderBy: { id: "asc" },
    });
  }
  @Get("reservations") reservations() {
    return this.db.inventoryReservation.findMany({
      include: { item: true, bin: true },
      orderBy: { id: "desc" },
      take: 200,
    });
  }
  @Get("ledger") async ledger(@Query("itemId") itemId?: string) {
    const n = itemId ? Number(itemId) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n <= 0))
      throw new BadRequestException("Item tidak valid.");
    const rows = await this.db.inventoryLedger.findMany({
      where: n ? { itemId: n } : {},
      include: { item: true, bin: true },
      orderBy: { id: "desc" },
      take: 200,
    });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }
  @AdminOnly() @Post("items") async item(@Body() body: unknown) {
    const d = parse(itemSchema, body);
    if (d.stockType === "SERIALIZED")
      throw new BadRequestException(
        "Pelacakan stok per serial belum tersedia.",
      );
    return this.db.$transaction(async (tx) => {
      if (
        d.assetId &&
        !(await tx.asset.findFirst({
          where: { id: d.assetId, deletedAt: null },
        }))
      )
        throw new BadRequestException("Aset tidak ditemukan.");
      return tx.inventoryItem.create({
        data: {
          ...d,
          serialControl: d.stockType === "SERIALIZED",
          code: await reference(tx, "inventory-item", "ITM"),
        },
      });
    });
  }
  @AdminOnly() @Post("bins") async bin(@Body() body: unknown) {
    const d = parse(binSchema, body);
    return this.db.$transaction(async (tx) =>
      tx.inventoryBin.create({
        data: { ...d, code: await reference(tx, "inventory-bin", "BIN") },
      }),
    );
  }
  @Post("receipt") receipt(@Actor() a: RequestUser, @Body() body: unknown) {
    throw new BadRequestException(
      "Penerimaan harus melalui dokumen receipt dan QC.",
    );
  }
  @Post("reserve") reserve(@Actor() a: RequestUser, @Body() body: unknown) {
    return this.move(a, parse(moveSchema, body), "RESERVE");
  }
  @Post("release") release(@Actor() a: RequestUser, @Body() body: unknown) {
    return this.consumeReservation(
      a,
      parse(reservationMoveSchema, body),
      "RELEASE",
    );
  }
  @Post("issue") issue(@Actor() a: RequestUser, @Body() body: unknown) {
    return this.consumeReservation(
      a,
      parse(reservationMoveSchema, body),
      "ISSUE",
    );
  }
  @Post("return") returned(@Actor() a: RequestUser, @Body() body: unknown) {
    throw new BadRequestException(
      "Retur harus dibuat dari transaksi issue melalui menu retur.",
    );
  }
  @Post("adjustment") @AdminOnly() adjustment(
    @Actor() a: RequestUser,
    @Body() body: unknown,
  ) {
    throw new BadRequestException(
      "Adjustment harus melalui dokumen persetujuan.",
    );
  }
  @Post("opname") opname(@Actor() a: RequestUser, @Body() body: unknown) {
    throw new BadRequestException(
      "Opname harus melalui dokumen pemeriksaan dan persetujuan.",
    );
  }
  @Post("transfer") async transfer(
    @Actor() a: RequestUser,
    @Body() body: unknown,
  ) {
    const d = parse(transferSchema, body);
    return this.db.$transaction(async (tx) => {
      await this.validateMaster(tx, d.itemId, [d.fromBinId, d.toBinId]);
      const locked = new Map<number, Awaited<ReturnType<typeof lockBalance>>>();
      for (const binId of [d.fromBinId, d.toBinId].sort((x, y) => x - y))
        locked.set(binId, await lockBalance(tx, d.itemId, binId));
      const from = locked.get(d.fromBinId)!;
      const to = locked.get(d.toBinId)!;
      if (from.onHand - from.reserved - from.hold < d.qty)
        throw new BadRequestException("Stok tersedia tidak cukup.");
      await tx.inventoryBalance.update({
        where: { id: from.id },
        data: { onHand: { decrement: d.qty } },
      });
      await tx.inventoryBalance.update({
        where: { id: to.id },
        data: { onHand: { increment: d.qty } },
      });
      const ref = await reference(tx, "inventory-transfer", "TRF");
      await tx.inventoryLedger.createMany({
        data: [
          {
            reference: `${ref}-OUT`,
            itemId: d.itemId,
            binId: d.fromBinId,
            qty: -d.qty,
            type: "TRANSFER_OUT",
            actorId: a.id,
            note: d.note,
          },
          {
            reference: `${ref}-IN`,
            itemId: d.itemId,
            binId: d.toBinId,
            qty: d.qty,
            type: "TRANSFER_IN",
            actorId: a.id,
            note: d.note,
          },
        ],
      });
      return { reference: ref };
    });
  }
  @Get("minimum-stock") async minimum() {
    const items = await this.db.inventoryItem.findMany({
      where: { active: true, reorderLevel: { gt: 0 } },
      include: { balances: true },
      orderBy: { name: "asc" },
    });
    return items
      .map((item) => {
        const available = item.balances.reduce(
          (sum, b) => sum + b.onHand - b.reserved - b.hold,
          0,
        );
        return {
          id: item.id,
          item,
          available,
          proposalQty: Math.max(item.reorderLevel - available, 1),
        };
      })
      .filter((row) => row.available <= row.item.reorderLevel);
  }
  private move(
    a: RequestUser,
    d: Movement,
    type: "RECEIPT" | "RESERVE" | "RETURN" | "ADJUSTMENT",
  ) {
    return this.mutate(a, d.itemId, d.binId, type, d.qty, d.note);
  }
  private async validateMaster(tx: Tx, itemId: number, bins: number[]) {
    const [item, count] = await Promise.all([
      tx.inventoryItem.findFirst({ where: { id: itemId, active: true } }),
      tx.inventoryBin.count({ where: { id: { in: bins }, active: true } }),
    ]);
    if (!item || count !== new Set(bins).size)
      throw new BadRequestException(
        "Item atau bin tidak aktif atau tidak ditemukan.",
      );
    if (item.serialControl)
      throw new BadRequestException(
        "Transaksi item serial memerlukan pelacakan nomor serial yang belum tersedia.",
      );
  }
  private async consumeReservation(
    actor: RequestUser,
    data: z.infer<typeof reservationMoveSchema>,
    type: "ISSUE" | "RELEASE",
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "InventoryReservation" WHERE id = ${data.reservationId} FOR UPDATE
      `;
      if (!locked.length)
        throw new BadRequestException("Reservasi tidak ditemukan.");
      const reservation = await tx.inventoryReservation.findUniqueOrThrow({
        where: { id: data.reservationId },
      });
      if (reservation.status !== "RESERVED" || reservation.remaining < data.qty)
        throw new BadRequestException("Sisa reservasi tidak mencukupi.");
      await this.validateMaster(tx, reservation.itemId, [reservation.binId]);
      const balance = await lockBalance(
        tx,
        reservation.itemId,
        reservation.binId,
      );
      if (
        balance.reserved < data.qty ||
        (type === "ISSUE" && balance.onHand < data.qty)
      )
        throw new BadRequestException("Saldo reservasi tidak konsisten.");
      const remaining = reservation.remaining - data.qty;
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: {
          remaining,
          status: remaining
            ? "RESERVED"
            : type === "ISSUE"
              ? "ISSUED"
              : "RELEASED",
        },
      });
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          reserved: { decrement: data.qty },
          ...(type === "ISSUE" ? { onHand: { decrement: data.qty } } : {}),
        },
      });
      const ref = await reference(tx, `inventory-${type.toLowerCase()}`, type);
      await tx.inventoryLedger.create({
        data: {
          reference: ref,
          itemId: reservation.itemId,
          binId: reservation.binId,
          type,
          qty: type === "ISSUE" ? -data.qty : 0,
          reservedDelta: -data.qty,
          reservationId: reservation.id,
          actorId: actor.id,
          note: data.note,
        },
      });
      return { reference: ref, reservationCode: reservation.code, remaining };
    });
  }
  private async mutate(
    a: RequestUser,
    itemId: number,
    binId: number,
    type: "RECEIPT" | "RESERVE" | "RETURN" | "ADJUSTMENT" | "COUNT",
    amount: number,
    note?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.validateMaster(tx, itemId, [binId]);
      const b = await lockBalance(tx, itemId, binId);
      const onHandDelta =
        type === "RESERVE" ? 0 : type === "COUNT" ? amount - b.onHand : amount;
      const reservedDelta = type === "RESERVE" ? amount : 0;
      const onHand = b.onHand + onHandDelta;
      const reserved = b.reserved + reservedDelta;
      if (reserved < 0)
        throw new BadRequestException("Stok reservasi tidak cukup.");
      if (onHand < reserved + b.hold)
        throw new BadRequestException(
          "Stok tersedia tidak cukup atau jumlah lebih kecil dari stok reserved dan hold.",
        );
      await tx.inventoryBalance.update({
        where: { id: b.id },
        data: { onHand, reserved },
      });
      const ref = await reference(tx, `inventory-${type.toLowerCase()}`, type);
      const reservation =
        type === "RESERVE"
          ? await tx.inventoryReservation.create({
              data: {
                code: ref,
                itemId,
                binId,
                quantity: amount,
                remaining: amount,
                requestedBy: a.id,
                note,
              },
            })
          : null;
      await tx.inventoryLedger.create({
        data: {
          reference: ref,
          itemId,
          binId,
          qty: onHandDelta,
          reservedDelta,
          reservationId: reservation?.id,
          type,
          actorId: a.id,
          note,
        },
      });
      return {
        reference: ref,
        reservationId: reservation?.id,
        onHand,
        reserved,
        hold: b.hold,
        available: onHand - reserved - b.hold,
      };
    });
  }
}
