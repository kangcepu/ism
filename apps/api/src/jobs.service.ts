import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "./database/prisma.service";
@Injectable()
export class JobsService {
  constructor(private readonly db: PrismaService) {}
  @Cron("0 */5 * * * *") async cleanupTokens() { const run = await this.db.jobRun.create({ data: { job: "token-cleanup", status: "running" } }); try { const now = new Date(); const [mobile, web] = await this.db.$transaction([this.db.mobileToken.deleteMany({ where: { expiresAt: { lt: now } } }), this.db.webSession.deleteMany({ where: { expiresAt: { lt: now } } })]); await this.db.jobRun.update({ where: { id: run.id }, data: { status: "success", processed: mobile.count + web.count, succeeded: mobile.count + web.count, finishedAt: new Date() } }); } catch (error) { await this.db.jobRun.update({ where: { id: run.id }, data: { status: "failed", failed: 1, errorSummary: error instanceof Error ? error.message : "Unknown error", finishedAt: new Date() } }); } }
}
