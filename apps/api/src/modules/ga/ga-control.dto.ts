import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
export class AngleDto {
  @IsOptional() @IsInt() @Min(1) cameraAssetId?: number;
  @IsString() cameraName!: string;
  @IsOptional() @IsInt() @Min(1) areaId?: number;
  @IsOptional() @IsString() plannedViewReference?: string;
  @IsOptional() @IsString() actualViewPhoto?: string;
  @IsOptional() @IsString() coverage?: string;
  @IsOptional() @IsString() gapDescription?: string;
}
export class ReconciliationDto {
  @IsString() ticketNumber!: string;
  @IsDateString() securityTime!: string;
  @IsDateString() cctvTime!: string;
  @IsString() cameraName!: string;
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsString() vehicleType?: string;
  @IsOptional() @IsString() goodsType?: string;
  @IsOptional() @IsString() discrepancyReason?: string;
}
export class FindingDto {
  @IsString() title!: string;
  @IsString() description!: string;
  @IsString() source!: string;
  @IsOptional() @IsInt() @Min(1) areaId?: number;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsInt() @Min(1) assigneeId?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() containment?: string;
  @IsOptional() @IsString() rootCause?: string;
  @IsOptional() @IsString() correctiveAction?: string;
  @IsOptional() @IsString() evidence?: string;
}
