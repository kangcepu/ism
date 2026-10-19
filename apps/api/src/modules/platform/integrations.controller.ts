import { Controller, Post } from "@nestjs/common";
import { AdminOnly } from "../../common/auth.decorators";
import { PrismaService } from "../../database/prisma.service";

@Controller("asset-sync")
export class AssetSyncController {
  constructor(private readonly db: PrismaService) {}
  @AdminOnly() @Post("runs") async run() {
    return this.db.jobRun.create({
      data: { job: "asset-sync", status: "queued" },
    });
  }
}
