import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from "class-validator";
import { ReportStatus } from "@prisma/client";
import { PageQuery } from "../../common/dto";
export class MonitorDto {
  @IsString() name!: string;
  @IsString() deviceType!: string;
  @IsString() host!: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(250)
  @Max(30000)
  timeoutMs?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(65535, { each: true })
  customPorts?: number[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() snmpEnabled?: boolean;
  @IsOptional() @IsString() snmpVersion?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  snmpPort?: number;
  @IsOptional() @IsString() snmpCommunity?: string;
  @IsOptional() @IsBoolean() httpEnabled?: boolean;
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  httpUrl?: string;
}
export class ReportQuery extends PageQuery {
  @IsOptional() @IsEnum(ReportStatus) status?: ReportStatus;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional()
  @IsIn(["date", "reporter", "department", "location", "category", "status"])
  sort?:
    "date" | "reporter" | "department" | "location" | "category" | "status";
  @IsOptional() @IsIn(["asc", "desc"]) direction?: "asc" | "desc";
}
export class ReportDto {
  @IsDateString() date!: string;
  @IsString() reporter!: string;
  @IsString() department!: string;
  @IsString() location!: string;
  @IsString() category!: string;
  @IsString() analysis!: string;
  @IsOptional() @IsString() resolution?: string;
  @IsEnum(ReportStatus) status!: ReportStatus;
}
export class SettingsDto {
  @IsObject() settings!: Record<
    string,
    Record<string, string | number | boolean | null>
  >;
  @IsOptional() @IsArray() @IsString({ each: true }) clearSecrets?: string[];
}
