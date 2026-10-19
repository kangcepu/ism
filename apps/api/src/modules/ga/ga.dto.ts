import { GaAreaStatus, GaAreaType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class GaAreaDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name!: string;
  @IsEnum(GaAreaType) type!: GaAreaType;
  @IsOptional() @IsEnum(GaAreaStatus) status?: GaAreaStatus;
  @IsOptional() @IsInt() @Min(1) parentId?: number | null;
  @IsOptional() @IsString() company?: string | null;
  @IsOptional() @IsString() site?: string | null;
  @IsOptional() @IsString() building?: string | null;
  @IsOptional() @IsString() floor?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(99) floorPage?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) x?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(100) y?: number | null;
  @IsOptional() @IsString() qrCode?: string | null;
  @IsOptional() @IsInt() @Min(1) ownerGaId?: number | null;
  @IsOptional() @IsInt() @Min(1) cameraAssetId?: number | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
