import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class PreventivePlanDto {
  @IsString() title!: string;
  @IsInt() @Min(1) areaId!: number;
  @IsString() standardWork!: string;
  @IsInt() @Min(1) weekNo!: number;
  @IsDateString() targetDate!: string;
  @IsOptional() @IsString() recurrence?: string | null;
  @IsInt() @Min(1) pic1Id!: number;
  @IsOptional() @IsInt() @Min(1) pic2Id?: number | null;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() toolsRequired?: string | null;
}

export class PreventiveResultDto {
  @IsString() result!: string;
  @IsString() beforePhoto!: string;
  @IsString() afterPhoto!: string;
}

export class ReworkDto {
  @IsString() reason!: string;
}
