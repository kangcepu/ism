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
  Res,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import type { Response } from "express";
import { z } from "zod";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

const access = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";
const supervisor = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const periodSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
const date = (value: string) => {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(result.valueOf()) ||
    result.toISOString().slice(0, 10) !== value
  )
    throw new ConflictException("Tanggal tidak valid.");
  return result;
};
const ratio = (
  name: string,
  numerator: number,
  denominator: number,
  definition: string,
) => ({
  name,
  numerator,
  denominator,
  value: denominator
    ? Math.round((numerator / denominator) * 10000) / 100
    : null,
  definition,
});

@Controller("ga/reports")
export class GaReportingController {
  constructor(private readonly db: PrismaService) {}

  private async snapshot(startText: string, endText: string) {
    const start = date(startText);
    const end = date(endText);
    if (start > end || end.valueOf() - start.valueOf() > 366 * 86400000)
      throw new ConflictException(
        "Periode tidak valid atau lebih dari satu tahun.",
      );
    const endExclusive = new Date(end.valueOf() + 86400000);
    const verifiedBefore = new Date(end.valueOf() + 17 * 3600000);
    const range = { gte: start, lt: endExclusive };
    const [cleaning, outdoor, preventive, findings, points, angles] =
      await Promise.all([
        this.db.gaCleaningChecklist.findMany({
          where: { workDate: range, status: { not: "CANCELLED" } },
          select: { id: true, status: true, workDate: true, verifiedAt: true },
        }),
        this.db.gaOutdoorInspection.findMany({
          where: { inspectedAt: range },
          select: {
            id: true,
            status: true,
            verifiedAt: true,
            plantCondition: true,
            drainCondition: true,
            cleanliness: true,
          },
        }),
        this.db.gaPreventiveJob.findMany({
          where: { targetDate: range },
          select: {
            id: true,
            status: true,
            targetDate: true,
            verifiedAt: true,
          },
        }),
        this.db.gaFinding.findMany({
          where: { dueDate: range },
          select: { id: true, status: true, dueDate: true, verifiedAt: true },
        }),
        this.db.gaArea.findMany({
          where: { type: "point", active: true, status: "ACTIVE" },
          select: { x: true, y: true, floorPage: true },
        }),
        this.db.gaCctvAngleInspection.findMany({
          where: { inspectedAt: range, plannedViewReference: { not: null } },
          select: {
            status: true,
            plannedViewReference: true,
            reviewedAt: true,
          },
        }),
      ]);
    const verified = (value: { verifiedAt: Date | null }) =>
      value.verifiedAt !== null && value.verifiedAt < verifiedBefore;
    const onTime = (value: { verifiedAt: Date | null; targetDate: Date }) =>
      value.verifiedAt !== null &&
      value.verifiedAt.valueOf() < value.targetDate.valueOf() + 17 * 3600000;
    const indicators = outdoor
      .filter(verified)
      .flatMap((x) => [x.plantCondition, x.drainCondition, x.cleanliness])
      .filter((x) => ["BAIK", "PERLU PERHATIAN", "KRITIS"].includes(x));
    const reviewedAngles = angles.filter(
      (x) =>
        x.plannedViewReference?.trim() &&
        x.reviewedAt &&
        x.reviewedAt < verifiedBefore,
    );
    return {
      period: { start: startText, end: endText },
      generatedAt: new Date().toISOString(),
      metrics: [
        ratio(
          "Penyelesaian cleaning",
          cleaning.filter(verified).length,
          cleaning.length,
          "Checklist diverifikasi sampai akhir periode / seluruh checklist terjadwal pada periode.",
        ),
        ratio(
          "Verifikasi inspeksi outdoor",
          outdoor.filter(verified).length,
          outdoor.length,
          "Inspeksi outdoor diverifikasi sampai akhir periode / seluruh inspeksi pada periode.",
        ),
        ratio(
          "Kepatuhan area luar",
          indicators.filter((x) => x === "BAIK").length,
          indicators.length,
          "Indikator tanaman, parit dan kebersihan yang baik / indikator valid dari inspeksi terverifikasi.",
        ),
        ratio(
          "Titik area pada denah",
          points.filter(
            (x) => x.x !== null && x.y !== null && x.floorPage !== null,
          ).length,
          points.length,
          "Titik inspeksi aktif dengan koordinat dan halaman denah / seluruh titik inspeksi aktif; pengukuran posisi masih perlu diverifikasi lapangan.",
        ),
        ratio(
          "Preventive tepat waktu",
          preventive.filter(onTime).length,
          preventive.length,
          "Preventive diverifikasi sebelum akhir tanggal jatuh tempo / seluruh preventive jatuh tempo pada periode.",
        ),
        ratio(
          "Penutupan temuan tepat waktu",
          findings.filter(
            (x) =>
              x.verifiedAt &&
              x.dueDate &&
              x.verifiedAt.valueOf() < x.dueDate.valueOf() + 17 * 3600000,
          ).length,
          findings.length,
          "Temuan diverifikasi sebelum akhir tanggal jatuh tempo / seluruh temuan jatuh tempo pada periode.",
        ),
        ratio(
          "Kesesuaian angle CCTV",
          reviewedAngles.filter((x) => ["MATCH", "CLOSED"].includes(x.status))
            .length,
          reviewedAngles.length,
          "Inspeksi yang dinyatakan sesuai / inspeksi dengan baseline yang sudah diperiksa pada periode.",
        ),
      ],
      counts: {
        cleaning: cleaning.length,
        outdoor: outdoor.length,
        preventive: preventive.length,
        findings: findings.length,
      },
    };
  }

  @Get("dashboard")
  async dashboard(
    @Actor() actor: RequestUser,
    @Query("start") start: string,
    @Query("end") end: string,
  ) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const parsed = periodSchema.safeParse({ start, end });
    if (!parsed.success) throw new ConflictException("Periode wajib diisi.");
    return this.snapshot(parsed.data.start, parsed.data.end);
  }

  @Get()
  list(@Actor() actor: RequestUser) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.gaReport.findMany({
      where: supervisor(actor) ? {} : { status: "PUBLISHED" },
      orderBy: { id: "desc" },
      take: 100,
    });
  }

  @Post()
  async create(@Actor() actor: RequestUser, @Body() body: unknown) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const parsed = periodSchema.safeParse(body);
    if (!parsed.success)
      throw new ConflictException("Periode laporan tidak valid.");
    const data = await this.snapshot(parsed.data.start, parsed.data.end);
    return this.db.$transaction(async (tx) => {
      const sequence = await tx.codeSequence.upsert({
        where: { scope: "ga-report" },
        create: { scope: "ga-report", value: 1 },
        update: { value: { increment: 1 } },
      });
      return tx.gaReport.create({
        data: {
          code: `GAR-${String(sequence.value).padStart(5, "0")}`,
          periodStart: date(parsed.data.start),
          periodEnd: date(parsed.data.end),
          createdById: actor.id,
          snapshot: data as Prisma.InputJsonValue,
        },
      });
    });
  }

  @Post(":id/review")
  async review(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const report = await this.db.gaReport.findUniqueOrThrow({ where: { id } });
    if (report.status !== "DRAFT")
      throw new ConflictException("Hanya laporan draft dapat diperiksa.");
    if (report.createdById === actor.id)
      throw new ForbiddenException(
        "Pembuat laporan tidak dapat memeriksa laporannya sendiri.",
      );
    return this.db.gaReport.update({
      where: { id, status: "DRAFT" },
      data: {
        status: "REVIEWED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
  }

  @Post(":id/publish")
  async publish(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const report = await this.db.gaReport.findUniqueOrThrow({ where: { id } });
    if (report.status !== "REVIEWED")
      throw new ConflictException(
        "Laporan harus diperiksa sebelum diterbitkan.",
      );
    return this.db.gaReport.update({
      where: { id, status: "REVIEWED" },
      data: {
        status: "PUBLISHED",
        publishedById: actor.id,
        publishedAt: new Date(),
      },
    });
  }
  @Get(":id/pdf")
  async pdf(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    if (!access(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const report = await this.db.gaReport.findUniqueOrThrow({ where: { id } });
    if (report.status !== "PUBLISHED")
      throw new ForbiddenException(
        "Hanya laporan yang diterbitkan dapat diunduh.",
      );
    const snapshot = report.snapshot as unknown as {
      period: { start: string; end: string };
      generatedAt: string;
      metrics: Array<{
        name: string;
        numerator: number;
        denominator: number;
        value: number | null;
        definition: string;
      }>;
    };
    response.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.code}.pdf"`,
    });
    const pdf = new PDFDocument({ margin: 48 });
    pdf.pipe(response);
    pdf.fontSize(18).text(`Laporan General Affair ${report.code}`);
    pdf
      .fontSize(10)
      .moveDown()
      .text(`Periode ${snapshot.period.start} sampai ${snapshot.period.end}`)
      .text(`Snapshot ${snapshot.generatedAt}`)
      .text(`Diterbitkan ${report.publishedAt?.toISOString() || "-"}`)
      .moveDown();
    for (const metric of snapshot.metrics) {
      pdf.fontSize(12).text(metric.name);
      pdf
        .fontSize(10)
        .text(
          `${metric.value === null ? "Tidak terukur" : `${metric.value}%`} (${metric.numerator} / ${metric.denominator})`,
        )
        .text(metric.definition)
        .moveDown();
    }
    pdf.end();
  }
}
