import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "crypto";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { ADMIN_KEY, FLOOR_ACCESS_KEY, PUBLIC_KEY } from "./auth.decorators";
import type { RequestUser } from "./request-user";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const bearer =
      request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const raw = bearer || request.cookies?.ism_session;
    if (!raw) throw new UnauthorizedException("Sesi tidak tersedia.");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const authFilter = {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { deletedAt: null },
    };
    const record = bearer
      ? await this.prisma.mobileToken.findFirst({
          where: authFilter,
          include: { user: { include: { permissionGroup: true } } },
        })
      : await this.prisma.webSession.findFirst({
          where: authFilter,
          include: { user: { include: { permissionGroup: true } } },
        });
    if (!record)
      throw new UnauthorizedException("Sesi tidak valid atau kedaluwarsa.");
    request.user = {
      id: record.user.id,
      username: record.user.username,
      fullname: record.user.fullname,
      role: record.user.role,
      gaRole: record.user.gaRole,
      permissions:
        record.user.role === "admin"
          ? ["*"]
          : record.user.permissionGroup?.active
            ? record.user.permissionGroup.permissions
            : [],
      authSource: bearer ? "mobile" : "web",
    };
    const floorRequired = this.reflector.getAllAndOverride<"view" | "edit">(
      FLOOR_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const adminRequired = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = this.requiredPermission(request.path, request.method);
    if (
      record.user.role !== "admin" &&
      required === undefined &&
      !floorRequired &&
      !adminRequired
    )
      throw new ForbiddenException("Akses endpoint ini belum diberikan.");
    const roleAccess =
      !record.user.permissionGroupId &&
      ((required?.startsWith("ga.") && record.user.gaRole !== "none") ||
        (required?.startsWith("cctv.") &&
          (record.user.gaRole === "supervisor" ||
            (record.user.gaRole === "staff" && required === "cctv.read"))));
    if (
      required &&
      record.user.role !== "admin" &&
      !roleAccess &&
      !request.user.permissions.includes("*") &&
      !request.user.permissions.includes(required) &&
      !request.user.permissions.includes(`${required.split(".")[0]}.*`) &&
      !(
        required.endsWith(".read") &&
        request.user.permissions.includes(`${required.split(".")[0]}.manage`)
      )
    )
      throw new ForbiddenException(
        "Grup akses Anda tidak memiliki izin untuk modul ini.",
      );
    if (adminRequired && record.user.role !== "admin") {
      throw new ForbiddenException("Akses administrator diperlukan.");
    }
    if (floorRequired && record.user.role !== "admin") {
      const [direct, memberships] = await Promise.all([
        this.prisma.floorMapPermission.findUnique({
          where: { userId: record.user.id },
          select: { access: true },
        }),
        this.prisma.floorMapGroupMember.findMany({
          where: { userId: record.user.id },
          select: { group: { select: { access: true } } },
        }),
      ]);
      const rank = { none: 0, view: 1, edit: 2 };
      const effective = Math.max(
        rank[direct?.access || "none"],
        ...memberships.map((x) => rank[x.group.access]),
      );
      if (effective < rank[floorRequired])
        throw new ForbiddenException(
          "Anda tidak memiliki akses floor map yang diperlukan.",
        );
    }
    if (!bearer && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrf = request.headers["x-csrf-token"];
      const csrfHash = "csrfHash" in record ? record.csrfHash : undefined;
      if (
        typeof csrf !== "string" ||
        !csrfHash ||
        createHash("sha256").update(csrf).digest("hex") !== csrfHash
      )
        throw new ForbiddenException("Token CSRF tidak valid.");
    }
    return true;
  }
  private requiredPermission(path: string, method: string) {
    const segments = path.replace(/^\/api\/v1\//, "").split("/");
    const segment = segments[0] === "mobile" ? segments[1] : segments[0];
    if (["auth", "profile", "app-update"].includes(segment)) return null;
    if (segment === "hr") return "assets.manage";
    if (segment === "ai") return "ai.read";
    const module = {
      dashboard: "dashboard",
      assets: "assets",
      "asset-photos": "assets",
      "asset-audits": "assets",
      inventory: "inventory",
      categories: "master",
      "item-types": "master",
      locations: "master",
      "custom-fields": "master",
      monitors: "monitoring",
      monitoring: "monitoring",
      notifications: "monitoring",
      "switch-devices": "network",
      ga: "ga",
      cctv: "cctv",
      "ga-cctv": "cctv",
      reports: "reports",
      "it-support": "support",
      "it-support-reports": "support",
    }[segment];
    if (!module) return undefined;
    return `${module}.${["GET", "HEAD", "OPTIONS"].includes(method) ? "read" : "manage"}`;
  }
}
