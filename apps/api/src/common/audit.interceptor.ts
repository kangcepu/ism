import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { finalize } from "rxjs/operators";
import { PrismaService } from "../database/prisma.service";
import type { RequestUser } from "./request-user";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly db: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp(); const request = http.getRequest<Request & { user?: RequestUser }>(); const response = http.getResponse<Response>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next.handle();
    return next.handle().pipe(finalize(() => { const actor = request.user; const resourceId = request.params?.id; void this.db.auditLog.create({ data: { actorId: actor?.id, actorName: actor?.fullname, source: actor?.authSource || "public", action: request.method.toLowerCase(), resource: request.route?.path || request.path, resourceId: resourceId === undefined ? undefined : String(resourceId), method: request.method, route: request.originalUrl.split("?")[0], statusCode: response.statusCode, ip: request.ip, userAgent: request.headers["user-agent"] } }).catch(() => undefined); }));
  }
}
