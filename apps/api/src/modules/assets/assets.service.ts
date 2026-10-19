import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AssetStatus, Prisma } from "@prisma/client";
import type { RequestUser } from "../../common/request-user";
import { pageMeta } from "../../common/dto";
import { PrismaService } from "../../database/prisma.service";
import { HrDirectoryService } from "../hr-directory/hr-directory.service";
import type {
  AssetQuery,
  AssignAssetDto,
  CreateAssetDto,
  TransitionDto,
  UpdateAssetDto,
} from "./assets.dto";

const include = {
  category: true,
  location: true,
  customData: true,
  photos: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
  },
} as const;
@Injectable()
export class AssetsService {
  constructor(
    private readonly db: PrismaService,
    private readonly directory: HrDirectoryService,
  ) {}
  async list(q: AssetQuery) {
    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.assignedTo ? { assignedUserId: q.assignedTo } : {}),
      ...(q.itemType ? { category: { itemType: q.itemType } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: "insensitive" } },
              { code: { contains: q.q, mode: "insensitive" } },
              { serialNumber: { contains: q.q, mode: "insensitive" } },
              { assigneeName: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.asset.findMany({
        where,
        include,
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        orderBy: { updatedAt: "desc" },
      }),
      this.db.asset.count({ where }),
    ]);
    return { data, pagination: pageMeta(q.page, q.perPage, total) };
  }
  detail(id: number) {
    return this.db.asset.findFirstOrThrow({
      where: { id, deletedAt: null },
      include,
    });
  }
  async create(dto: CreateAssetDto, actor: RequestUser) {
    const { customData, purchaseDate, code: _code, ...data } = dto;
    return this.db.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const sequence = await tx.codeSequence.upsert({
        where: { scope: `asset-${year}` },
        create: { scope: `asset-${year}`, value: 1 },
        update: { value: { increment: 1 } },
      });
      const code = `AST-${year}-${String(sequence.value).padStart(6, "0")}`;
      const asset = await tx.asset.create({
        data: {
          ...data,
          code,
          ...(purchaseDate ? { purchaseDate: new Date(purchaseDate) } : {}),
        },
      });
      if (customData)
        await tx.assetCustomData.createMany({
          data: Object.entries(customData).map(([fieldName, value]) => ({
            assetId: asset.id,
            fieldName,
            value,
          })),
        });
      await tx.assetHistory.create({
        data: {
          assetId: asset.id,
          eventType: "create",
          actorId: actor.id,
          statusTo: asset.status,
        },
      });
      return tx.asset.findUniqueOrThrow({ where: { id: asset.id }, include });
    });
  }
  async update(id: number, dto: UpdateAssetDto, actor: RequestUser) {
    const { customData, purchaseDate, ...data } = dto;
    return this.db.$transaction(async (tx) => {
      const asset = await tx.asset.update({
        where: { id },
        data: {
          ...data,
          ...(purchaseDate !== undefined
            ? { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }
            : {}),
        },
      });
      for (const [fieldName, value] of Object.entries(customData || {}))
        await tx.assetCustomData.upsert({
          where: { assetId_fieldName: { assetId: id, fieldName } },
          create: { assetId: id, fieldName, value },
          update: { value },
        });
      await tx.assetHistory.create({
        data: { assetId: id, eventType: "update", actorId: actor.id },
      });
      return asset;
    });
  }
  async remove(id: number, actor: RequestUser) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id } });
      await tx.asset.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.assetHistory.create({
        data: {
          assetId: id,
          eventType: "delete",
          actorId: actor.id,
          statusFrom: current.status,
        },
      });
      return { deleted: true };
    });
  }
  async assign(id: number, dto: AssignAssetDto, actor: RequestUser) {
    let hrName = dto.assigneeName?.trim() || "";
    let hrCode = dto.assigneeCode?.trim() || "";
    let hrCompany = dto.company?.trim() || "";
    if (dto.source === "hr") {
      if (!hrName) throw new BadRequestException("Nama penerima wajib diisi.");
      try {
        const result = await this.directory.search(hrCode || hrName, 100, true);
        if (result.enabled && !result.stale) {
          const equal = (left: string, right: string) =>
            left.trim().toLocaleLowerCase() ===
            right.trim().toLocaleLowerCase();
          let matches = result.employees.filter((employee) =>
            hrCode
              ? equal(employee.employeeCode, hrCode)
              : equal(employee.fullname, hrName),
          );
          if (hrCompany && matches.length > 1)
            matches = matches.filter((employee) =>
              equal(employee.company, hrCompany),
            );
          if (matches.length > 1)
            matches = matches.filter((employee) =>
              equal(employee.fullname, hrName),
            );
          if (matches.length === 1) {
            hrName = matches[0].fullname;
            hrCode = matches[0].employeeCode;
            hrCompany = matches[0].company;
          } else if (!result.partial) {
            throw new BadRequestException(
              matches.length
                ? "Karyawan tidak unik. Pilih karyawan dengan kode dan company yang sesuai."
                : "Karyawan tidak ditemukan di HR Directory.",
            );
          }
        }
      } catch (error) {
        if (!(error instanceof ServiceUnavailableException)) throw error;
      }
    }
    return this.db.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id } });
      if (
        current.status !== AssetStatus.available &&
        current.status !== AssetStatus.in_use
      )
        throw new BadRequestException(
          "Aset harus tersedia atau sedang digunakan sebelum assignment.",
        );
      let name = hrName;
      let code = hrCode;
      if (dto.source === "local") {
        if (!dto.userId)
          throw new BadRequestException("User tujuan wajib dipilih.");
        const user = await tx.user.findFirstOrThrow({
          where: { id: dto.userId, deletedAt: null },
        });
        name = user.fullname;
        code = user.username;
      }
      if (!name) throw new BadRequestException("Nama penerima wajib diisi.");
      const eventType =
        current.assigneeName && current.assigneeName !== name
          ? "transfer"
          : "assign";
      const asset = await tx.asset.update({
        where: { id },
        data: {
          status: "in_use",
          assignedSource: dto.source,
          assignedUserId: dto.source === "local" ? dto.userId : null,
          assigneeName: name,
          assigneeCode: code,
          assigneeCompany: dto.source === "hr" ? hrCompany : dto.company,
          assignedAt: new Date(),
          assignedById: actor.id,
          assignmentNote: dto.note,
          expectedReturnAt: dto.expectedReturnAt
            ? new Date(dto.expectedReturnAt)
            : null,
        },
      });
      await tx.assetHistory.create({
        data: {
          assetId: id,
          eventType,
          actorId: actor.id,
          statusFrom: current.status,
          statusTo: "in_use",
          assigneeSnapshot: {
            source: dto.source,
            name,
            code,
            company: dto.source === "hr" ? hrCompany : dto.company,
          },
          note: dto.note,
        },
      });
      return asset;
    });
  }
  async checkIn(id: number, actor: RequestUser) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id } });
      if (!current.assigneeName || current.status !== AssetStatus.in_use)
        throw new BadRequestException(
          "Aset tidak sedang digunakan oleh penerima.",
        );
      const asset = await tx.asset.update({
        where: { id },
        data: {
          status: "available",
          assignedSource: null,
          assignedUserId: null,
          assigneeName: null,
          assigneeCode: null,
          assigneeCompany: null,
          assignedAt: null,
          assignedById: null,
          assignmentNote: null,
          expectedReturnAt: null,
        },
      });
      await tx.assetHistory.create({
        data: {
          assetId: id,
          eventType: "check_in",
          actorId: actor.id,
          statusFrom: current.status,
          statusTo: "available",
          assigneeSnapshot: {
            name: current.assigneeName,
            code: current.assigneeCode,
          },
        },
      });
      return asset;
    });
  }
  async transition(id: number, dto: TransitionDto, actor: RequestUser) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.asset.findUniqueOrThrow({ where: { id } });
      const allowed: Record<AssetStatus, AssetStatus[]> = {
        available: [AssetStatus.maintenance, AssetStatus.retired],
        in_use: [AssetStatus.maintenance, AssetStatus.retired],
        maintenance: [
          AssetStatus.available,
          AssetStatus.in_use,
          AssetStatus.retired,
        ],
        retired: [AssetStatus.disposed],
        disposed: [],
      };
      if (!allowed[current.status].includes(dto.status))
        throw new BadRequestException("Perubahan status aset tidak valid.");
      if (dto.status === "in_use" && !current.assigneeName)
        throw new BadRequestException("Status in_use membutuhkan assignee.");
      if (
        dto.status === AssetStatus.retired ||
        dto.status === AssetStatus.disposed
      ) {
        if (actor.role !== "admin")
          throw new ForbiddenException(
            "Retirement dan disposal memerlukan administrator.",
          );
        if (!dto.reason?.trim())
          throw new BadRequestException(
            "Alasan retirement atau disposal wajib diisi.",
          );
      }
      const clear =
        dto.status === AssetStatus.available ||
        dto.status === AssetStatus.retired ||
        dto.status === AssetStatus.disposed;
      const retired =
        dto.status === AssetStatus.retired ||
        dto.status === AssetStatus.disposed;
      const asset = await tx.asset.update({
        where: { id },
        data: {
          status: dto.status,
          ...(clear
            ? {
                assignedSource: null,
                assignedUserId: null,
                assigneeName: null,
                assigneeCode: null,
                assigneeCompany: null,
                assignedAt: null,
                assignmentNote: null,
                expectedReturnAt: null,
              }
            : {}),
          retiredAt: retired ? new Date() : null,
          retiredReason: retired ? dto.reason : null,
        },
      });
      await tx.assetHistory.create({
        data: {
          assetId: id,
          eventType: "status_transition",
          actorId: actor.id,
          statusFrom: current.status,
          statusTo: dto.status,
          note: dto.note || dto.reason,
        },
      });
      return asset;
    });
  }
}
