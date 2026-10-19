import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { AdminOnly } from "../../common/auth.decorators";
import { CryptoService } from "../../common/crypto.service";
import { PrismaService } from "../../database/prisma.service";

class AccountDto {
  @IsString() name!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() token?: string;
  @IsOptional() @IsString() secret?: string;
  @IsOptional() @IsObject() config?: { notes?: string };
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() externalId?: string;
}
class NetworkDto {
  @Matches(/^[0-9a-fA-F]{16}$/) externalId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) accountId?: number | null;
  @IsOptional() @IsObject() config?: { notes?: string; accountId?: number };
  @IsOptional() @IsString() secret?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
class MemberDto {
  @IsOptional() @IsBoolean() authorized?: boolean;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
}
function networkAccountId(dto: NetworkDto) {
  const value = dto.accountId ?? dto.config?.accountId;
  if (value != null && (!Number.isSafeInteger(value) || value < 1))
    throw new BadRequestException("Account ID tidak valid.");
  return value ?? null;
}
@Controller("zerotier")
export class ZeroTierController {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  @AdminOnly() @Get("accounts") accounts() {
    return this.db.integrationResource.findMany({
      where: { domain: "zerotier-account", deletedAt: null },
      select: { id: true, name: true, config: true, active: true },
    });
  }
  @AdminOnly() @Post("accounts") account(@Body() dto: AccountDto) {
    const token = dto.token || dto.secret;
    if (!token) throw new BadRequestException("Token wajib diisi.");
    return this.db.integrationResource.create({
      data: {
        domain: "zerotier-account",
        name: dto.name,
        config: { notes: dto.notes ?? dto.config?.notes ?? "" },
        active: dto.active ?? true,
        secret: this.crypto.encrypt(token),
      },
      select: { id: true, name: true, config: true, active: true },
    });
  }
  @AdminOnly() @Patch("accounts/:id") async accountUpdate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AccountDto,
  ) {
    await this.resource(id, "zerotier-account");
    return this.db.integrationResource.update({
      where: { id },
      data: {
        name: dto.name,
        config: { notes: dto.notes ?? dto.config?.notes ?? "" },
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.token || dto.secret
          ? { secret: this.crypto.encrypt((dto.token || dto.secret)!) }
          : {}),
      },
      select: { id: true, name: true, config: true, active: true },
    });
  }
  @AdminOnly() @Delete("accounts/:id") async accountDelete(
    @Param("id", ParseIntPipe) id: number,
  ) {
    await this.resource(id, "zerotier-account");
    const networks = await this.db.integrationResource.findMany({
      where: { domain: "zerotier-network", deletedAt: null },
      select: { config: true },
    });
    if (
      networks.some(
        (item) =>
          (item.config as { accountId?: number } | null)?.accountId === id,
      )
    )
      throw new BadRequestException("Account masih digunakan oleh network.");
    await this.db.integrationResource.update({
      where: { id },
      data: { deletedAt: new Date(), secret: null },
    });
    return { deleted: true };
  }
  @Get("networks") networks() {
    return this.db.integrationResource.findMany({
      where: { domain: "zerotier-network", deletedAt: null },
      select: {
        id: true,
        externalId: true,
        name: true,
        config: true,
        active: true,
        updatedAt: true,
      },
    });
  }
  @AdminOnly() @Post("networks") async network(@Body() dto: NetworkDto) {
    const accountId = networkAccountId(dto);
    if (accountId) await this.resource(accountId, "zerotier-account");
    if (
      await this.db.integrationResource.findFirst({
        where: {
          domain: "zerotier-network",
          externalId: dto.externalId.toLowerCase(),
          deletedAt: null,
        },
      })
    )
      throw new BadRequestException("Network ID sudah terdaftar.");
    return this.db.integrationResource.create({
      data: {
        domain: "zerotier-network",
        name: dto.name,
        externalId: dto.externalId.toLowerCase(),
        active: dto.active ?? true,
        config: {
          notes: dto.notes ?? dto.config?.notes ?? "",
          accountId: accountId || null,
        },
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        config: true,
        active: true,
      },
    });
  }
  @AdminOnly() @Patch("networks/:id") async networkUpdate(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: NetworkDto,
  ) {
    await this.resource(id, "zerotier-network");
    const accountId = networkAccountId(dto);
    if (accountId) await this.resource(accountId, "zerotier-account");
    const duplicate = await this.db.integrationResource.findFirst({
      where: {
        domain: "zerotier-network",
        externalId: dto.externalId.toLowerCase(),
        deletedAt: null,
        id: { not: id },
      },
    });
    if (duplicate) throw new BadRequestException("Network ID sudah terdaftar.");
    return this.db.integrationResource.update({
      where: { id },
      data: {
        name: dto.name,
        externalId: dto.externalId.toLowerCase(),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        config: {
          notes: dto.notes ?? dto.config?.notes ?? "",
          accountId: accountId || null,
        },
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        config: true,
        active: true,
      },
    });
  }
  @AdminOnly() @Delete("networks/:id") async networkDelete(
    @Param("id", ParseIntPipe) id: number,
  ) {
    await this.resource(id, "zerotier-network");
    await this.db.integrationResource.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }
  @Get("networks/:networkId/members") async members(
    @Param("networkId") networkId: string,
  ) {
    const data = await this.central(networkId, "GET");
    if (!Array.isArray(data))
      throw new BadGatewayException("Respons ZeroTier tidak valid.");
    return data.map((item) => this.normalize(item));
  }
  @AdminOnly()
  @Patch("networks/:networkId/members/:memberId")
  async memberUpdate(
    @Param("networkId") networkId: string,
    @Param("memberId") memberId: string,
    @Body() dto: MemberDto,
  ) {
    if (!/^[0-9a-fA-F]{10}$/.test(memberId))
      throw new BadRequestException("Member ID tidak valid.");
    const payload = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.authorized !== undefined
        ? { config: { authorized: dto.authorized } }
        : {}),
    };
    if (!Object.keys(payload).length)
      throw new BadRequestException("Tidak ada perubahan.");
    return this.normalize(
      await this.central(networkId, "POST", memberId, payload),
    );
  }
  @AdminOnly()
  @Delete("networks/:networkId/members/:memberId")
  async memberDelete(
    @Param("networkId") networkId: string,
    @Param("memberId") memberId: string,
  ) {
    if (!/^[0-9a-fA-F]{10}$/.test(memberId))
      throw new BadRequestException("Member ID tidak valid.");
    await this.central(networkId, "DELETE", memberId);
    return { deleted: true };
  }
  private async resource(id: number, domain: string) {
    const row = await this.db.integrationResource.findFirst({
      where: { id, domain, deletedAt: null },
    });
    if (!row) throw new NotFoundException("Data tidak ditemukan.");
    return row;
  }
  private async central(
    networkId: string,
    method: string,
    memberId?: string,
    body?: object,
  ): Promise<unknown> {
    if (!/^[0-9a-fA-F]{16}$/.test(networkId))
      throw new BadRequestException("Network ID tidak valid.");
    const network = await this.db.integrationResource.findFirst({
      where: {
        domain: "zerotier-network",
        externalId: networkId.toLowerCase(),
        deletedAt: null,
      },
    });
    if (!network) throw new NotFoundException("Network tidak terdaftar.");
    const accountId = (network.config as { accountId?: number | null } | null)
      ?.accountId;
    const account = accountId
      ? await this.resource(accountId, "zerotier-account")
      : null;
    const legacy = account
      ? null
      : await this.db.appSetting.findUnique({
          where: { group_key: { group: "zerotier", key: "token" } },
        });
    const secret = account?.secret || legacy?.encryptedValue;
    if (!secret)
      throw new BadRequestException("Token ZeroTier belum dikonfigurasi.");
    try {
      const token = this.crypto.decrypt(secret);
      const url = `https://api.zerotier.com/api/v1/network/${networkId.toLowerCase()}/member${memberId ? `/${memberId.toLowerCase()}` : ""}`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `token ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Upstream failed");
      if (method === "DELETE") return null;
      return await response.json();
    } catch {
      throw new BadGatewayException("ZeroTier Central tidak dapat diakses.");
    }
  }
  private normalize(value: unknown) {
    if (!value || typeof value !== "object")
      throw new BadGatewayException("Respons ZeroTier tidak valid.");
    const row = value as Record<string, unknown>;
    const config = (row.config || {}) as Record<string, unknown>;
    const lastOnline = Number(row.lastOnline || row.lastSeen || 0);
    return {
      id: row.nodeId || row.id,
      name: row.name || "",
      description: row.description || "",
      authorized: Boolean(config.authorized),
      online: lastOnline > 0 && Date.now() - lastOnline < 300000,
      lastOnline: lastOnline || null,
      ipAssignments: config.ipAssignments || row.ipAssignments || [],
      physicalAddress: row.physicalAddress || null,
      clientVersion: row.clientVersion || null,
    };
  }
}
