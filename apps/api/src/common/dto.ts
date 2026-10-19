import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage = 25;
  @IsOptional() @IsString() q?: string;
}
export const pageMeta = (page: number, perPage: number, total: number) => ({ page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) });
