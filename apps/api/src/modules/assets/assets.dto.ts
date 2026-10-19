import { Type } from "class-transformer";
import { AssetStatus, AssignmentSource, ConditionGrade } from "@prisma/client";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { PageQuery } from "../../common/dto";
export class AssetQuery extends PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() categoryId?: number;
  @IsOptional() @IsString() itemType?: string;
  @IsOptional() @Type(() => Number) @IsInt() locationId?: number;
  @IsOptional() @IsEnum(AssetStatus) status?: AssetStatus;
  @IsOptional() @Type(() => Number) @IsInt() assignedTo?: number;
}
export class CreateAssetDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name!: string;
  @Type(() => Number) @IsInt() @IsPositive() categoryId!: number;
  @Type(() => Number) @IsInt() @IsPositive() locationId!: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsEnum(ConditionGrade) condition?: ConditionGrade;
  @IsOptional() @IsObject() customData?: Record<string, string | null>;
}
export class UpdateAssetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsInt() categoryId?: number;
  @IsOptional() @Type(() => Number) @IsInt() locationId?: number;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() purchaseDate?: string | null;
  @IsOptional() @IsNumber() price?: number | null;
  @IsOptional() @IsEnum(ConditionGrade) condition?: ConditionGrade | null;
  @IsOptional() @IsObject() customData?: Record<string, string | null>;
}
export class AssignAssetDto {
  @IsEnum(AssignmentSource) source!: AssignmentSource;
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
  @IsOptional() @IsString() @MaxLength(190) assigneeName?: string;
  @IsOptional() @IsString() @MaxLength(64) assigneeCode?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() expectedReturnAt?: string;
}
export class TransitionDto {
  @IsEnum(AssetStatus) status!: AssetStatus;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
}
