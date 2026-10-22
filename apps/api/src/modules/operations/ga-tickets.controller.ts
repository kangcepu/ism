import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";

@Controller("it-support/ga-tickets")
export class GaTicketsController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  list() {
    return this.db.gaItTicket.findMany({
      include: {
        finding: { include: { area: { select: { code: true, name: true } } } },
      },
      orderBy: { id: "desc" },
    });
  }

  @Post(":id/start")
  async start(@Param("id", ParseIntPipe) id: number) {
    const ticket = await this.db.gaItTicket.findUniqueOrThrow({
      where: { id },
    });
    if (ticket.status !== "OPEN")
      throw new ConflictException(
        "Tiket tidak dapat diproses pada status ini.",
      );
    return this.db.gaItTicket.update({
      where: { id, status: "OPEN" },
      data: { status: "IN_PROGRESS" },
    });
  }

  @Post(":id/resolve")
  async resolve(
    @Actor() actor: RequestUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const input = z
      .object({ resolution: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(body);
    if (!input.success)
      throw new ConflictException("Hasil penanganan wajib diisi.");
    const ticket = await this.db.gaItTicket.findUniqueOrThrow({
      where: { id },
    });
    if (ticket.status !== "IN_PROGRESS")
      throw new ConflictException("Tiket harus diproses sebelum diselesaikan.");
    return this.db.gaItTicket.update({
      where: { id, status: "IN_PROGRESS" },
      data: {
        status: "RESOLVED",
        resolution: input.data.resolution,
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
  }
}
