import { Type } from "class-transformer";
import { FloorAccess } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";
export class IntegrationDto { @IsString() name!: string; @IsOptional() @IsString() externalId?: string; @IsObject() config!: Record<string, unknown>; @IsOptional() @IsString() secret?: string; @IsOptional() @IsBoolean() active?: boolean; }
export class FloorStateDto { @IsObject() state!: Record<string, unknown>; }
export class AreaDto { @IsString() name!: string; @IsString() slug!: string; @IsOptional() @IsString() description?: string; @Type(() => Number) @IsInt() @Min(400) @Max(10000) canvasWidth!: number; @Type(() => Number) @IsInt() @Min(300) @Max(10000) canvasHeight!: number; @IsObject() state!: Record<string, unknown>; @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number; }
export class PositionDto { @Type(() => Number) @Min(0) @Max(100) x!: number; @Type(() => Number) @Min(0) @Max(100) y!: number; }
export class RoomDto extends PositionDto { @IsString() name!: string; }
export class PermissionDto { @Type(() => Number) @IsInt() userId!: number; @IsEnum(FloorAccess) access!: FloorAccess; }
