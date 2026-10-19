import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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

const returnSchema = z
  .object({
    issueId: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .refine(
        (value) =>
          /^[1-9]\d{0,18}$/.test(value) &&
          BigInt(value) <= 9223372036854775807n,
      ),
    qty: z.number().int().positive().max(1000000000),
    disposition: z.enum(["RESTOCK", "HOLD"]),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();
const proposalSchema = z
  .object({
    itemId: z.number().int().positive(),
    qty: z.number().int().positive().max(1000000000).optional(),
  })
  .strict();
const receiptSchema = z
  .object({
    itemId: z.number().int().positive(),
    binId: z.number().int().positive(),
    qty: z.number().int().positive().max(1000000000),
    purchaseOrderId: z.number().int().positive().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
const qcSchema = z
  .object({
    accepted: z.number().int().min(0),
    held: z.number().int().min(0),
    rejected: z.number().int().min(0),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const value = schema.safeParse(body);
  if (!value.success)
    throw new BadRequestException(
      value.error.issues
        .map((issue) => `${issue.path.join(".") || "data"}: ${issue.message}`)
        .join("; "),
    );
  return value.data;
}
function authorizeApproval(actor: RequestUser, requestedBy: number) {
  if (actor.role !== "admin")
    throw new ForbiddenException("Persetujuan administrator diperlukan.");
  if (actor.id === requestedBy)
    throw new ForbiddenException("Persetujuan harus dilakukan pengguna lain.");
}
function serializeReturn<
  T extends { issueId: bigint; resultId: bigint | null },
>(row: T) {
  return {
    ...row,
    issueId: row.issueId.toString(),
    resultId: row.resultId?.toString() || null,
  };
}

@Controller("inventory")
export class InventoryDocumentsController {
  constructor(private readonly db: PrismaService) {}

  @Get("purchase-orders") async purchaseOrders() {
    const rows = await this.db.inventoryPurchaseOrder.findMany({
      include: {
        item: true,
        receipts: {
          select: { status: true, quantity: true, accepted: true, held: true },
        },
      },
      orderBy: { id: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      ...row,
      allocated: row.receipts.reduce(
        (sum, receipt) =>
          sum +
          (receipt.status === "CANCELLED"
            ? 0
            : receipt.status === "POSTED"
              ? (receipt.accepted || 0) + (receipt.held || 0)
              : receipt.quantity),
        0,
      ),
    }));
  }

  @Post("purchase-orders") createPurchaseOrder(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    const data = parse(
      z
        .object({
          itemId: z.number().int().positive(),
          qty: z.number().int().positive().max(1000000000),
          supplier: z.string().trim().max(200).optional(),
          note: z.string().trim().max(1000).optional(),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.inventoryItem.findFirst({
          where: { id: data.itemId, active: true },
          select: { id: true },
        }))
      )
        throw new BadRequestException("Item tidak aktif atau tidak ditemukan.");
      return tx.inventoryPurchaseOrder.create({
        data: {
          code: await reference(tx, "inventory-purchase-order", "PO"),
          itemId: data.itemId,
          quantity: data.qty,
          supplier: data.supplier,
          note: data.note,
          createdBy: actor.id,
        },
      });
    });
  }

  @AdminOnly() @Post("purchase-orders/:id/close") closePurchaseOrder(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryPurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new BadRequestException("PO tidak ditemukan.");
      const order = await tx.inventoryPurchaseOrder.findUniqueOrThrow({
        where: { id },
      });
      if (order.status !== "OPEN")
        throw new ConflictException("PO sudah ditutup.");
      if (
        await tx.inventoryReceipt.count({
          where: {
            purchaseOrderId: id,
            status: { in: ["DRAFT", "INSPECTED"] },
          },
        })
      )
        throw new ConflictException(
          "Selesaikan atau batalkan penerimaan yang masih diproses.",
        );
      return tx.inventoryPurchaseOrder.update({
        where: { id },
        data: { status: "CLOSED", closedBy: actor.id, closedAt: new Date() },
      });
    });
  }

  @Get("receipts") async receipts() {
    const rows = await this.db.inventoryReceipt.findMany({
      include: { item: true, bin: true },
      orderBy: { id: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      ...row,
      resultId: row.resultId?.toString() || null,
    }));
  }

  @Post("receipts") async createReceipt(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    const data = parse(receiptSchema, body);
    return this.db.$transaction(async (tx) => {
      const [item, bin] = await Promise.all([
        tx.inventoryItem.findFirst({
          where: { id: data.itemId, active: true },
        }),
        tx.inventoryBin.findFirst({ where: { id: data.binId, active: true } }),
      ]);
      if (!item || !bin)
        throw new BadRequestException(
          "Item atau lokasi tidak ditemukan atau tidak aktif.",
        );
      if (item.serialControl)
        throw new BadRequestException(
          "Penerimaan item serial memerlukan pemindaian nomor serial.",
        );
      let poReference: string | undefined;
      if (data.purchaseOrderId) {
        const locked = await tx.$queryRaw<
          Array<{ id: number }>
        >`SELECT id FROM "InventoryPurchaseOrder" WHERE id = ${data.purchaseOrderId} FOR UPDATE`;
        if (!locked.length)
          throw new BadRequestException("PO tidak ditemukan.");
        const order = await tx.inventoryPurchaseOrder.findUniqueOrThrow({
          where: { id: data.purchaseOrderId },
          include: {
            receipts: {
              select: {
                status: true,
                quantity: true,
                accepted: true,
                held: true,
              },
            },
          },
        });
        if (order.status !== "OPEN" || order.itemId !== item.id)
          throw new BadRequestException(
            "PO harus terbuka dan sesuai dengan item penerimaan.",
          );
        const allocated = order.receipts.reduce(
          (sum, receipt) =>
            sum +
            (receipt.status === "CANCELLED"
              ? 0
              : receipt.status === "POSTED"
                ? (receipt.accepted || 0) + (receipt.held || 0)
                : receipt.quantity),
          0,
        );
        if (allocated + data.qty > order.quantity)
          throw new BadRequestException("Jumlah melebihi sisa PO.");
        poReference = order.code;
      }
      return tx.inventoryReceipt.create({
        data: {
          code: await reference(tx, "inventory-receipt-document", "RCV"),
          itemId: data.itemId,
          binId: data.binId,
          quantity: data.qty,
          purchaseOrderId: data.purchaseOrderId,
          poReference,
          note: data.note,
          createdBy: actor.id,
        },
      });
    });
  }

  @Post("receipts/:id/qc") async inspectReceipt(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const data = parse(qcSchema, body);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryReceipt" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Penerimaan tidak ditemukan.");
      const receipt = await tx.inventoryReceipt.findUniqueOrThrow({
        where: { id },
      });
      if (receipt.status !== "DRAFT")
        throw new ConflictException("Penerimaan sudah diperiksa.");
      if (data.accepted + data.held + data.rejected !== receipt.quantity)
        throw new BadRequestException(
          "Jumlah diterima, hold, dan ditolak harus sama dengan jumlah penerimaan.",
        );
      return tx.inventoryReceipt.update({
        where: { id },
        data: {
          accepted: data.accepted,
          held: data.held,
          rejected: data.rejected,
          qcNote: data.note,
          status: "INSPECTED",
          checkedBy: actor.id,
          checkedAt: new Date(),
        },
      });
    });
  }

  @AdminOnly() @Post("receipts/:id/putaway") async putawayReceipt(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryReceipt" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Penerimaan tidak ditemukan.");
      const receipt = await tx.inventoryReceipt.findUniqueOrThrow({
        where: { id },
      });
      if (
        receipt.status !== "INSPECTED" ||
        receipt.checkedBy === null ||
        receipt.accepted === null ||
        receipt.held === null
      )
        throw new ConflictException(
          "Penerimaan belum diperiksa atau sudah dibukukan.",
        );
      authorizeApproval(actor, receipt.checkedBy);
      const quantity = receipt.accepted + receipt.held;
      let resultId: bigint | undefined;
      if (quantity) {
        const balance = await lockBalance(tx, receipt.itemId, receipt.binId);
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            onHand: { increment: quantity },
            hold: { increment: receipt.held },
          },
        });
        const ledger = await tx.inventoryLedger.create({
          data: {
            reference: await reference(tx, "inventory-receipt", "RECEIPT"),
            itemId: receipt.itemId,
            binId: receipt.binId,
            type: "RECEIPT",
            qty: quantity,
            holdDelta: receipt.held,
            actorId: actor.id,
            note: receipt.code,
          },
        });
        resultId = ledger.id;
      }
      const updated = await tx.inventoryReceipt.update({
        where: { id },
        data: {
          status: "POSTED",
          resultId,
          postedBy: actor.id,
          postedAt: new Date(),
        },
      });
      return { ...updated, resultId: updated.resultId?.toString() || null };
    });
  }

  @Post("receipts/:id/cancel") async cancelReceipt(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const result = await this.db.inventoryReceipt.updateMany({
      where: {
        id,
        status: { in: ["DRAFT", "INSPECTED"] },
        ...(actor.role === "admin" ? {} : { createdBy: actor.id }),
      },
      data: { status: "CANCELLED" },
    });
    if (!result.count)
      throw new ConflictException(
        "Penerimaan tidak ditemukan, sudah dibukukan, atau bukan pengajuan Anda.",
      );
    return { status: "CANCELLED" };
  }

  @AdminOnly() @Post("hold-releases") async releaseHold(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    if (actor.role !== "admin")
      throw new ForbiddenException("Administrator diperlukan.");
    const data = parse(
      z
        .object({
          sourceId: z
            .string()
            .regex(/^[1-9]\d{0,18}$/)
            .refine(
              (value) =>
                /^[1-9]\d{0,18}$/.test(value) &&
                BigInt(value) <= 9223372036854775807n,
            ),
          qty: z.number().int().positive().max(1000000000),
          note: z.string().trim().min(1).max(1000),
        })
        .strict(),
      body,
    );
    const sourceId = BigInt(data.sourceId);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: bigint }>
      >`SELECT id FROM "InventoryLedger" WHERE id = ${sourceId} AND "holdDelta" > 0 FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Transaksi hold tidak ditemukan.");
      const source = await tx.inventoryLedger.findUniqueOrThrow({
        where: { id: sourceId },
      });
      const released = await tx.inventoryHoldRelease.aggregate({
        where: { sourceId },
        _sum: { quantity: true },
      });
      if ((released._sum.quantity || 0) + data.qty > source.holdDelta)
        throw new BadRequestException("Jumlah melebihi sisa transaksi hold.");
      const balance = await lockBalance(tx, source.itemId, source.binId);
      if (balance.hold < data.qty)
        throw new ConflictException("Saldo hold tidak konsisten.");
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { hold: { decrement: data.qty } },
      });
      const code = await reference(tx, "inventory-hold-release", "HLD");
      const result = await tx.inventoryLedger.create({
        data: {
          reference: code,
          itemId: source.itemId,
          binId: source.binId,
          type: "HOLD_RELEASE",
          qty: 0,
          holdDelta: -data.qty,
          actorId: actor.id,
          note: data.note,
        },
      });
      const row = await tx.inventoryHoldRelease.create({
        data: {
          code,
          sourceId,
          resultId: result.id,
          quantity: data.qty,
          note: data.note,
          actorId: actor.id,
        },
      });
      return {
        ...row,
        sourceId: row.sourceId.toString(),
        resultId: row.resultId.toString(),
      };
    });
  }

  @Get("returns") async returns() {
    const rows = await this.db.inventoryReturn.findMany({
      include: {
        item: true,
        bin: true,
        issue: { select: { reference: true } },
      },
      orderBy: { id: "desc" },
      take: 200,
    });
    return rows.map(serializeReturn);
  }

  @Post("returns") async createReturn(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    const data = parse(returnSchema, body);
    const issueId = BigInt(data.issueId);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: bigint }>
      >`SELECT id FROM "InventoryLedger" WHERE id = ${issueId} AND type = 'ISSUE' FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Transaksi issue tidak ditemukan.");
      const issue = await tx.inventoryLedger.findUniqueOrThrow({
        where: { id: issueId },
        include: { item: true },
      });
      if (issue.item.serialControl)
        throw new BadRequestException(
          "Retur item serial memerlukan pemilihan nomor serial.",
        );
      const used = await tx.inventoryReturn.aggregate({
        where: { issueId, status: { in: ["REQUESTED", "POSTED"] } },
        _sum: { quantity: true },
      });
      if ((used._sum.quantity || 0) + data.qty > -issue.qty)
        throw new BadRequestException(
          "Jumlah melebihi sisa issue yang dapat diretur.",
        );
      const row = await tx.inventoryReturn.create({
        data: {
          code: await reference(tx, "inventory-return-document", "RTN"),
          issueId,
          itemId: issue.itemId,
          binId: issue.binId,
          quantity: data.qty,
          disposition: data.disposition,
          note: data.note,
          requestedBy: actor.id,
        },
      });
      return serializeReturn(row);
    });
  }

  @AdminOnly() @Post("returns/:id/approve") async approveReturn(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryReturn" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Retur tidak ditemukan.");
      const row = await tx.inventoryReturn.findUniqueOrThrow({ where: { id } });
      authorizeApproval(actor, row.requestedBy);
      if (row.status !== "REQUESTED")
        throw new ConflictException("Retur sudah diproses.");
      const balance = await lockBalance(tx, row.itemId, row.binId);
      const holdDelta = row.disposition === "HOLD" ? row.quantity : 0;
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          onHand: { increment: row.quantity },
          hold: { increment: holdDelta },
        },
      });
      const ledger = await tx.inventoryLedger.create({
        data: {
          reference: await reference(tx, "inventory-return", "RETURN"),
          itemId: row.itemId,
          binId: row.binId,
          type: "RETURN",
          qty: row.quantity,
          holdDelta,
          actorId: actor.id,
          note: `${row.code}: ${row.note}`,
        },
      });
      return serializeReturn(
        await tx.inventoryReturn.update({
          where: { id },
          data: {
            status: "POSTED",
            resultId: ledger.id,
            approvedBy: actor.id,
            approvedAt: new Date(),
          },
        }),
      );
    });
  }

  @Post("returns/:id/cancel") async cancelReturn(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const result = await this.db.inventoryReturn.updateMany({
      where: {
        id,
        status: "REQUESTED",
        ...(actor.role === "admin" ? {} : { requestedBy: actor.id }),
      },
      data: { status: "CANCELLED" },
    });
    if (!result.count)
      throw new ConflictException(
        "Retur tidak ditemukan, sudah diproses, atau bukan pengajuan Anda.",
      );
    return { status: "CANCELLED" };
  }

  @Get("purchase-proposals") proposals() {
    return this.db.inventoryPurchaseProposal.findMany({
      include: { item: true },
      orderBy: { id: "desc" },
      take: 200,
    });
  }

  @Post("purchase-proposals") async createProposal(
    @Actor() actor: RequestUser,
    @Body() body: unknown,
  ) {
    const data = parse(proposalSchema, body);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryItem" WHERE id = ${data.itemId} AND active = true FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Item tidak ditemukan.");
      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: data.itemId },
        include: { balances: true },
      });
      if (
        await tx.inventoryPurchaseProposal.findFirst({
          where: { itemId: item.id, status: { in: ["DRAFT", "APPROVED"] } },
        })
      )
        throw new ConflictException("Item sudah memiliki proposal aktif.");
      const available = item.balances.reduce(
        (sum, balance) =>
          sum + balance.onHand - balance.reserved - balance.hold,
        0,
      );
      if (!item.reorderLevel || available > item.reorderLevel)
        throw new BadRequestException("Stok belum mencapai minimum.");
      return tx.inventoryPurchaseProposal.create({
        data: {
          code: await reference(tx, "inventory-proposal", "PRP"),
          itemId: item.id,
          quantity: data.qty || Math.max(item.reorderLevel - available, 1),
          available,
          reorderLevel: item.reorderLevel,
          requestedBy: actor.id,
        },
      });
    });
  }

  @AdminOnly() @Post("purchase-proposals/:id/approve") async approveProposal(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "InventoryPurchaseProposal" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length)
        throw new BadRequestException("Proposal tidak ditemukan.");
      const row = await tx.inventoryPurchaseProposal.findUniqueOrThrow({
        where: { id },
      });
      authorizeApproval(actor, row.requestedBy);
      if (row.status !== "DRAFT")
        throw new ConflictException("Proposal sudah diproses.");
      return tx.inventoryPurchaseProposal.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedBy: actor.id,
          approvedAt: new Date(),
        },
      });
    });
  }

  @Post("purchase-proposals/:id/cancel") async cancelProposal(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const result = await this.db.inventoryPurchaseProposal.updateMany({
      where: {
        id,
        status: "DRAFT",
        ...(actor.role === "admin" ? {} : { requestedBy: actor.id }),
      },
      data: { status: "CANCELLED" },
    });
    if (!result.count)
      throw new ConflictException(
        "Proposal tidak ditemukan, sudah diproses, atau bukan pengajuan Anda.",
      );
    return { status: "CANCELLED" };
  }

  @AdminOnly() @Post("purchase-proposals/:id/close") async closeProposal(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    if (actor.role !== "admin")
      throw new ForbiddenException("Administrator diperlukan.");
    const { note } = parse(
      z.object({ note: z.string().trim().min(1).max(1000) }).strict(),
      body,
    );
    const result = await this.db.inventoryPurchaseProposal.updateMany({
      where: { id, status: "APPROVED" },
      data: {
        status: "CLOSED",
        closeNote: note,
        closedBy: actor.id,
        closedAt: new Date(),
      },
    });
    if (!result.count)
      throw new ConflictException(
        "Proposal tidak ditemukan atau belum disetujui.",
      );
    return { status: "CLOSED" };
  }
}
