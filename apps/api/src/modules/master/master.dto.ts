import { IsBoolean, IsOptional, IsString } from "class-validator";
export class CategoryDto { @IsString() name!: string; @IsOptional() @IsString() description?: string; @IsString() itemType!: string; }
export class LocationDto { @IsString() name!: string; @IsOptional() @IsString() description?: string; }
export class CustomFieldDto { @IsString() fieldName!: string; @IsString() fieldLabel!: string; @IsString() fieldType!: string; @IsOptional() @IsBoolean() isRequired?: boolean; }
