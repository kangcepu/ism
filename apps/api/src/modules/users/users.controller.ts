import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  BadRequestException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { AdminOnly } from "../../common/auth.decorators";
import { PageQuery, pageMeta } from "../../common/dto";
import { PrismaService } from "../../database/prisma.service";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

const select = {
  id: true,
  username: true,
  fullname: true,
  email: true,
  phone: true,
  division: true,
  company: true,
  role: true,
  gaRole: true,
  createdAt: true,
  updatedAt: true,
  permissionGroup: { select: { id: true, code: true, name: true, permissions: true } },
};
const catalog = [
  ["dashboard.read", "Dashboard", "Melihat ringkasan operasional"],
  ["assets.read", "Aset", "Melihat aset dan assignment"], ["assets.manage", "Aset", "Membuat, mengubah, dan assignment aset"],
  ["inventory.read", "Inventory", "Melihat stok dan ledger"], ["inventory.manage", "Inventory", "Mengelola receipt, issue, transfer, dan opname"],
  ["master.read", "Master Data", "Melihat kategori dan lokasi"], ["master.manage", "Master Data", "Mengelola kategori dan lokasi"],
  ["monitoring.read", "Monitoring", "Melihat status dan traffic jaringan"], ["monitoring.manage", "Monitoring", "Mengelola monitor dan probe"],
  ["network.read", "Switch", "Melihat perangkat switch"], ["network.manage", "Switch", "Mengelola perangkat switch"],
  ["maps.read", "Peta", "Melihat denah dan marker"], ["maps.manage", "Peta", "Mengelola denah dan marker"],
  ["ga.read", "General Affair", "Melihat operasional GA"], ["ga.manage", "General Affair", "Mengelola operasional GA"],
  ["cctv.read", "CCTV", "Melihat register dan kondisi CCTV"], ["cctv.manage", "CCTV", "Mengelola register dan tindak lanjut CCTV"],
  ["reports.read", "Laporan", "Melihat laporan"], ["support.read", "IT Support", "Melihat laporan IT Support"], ["support.manage", "IT Support", "Mengelola laporan IT Support"],
  ["ai.read", "AI Assistant", "Menggunakan AI Assistant"],
] as const;
const allowedPermissions = new Set(catalog.map(([code]) => code));
@Controller("users")
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}
  @AdminOnly() @Get() async list(@Query() q: PageQuery) {
    const where = {
      deletedAt: null,
      ...(q.q
        ? {
            OR: [
              { username: { contains: q.q, mode: "insensitive" as const } },
              { fullname: { contains: q.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select,
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        orderBy: { fullname: "asc" },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, pagination: pageMeta(q.page, q.perPage, total) };
  }
  @AdminOnly() @Get("permission-groups") async groups() {
    return this.prisma.permissionGroup.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } });
  }
  @AdminOnly() @Get("permission-groups/catalog") catalog() { return catalog.map(([code, module, description]) => ({ code, module, description })); }
  @AdminOnly() @Post("permission-groups") async createGroup(@Body() dto: { name: string; description?: string; permissions: string[] }) {
    this.validateGroup(dto);
    const code = await this.nextGroupCode(dto.name);
    return this.prisma.permissionGroup.create({ data: { ...dto, code } });
  }
  @AdminOnly() @Patch("permission-groups/:id") async updateGroup(@Param("id", ParseIntPipe) id: number, @Body() dto: { name?: string; description?: string | null; permissions?: string[]; active?: boolean }) {
    this.validateGroup(dto);
    return this.prisma.permissionGroup.update({ where: { id }, data: dto });
  }
  @AdminOnly() @Delete("permission-groups/:id") async removeGroup(@Param("id", ParseIntPipe) id: number) {
    await this.prisma.permissionGroup.delete({ where: { id } });
    return { deleted: true };
  }
  @Get("assignees") async assignees() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        username: true,
        fullname: true,
        division: true,
        company: true,
      },
      orderBy: { fullname: "asc" },
    });
    return {
      users,
      hrDirectoryEnabled: Boolean(
        await this.prisma.appSetting.findFirst({
          where: { group: "hr", key: "enabled", value: "true" },
        }),
      ),
    };
  }
  @AdminOnly() @Get(":id") detail(@Param("id", ParseIntPipe) id: number) {
    return this.prisma.user.findFirstOrThrow({
      where: { id, deletedAt: null },
      select,
    });
  }
  @AdminOnly() @Post() async create(@Body() dto: CreateUserDto) {
    if (
      await this.prisma.user.findUnique({ where: { username: dto.username } })
    )
      throw new ConflictException("Username sudah digunakan.");
    const { password, ...data } = dto;
    return this.prisma.user.create({
      data: { ...data, passwordHash: await argon2.hash(password) },
      select,
    });
  }
  @AdminOnly() @Patch(":id") async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    const { password, ...data } = dto;
    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(password ? { passwordHash: await argon2.hash(password) } : {}),
      },
      select,
    });
  }
  @AdminOnly() @Delete(":id") async remove(
    @Param("id", ParseIntPipe) id: number,
  ) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.webSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.mobileToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { deleted: true };
  }
  private validateGroup(dto: { name?: string; permissions?: string[] }) {
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException("Nama grup wajib diisi.");
    if (dto.permissions && dto.permissions.some((value) => !allowedPermissions.has(value as never))) throw new BadRequestException("Terdapat izin yang tidak dikenal.");
  }
  private async nextGroupCode(name: string) {
    const stem = name.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "group";
    const count = await this.prisma.permissionGroup.count({ where: { code: { startsWith: stem } } });
    return `${stem}-${String(count + 1).padStart(3, "0")}`;
  }
}
