import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CctvOfflineDto {
  @IsOptional() @IsInt() @Min(1) cameraAssetId?: number | null;
  @IsString() cameraName!: string;
  @IsOptional() @IsInt() @Min(1) areaId?: number | null;
  @IsDateString() detectedAt!: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() screenshot?: string | null;
  @IsOptional() @IsString() reason?: string | null;
}
