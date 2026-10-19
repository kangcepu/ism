import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "./common/auth.decorators";
import { PrismaService } from "./database/prisma.service";
@Controller("health")
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Public() @Get("live") live() { return { status: "ok" }; }
  @Public() @Get("ready") async ready() { try { await this.db.$queryRaw`SELECT 1`; return { status: "ready", database: "up" }; } catch { throw new ServiceUnavailableException("Database belum siap."); } }
}
