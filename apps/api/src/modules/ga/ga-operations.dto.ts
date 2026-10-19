import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CleaningDto {
  @IsInt() @Min(1) areaId!: number;
  @IsDateString() workDate!: string;
  @IsOptional() @IsInt() @Min(1) assigneeId?: number | null;
  @IsOptional() @IsString() note?: string | null;
  @IsArray() @IsString({ each: true }) tasks!: string[];
}

export class CleaningLineDto {
  @IsBoolean() completed!: boolean;
  @IsOptional() @IsString() note?: string | null;
}

export class OutdoorDto {
  @IsInt() @Min(1) areaId!: number;
  @IsDateString() inspectedAt!: string;
  @IsOptional() @IsInt() @Min(1) inspectorId?: number | null;
  @IsString() plantCondition!: string;
  @IsString() drainCondition!: string;
  @IsString() cleanliness!: string;
  @IsOptional() @IsString() action?: string | null;
}
