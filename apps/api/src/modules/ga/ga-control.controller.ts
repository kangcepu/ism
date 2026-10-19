import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { AngleDto, FindingDto, ReconciliationDto } from "./ga-control.dto";
const access = (a: RequestUser) => a.role === "admin" || a.gaRole !== "none";
const supervisor = (a: RequestUser) =>
  a.role === "admin" || a.gaRole === "supervisor";
@Controller("ga/control")
export class GaControlController {
  constructor(private readonly db: PrismaService) {}
  @Get("angles") async angles(@Actor() a: RequestUser) {
    if (!access(a)) throw new ForbiddenException();
    return this.db.gaCctvAngleInspection.findMany({
      include: { area: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("angles") async angle(@Actor() a: RequestUser, @Body() d: AngleDto) {
    if (!access(a)) throw new ForbiddenException();
    return this.db.gaCctvAngleInspection.create({
      data: {
        ...d,
        inspectorId: a.id,
        status: "INSPECTED",
        inspectedAt: new Date(),
      },
    });
  }
  @Post("angles/:id/:action") async angleAction(
    @Actor() a: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("action") action: string,
  ) {
    if (!supervisor(a)) throw new ForbiddenException();
    const status = (
      {
        match: "MATCH",
        gap: "GAP_FOUND",
        it: "IT_ACTION",
        recheck: "RECHECK",
        close: "CLOSED",
      } as Record<string, string>
    )[action];
    if (!status) throw new ConflictException("Aksi tidak valid.");
    return this.db.gaCctvAngleInspection.update({
      where: { id },
      data: {
        status: status as never,
        reviewerId: a.id,
        reviewedAt: new Date(),
      },
    });
  }
  @Get("reconciliations") async reconciliations(@Actor() a: RequestUser) {
    if (!access(a)) throw new ForbiddenException();
    return this.db.gaWeighbridgeReconciliation.findMany({
      orderBy: { securityTime: "desc" },
    });
  }
  @Post("reconciliations") async reconciliation(
    @Actor() a: RequestUser,
    @Body() d: ReconciliationDto,
  ) {
    if (!access(a)) throw new ForbiddenException();
    const securityTime = new Date(d.securityTime),
      cctvTime = new Date(d.cctvTime),
      delta = Math.round(
        Math.abs(securityTime.getTime() - cctvTime.getTime()) / 60000,
      );
    return this.db.gaWeighbridgeReconciliation.create({
      data: {
        ...d,
        securityTime,
        cctvTime,
        checkerId: a.id,
        durationMinutes: delta,
        status: delta <= 5 ? "MATCH" : "DISCREPANCY",
      },
    });
  }
  @Post("reconciliations/:id/verify") async verifyReconciliation(
    @Actor() a: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!supervisor(a)) throw new ForbiddenException();
    return this.db.gaWeighbridgeReconciliation.update({
      where: { id },
      data: { status: "VERIFIED", verifiedById: a.id, verifiedAt: new Date() },
    });
  }
  @Get("findings") async findings(@Actor() a: RequestUser) {
    if (!access(a)) throw new ForbiddenException();
    return this.db.gaFinding.findMany({
      include: { area: { select: { code: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }
  @Post("findings") async finding(
    @Actor() a: RequestUser,
    @Body() d: FindingDto,
  ) {
    if (!access(a)) throw new ForbiddenException();
    const s = await this.db.codeSequence.upsert({
      where: { scope: "ga-finding" },
      create: { scope: "ga-finding", value: 1 },
      update: { value: { increment: 1 } },
    });
    return this.db.gaFinding.create({
      data: {
        ...d,
        code: `GAF-${String(s.value).padStart(5, "0")}`,
        dueDate: d.dueDate ? new Date(d.dueDate) : undefined,
        createdById: a.id,
      },
    });
  }
  @Post("findings/:id/:action") async findingAction(
    @Actor() a: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("action") action: string,
  ) {
    if (!access(a)) throw new ForbiddenException();
    const status = (
      {
        start: "IN_PROGRESS",
        escalate: "ESCALATED",
        resolve: "RESOLVED",
        close: "CLOSED",
      } as Record<string, string>
    )[action];
    if (!status) throw new ConflictException("Aksi tidak valid.");
    return this.db.gaFinding.update({
      where: { id },
      data: {
        status: status as never,
        ...(action === "close"
          ? { verifiedById: a.id, verifiedAt: new Date() }
          : {}),
      },
    });
  }
  @Get("dashboard") async dashboard(@Actor() a: RequestUser) {
    if (!access(a)) throw new ForbiddenException();
    const [
      angles,
      gaps,
      reconciliations,
      discrepancies,
      findings,
      openFindings,
      cleaning,
      outdoor,
      preventive,
    ] = await Promise.all([
      this.db.gaCctvAngleInspection.count(),
      this.db.gaCctvAngleInspection.count({
        where: { status: { in: ["GAP_FOUND", "IT_ACTION", "RECHECK"] } },
      }),
      this.db.gaWeighbridgeReconciliation.count(),
      this.db.gaWeighbridgeReconciliation.count({
        where: { status: "DISCREPANCY" },
      }),
      this.db.gaFinding.count(),
      this.db.gaFinding.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
      }),
      this.db.gaCleaningChecklist.count({
        where: { status: { in: ["DRAFT", "REWORK"] } },
      }),
      this.db.gaOutdoorInspection.count({
        where: { status: { in: ["DRAFT", "REWORK"] } },
      }),
      this.db.gaPreventiveJob.count({
        where: { status: { in: ["RELEASED", "STARTED", "REWORK", "OVERDUE"] } },
      }),
    ]);
    return {
      angles,
      gaps,
      reconciliations,
      discrepancies,
      findings,
      openFindings,
      cleaning,
      outdoor,
      preventive,
    };
  }
}
