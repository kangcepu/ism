import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { AssetStatus, Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";

class InventoryReportQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) categoryId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) locationId?: number;
  @IsOptional() @IsString() itemType?: string;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) actorId?: number;
  @IsOptional() @IsIn(["category", "location", "status", "itemType"]) groupBy?:
    "category" | "location" | "status" | "itemType";
  @IsOptional() @IsIn(["json", "csv", "excel", "pdf"]) format?:
    "json" | "csv" | "excel" | "pdf";
}

type ReportType = "summary" | "details" | "history";
type ReportRow = Record<string, string | number | null>;

@Controller("reports/inventory")
export class InventoryReportsController {
  constructor(private readonly db: PrismaService) {}

  @Get(":type")
  async report(
    @Param("type") type: string,
    @Query() query: InventoryReportQuery,
    @Res() response: Response,
  ) {
    if (!["summary", "details", "history"].includes(type))
      throw new BadRequestException("Jenis laporan tidak dikenal.");
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException(
        "Tanggal awal harus sebelum tanggal akhir.",
      );
    const reportType = type as ReportType;
    const format = query.format || "json";
    if (format === "json") {
      const where = this.assetWhere(query);
      let data: unknown;
      if (reportType === "history") {
        data = await this.db.assetHistory.findMany({
          where: {
            asset: where,
            ...(query.action ? { eventType: query.action } : {}),
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.from || query.to ? { createdAt: this.range(query) } : {}),
          },
          include: { asset: { select: { code: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 1000,
        });
      } else if (reportType === "details") {
        if (query.from || query.to) where.purchaseDate = this.range(query);
        data = await this.db.asset.findMany({
          where,
          include: { category: true, location: true, customData: true },
          orderBy: { code: "asc" },
        });
      } else if (!query.groupBy) {
        if (query.from || query.to) where.purchaseDate = this.range(query);
        data = await this.db.asset.groupBy({
          by: ["status"],
          where,
          _count: true,
          _sum: { price: true },
        });
      } else {
        const rows: ReportRow[] = [];
        for await (const row of this.rows(reportType, query)) rows.push(row);
        data = rows;
      }
      response.json({
        success: true,
        data,
        meta: { requestId: randomUUID(), timestamp: new Date().toISOString() },
      });
      return;
    }
    const columns =
      reportType === "summary"
        ? ["group", "count", "totalPrice"]
        : reportType === "details"
          ? [
              "code",
              "name",
              "category",
              "itemType",
              "location",
              "status",
              "assigneeName",
              "purchaseDate",
              "price",
            ]
          : [
              "createdAt",
              "code",
              "name",
              "eventType",
              "actorId",
              "statusFrom",
              "statusTo",
              "note",
            ];
    if (format === "csv" || format === "excel") {
      response.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory-${type}.csv"`,
      });
      await this.write(response, `\uFEFF${columns.join(";")}\r\n`);
      for await (const row of this.rows(reportType, query))
        await this.write(
          response,
          `${columns.map((key) => this.csv(row[key])).join(";")}\r\n`,
        );
      response.end();
      return;
    }
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="inventory-${type}.pdf"`,
    });
    const pdf = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 35,
    });
    pdf.pipe(response);
    pdf.fontSize(16).text(`Inventory ${type}`);
    pdf.moveDown().fontSize(8).text(columns.join(" | "));
    pdf.moveDown(0.5);
    for await (const row of this.rows(reportType, query))
      pdf.text(columns.map((key) => String(row[key] ?? "—")).join(" | "), {
        lineGap: 3,
      });
    pdf.end();
  }

  private async write(response: Response, chunk: string) {
    if (!response.write(chunk)) await once(response, "drain");
  }
  private csv(value: string | number | null | undefined) {
    const raw = String(value ?? "");
    const safe =
      typeof value === "string" && /^[\t\r\n ]*[=+\-@]/.test(raw)
        ? `'${raw}`
        : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  }
  private assetWhere(q: InventoryReportQuery): Prisma.AssetWhereInput {
    return {
      deletedAt: null,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.itemType ? { category: { itemType: q.itemType } } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { code: { contains: q.q, mode: "insensitive" } },
              { name: { contains: q.q, mode: "insensitive" } },
              { serialNumber: { contains: q.q, mode: "insensitive" } },
              { assigneeName: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }
  private range(q: InventoryReportQuery) {
    return {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to ? { lte: new Date(`${q.to.slice(0, 10)}T23:59:59.999Z`) } : {}),
    };
  }
  private async *rows(
    type: ReportType,
    q: InventoryReportQuery,
  ): AsyncGenerator<ReportRow> {
    const where = this.assetWhere(q);
    if (type === "history") {
      let cursor: number | undefined;
      const historyWhere: Prisma.AssetHistoryWhereInput = {
        asset: where,
        ...(q.action ? { eventType: q.action } : {}),
        ...(q.actorId ? { actorId: q.actorId } : {}),
        ...(q.from || q.to ? { createdAt: this.range(q) } : {}),
      };
      for (;;) {
        const rows = await this.db.assetHistory.findMany({
          where: historyWhere,
          include: { asset: { select: { code: true, name: true } } },
          take: 250,
          orderBy: { id: "asc" },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) break;
        for (const row of rows)
          yield {
            createdAt: row.createdAt.toISOString(),
            code: row.asset.code,
            name: row.asset.name,
            eventType: row.eventType,
            actorId: row.actorId,
            statusFrom: row.statusFrom,
            statusTo: row.statusTo,
            note: row.note,
          };
        cursor = rows[rows.length - 1].id;
      }
      return;
    }
    if (q.from || q.to) where.purchaseDate = this.range(q);
    let cursor: number | undefined;
    const groups = new Map<string, { count: number; totalPrice: number }>();
    for (;;) {
      const rows = await this.db.asset.findMany({
        where,
        include: { category: true, location: true },
        take: 250,
        orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        if (type === "summary") {
          const key =
            q.groupBy === "category"
              ? row.category.name
              : q.groupBy === "location"
                ? row.location.name
                : q.groupBy === "itemType"
                  ? row.category.itemType
                  : row.status;
          const group = groups.get(key) || { count: 0, totalPrice: 0 };
          group.count++;
          group.totalPrice += Number(row.price || 0);
          groups.set(key, group);
        } else
          yield {
            code: row.code,
            name: row.name,
            category: row.category.name,
            itemType: row.category.itemType,
            location: row.location.name,
            status: row.status,
            assigneeName: row.assigneeName,
            purchaseDate: row.purchaseDate?.toISOString().slice(0, 10) || null,
            price: row.price?.toString() || null,
          };
      }
      cursor = rows[rows.length - 1].id;
    }
    for (const [group, values] of groups) yield { group, ...values };
  }
}
