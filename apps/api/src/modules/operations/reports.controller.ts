import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { AdminOnly } from "../../common/auth.decorators";
import { pageMeta } from "../../common/dto";
import { PrismaService } from "../../database/prisma.service";
import { ReportDto, ReportQuery } from "./operations.dto";

function reportWhere(q: ReportQuery): Prisma.ItSupportReportWhereInput {
  if (q.from && q.to && q.from > q.to)
    throw new BadRequestException("Tanggal awal harus sebelum tanggal akhir.");
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.location ? { location: q.location } : {}),
    ...(q.from || q.to
      ? {
          date: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to
              ? { lte: new Date(`${q.to.slice(0, 10)}T23:59:59.999Z`) }
              : {}),
          },
        }
      : {}),
    ...(q.q
      ? {
          OR: [
            { reporter: { contains: q.q, mode: "insensitive" } },
            { analysis: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
@Controller("it-support-reports")
export class SupportReportsController {
  constructor(private readonly db: PrismaService) {}
  @Get() async list(@Query() q: ReportQuery) {
    const where = reportWhere(q);
    const [data, total] = await this.db.$transaction([
      this.db.itSupportReport.findMany({
        where,
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        orderBy: { [q.sort || "date"]: q.direction || "desc" },
      }),
      this.db.itSupportReport.count({ where }),
    ]);
    return { data, pagination: pageMeta(q.page, q.perPage, total) };
  }
  @Get("summary") async summary() {
    const groups = await this.db.itSupportReport.groupBy({
      by: ["status"],
      _count: true,
    });
    return {
      total: groups.reduce((n, g) => n + g._count, 0),
      statuses: groups,
    };
  }
  @Get("options") async options() {
    const [categories, locations] = await Promise.all([
      this.db.itSupportReport.findMany({
        distinct: ["category"],
        select: { category: true },
      }),
      this.db.itSupportReport.findMany({
        distinct: ["location"],
        select: { location: true },
      }),
    ]);
    return {
      categories: categories.map((x) => x.category),
      locations: locations.map((x) => x.location),
    };
  }
  @Get("export") async export(@Query() q: ReportQuery, @Res() res: Response) {
    const rows = await this.db.itSupportReport.findMany({
      where: reportWhere(q),
      orderBy: { [q.sort || "date"]: q.direction || "desc" },
    });
    const quote = (v: unknown) => {
      const text = String(v ?? "");
      const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv =
      "\uFEFF" +
      [
        "Tanggal;Pelapor;Departemen;Lokasi;Kategori;Analisis;Solusi;Status",
        ...rows.map((r) =>
          [
            r.date.toISOString(),
            r.reporter,
            r.department,
            r.location,
            r.category,
            r.analysis,
            r.resolution,
            r.status,
          ]
            .map(quote)
            .join(";"),
        ),
      ].join("\r\n");
    res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=it-support-reports.csv",
      })
      .send(csv);
  }
  @AdminOnly() @Post() create(@Body() dto: ReportDto) {
    return this.db.itSupportReport.create({
      data: { ...dto, date: new Date(dto.date) },
    });
  }
  @AdminOnly() @Patch(":id") update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReportDto,
  ) {
    return this.db.itSupportReport.update({
      where: { id },
      data: { ...dto, date: new Date(dto.date) },
    });
  }
  @AdminOnly() @Delete(":id") remove(@Param("id", ParseIntPipe) id: number) {
    return this.db.itSupportReport.delete({ where: { id } });
  }
}
