import {
  Body,
  ConflictException,
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
import {
  PreventivePlanDto,
  PreventiveResultDto,
  ReworkDto,
} from "./ga-preventive.dto";

const canAccess = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole !== "none";
const canSupervise = (actor: RequestUser) =>
  actor.role === "admin" || actor.gaRole === "supervisor";
const localDate = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const planInclude = { area: { select: { code: true, name: true } }, job: true };

@Controller("ga/preventive")
export class GaPreventiveController {
  constructor(private readonly db: PrismaService) {}

  private async refreshOverdue() {
    await this.db.gaPreventiveJob.updateMany({
      where: {
        targetDate: { lt: localDate(new Date().toISOString()) },
        status: { in: ["RELEASED", "STARTED", "REWORK"] },
      },
      data: { status: "OVERDUE" },
    });
  }

  @Get("workers")
  async workers(@Actor() actor: RequestUser) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    return this.db.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ gaRole: "staff" }, { gaRole: "supervisor" }, { role: "admin" }],
      },
      select: { id: true, fullname: true, gaRole: true },
      orderBy: { fullname: "asc" },
    });
  }

  @Get("plans")
  async plans(@Actor() actor: RequestUser, @Query("month") month?: string) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const start = month ? new Date(`${month}-01T00:00:00.000Z`) : undefined;
    const end = start
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      : undefined;
    return this.db.gaPreventivePlan.findMany({
      where: start && end ? { targetDate: { gte: start, lt: end } } : {},
      include: planInclude,
      orderBy: [{ targetDate: "asc" }, { id: "desc" }],
    });
  }

  @Post("plans")
  async createPlan(
    @Actor() actor: RequestUser,
    @Body() dto: PreventivePlanDto,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const plan = await this.db.gaPreventivePlan.create({
      data: { ...dto, targetDate: localDate(dto.targetDate) },
      include: planInclude,
    });
    await this.history(actor.id, "PLAN_CREATED", { planId: plan.id }, plan.id);
    return plan;
  }

  @Patch("plans/:id")
  async updatePlan(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: PreventivePlanDto,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const old = await this.db.gaPreventivePlan.findUniqueOrThrow({
      where: { id },
    });
    if (!["DRAFT", "PROPOSED"].includes(old.status))
      throw new ConflictException(
        "Rencana yang sudah disetujui tidak dapat diubah.",
      );
    const plan = await this.db.gaPreventivePlan.update({
      where: { id },
      data: { ...dto, targetDate: localDate(dto.targetDate) },
      include: planInclude,
    });
    await this.history(actor.id, "PLAN_UPDATED", { planId: id }, id);
    return plan;
  }

  @Post("plans/:id/propose")
  async propose(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const plan = await this.db.gaPreventivePlan.update({
      where: { id, status: "DRAFT" },
      data: { status: "PROPOSED", proposedAt: new Date() },
      include: planInclude,
    });
    await this.history(actor.id, "PLAN_PROPOSED", { planId: id }, id);
    return plan;
  }

  @Post("plans/:id/approve")
  async approve(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const plan = await this.db.gaPreventivePlan.update({
      where: { id, status: "PROPOSED" },
      data: {
        status: "APPROVED",
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      include: planInclude,
    });
    await this.history(actor.id, "PLAN_APPROVED", { planId: id }, id);
    return plan;
  }

  @Post("plans/:id/release")
  async release(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const plan = await this.db.gaPreventivePlan.findUniqueOrThrow({
      where: { id },
    });
    if (plan.status !== "APPROVED")
      throw new ConflictException(
        "Hanya rencana yang disetujui dapat dirilis.",
      );
    const released = await this.db.$transaction(async (tx) => {
      const updated = await tx.gaPreventivePlan.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
        include: planInclude,
      });
      await tx.gaPreventiveJob.create({
        data: {
          planId: plan.id,
          areaId: plan.areaId,
          pic1Id: plan.pic1Id,
          pic2Id: plan.pic2Id,
          targetDate: plan.targetDate,
          standardWork: plan.standardWork,
        },
      });
      return updated;
    });
    await this.history(actor.id, "PLAN_RELEASED", { planId: id }, id);
    return released;
  }

  @Get("jobs")
  async jobs(@Actor() actor: RequestUser, @Query("month") month?: string) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    await this.refreshOverdue();
    const start = month ? new Date(`${month}-01T00:00:00.000Z`) : undefined;
    const end = start
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      : undefined;
    return this.db.gaPreventiveJob.findMany({
      where: {
        ...(canSupervise(actor)
          ? {}
          : { OR: [{ pic1Id: actor.id }, { pic2Id: actor.id }] }),
        ...(start && end ? { targetDate: { gte: start, lt: end } } : {}),
      },
      include: {
        area: { select: { code: true, name: true } },
        plan: { select: { title: true, priority: true } },
      },
      orderBy: [{ targetDate: "asc" }, { id: "desc" }],
    });
  }

  @Post("jobs/:id/start")
  async start(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const job = await this.ownJob(actor, id);
    if (!["RELEASED", "OVERDUE", "REWORK"].includes(job.status))
      throw new ConflictException("Pekerjaan belum dapat dimulai.");
    const updated = await this.db.gaPreventiveJob.update({
      where: { id },
      data: { status: "STARTED", startedAt: job.startedAt ?? new Date() },
    });
    await this.history(actor.id, "JOB_STARTED", { jobId: id }, undefined, id);
    return updated;
  }

  @Patch("jobs/:id/result")
  async result(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: PreventiveResultDto,
  ) {
    const job = await this.ownJob(actor, id);
    if (!["STARTED", "OVERDUE", "REWORK"].includes(job.status))
      throw new ConflictException("Pekerjaan belum dapat diisi.");
    const updated = await this.db.gaPreventiveJob.update({
      where: { id },
      data: dto,
    });
    await this.history(
      actor.id,
      "JOB_RESULT_UPDATED",
      { jobId: id },
      undefined,
      id,
    );
    return updated;
  }

  @Post("jobs/:id/submit")
  async submit(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const job = await this.ownJob(actor, id);
    if (!job.result || !job.beforePhoto || !job.afterPhoto)
      throw new ConflictException(
        "Hasil dan foto sebelum/sesudah wajib diisi.",
      );
    return this.db.gaPreventiveJob.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }

  @Post("jobs/:id/verify")
  async verify(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    return this.db.gaPreventiveJob.update({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "VERIFIED",
        verifiedById: actor.id,
        verifiedAt: new Date(),
      },
    });
  }

  @Post("jobs/:id/rework")
  async rework(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReworkDto,
  ) {
    if (!canSupervise(actor))
      throw new ForbiddenException("Supervisor GA diperlukan.");
    const updated = await this.db.gaPreventiveJob.update({
      where: { id, status: "SUBMITTED" },
      data: {
        status: "REWORK",
        reworkReason: dto.reason,
        verifiedById: null,
        verifiedAt: null,
      },
    });
    await this.history(
      actor.id,
      "JOB_REWORK",
      { jobId: id, reason: dto.reason },
      undefined,
      id,
    );
    return updated;
  }

  private async ownJob(actor: RequestUser, id: number) {
    if (!canAccess(actor)) throw new ForbiddenException("Akses GA diperlukan.");
    const job = await this.db.gaPreventiveJob.findUniqueOrThrow({
      where: { id },
    });
    if (!canSupervise(actor) && ![job.pic1Id, job.pic2Id].includes(actor.id))
      throw new ForbiddenException("Pekerjaan ini bukan penugasan Anda.");
    return job;
  }

  private history(
    actorId: number,
    action: string,
    snapshot: object,
    planId?: number,
    jobId?: number,
  ) {
    return this.db.gaPreventiveHistory.create({
      data: { actorId, action, snapshot, planId, jobId },
    });
  }
}
