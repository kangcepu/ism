import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "./request-user";

export const PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const ADMIN_KEY = "adminOnly";
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);
export const FLOOR_ACCESS_KEY = "floorAccess";
export const FloorView = () => SetMetadata(FLOOR_ACCESS_KEY, "view");
export const FloorEdit = () => SetMetadata(FLOOR_ACCESS_KEY, "edit");
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>().user,
);
