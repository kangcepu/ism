import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { map } from "rxjs/operators";
import { randomUUID } from "crypto";

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request & { requestId?: string }>();
    request.requestId ||= randomUUID();
    return next.handle().pipe(map((result) => {
      if (result?.__raw) return result.value;
      const pagination = result?.pagination;
      const rawData = pagination ? result.data : result;
      const serialized = JSON.stringify(rawData, (_, value) => typeof value === "bigint" ? value.toString() : value);
      const data = serialized === undefined ? null : JSON.parse(serialized);
      return { success: true, data, meta: { ...(pagination ? { pagination } : {}), requestId: request.requestId, timestamp: new Date().toISOString() } };
    }));
  }
}
