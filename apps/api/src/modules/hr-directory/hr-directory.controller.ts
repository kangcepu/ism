import { Controller, Get, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { AdminOnly } from "../../common/auth.decorators";
import { HrDirectoryService } from "./hr-directory.service";

class EmployeeQuery {
  @IsOptional() @IsString() @MaxLength(100) q = "";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
@Controller("hr")
export class HrDirectoryController {
  constructor(private readonly directory: HrDirectoryService) {}
  @Get("employees") employees(@Query() query: EmployeeQuery) {
    return this.directory.search(query.q, query.limit);
  }
  @AdminOnly() @Get("test") async test(@Query() query: EmployeeQuery) {
    const result = await this.directory.search(
      query.q || "a",
      query.limit,
      true,
    );
    return {
      enabled: result.enabled,
      reachable: result.enabled && !result.stale,
      partial: result.partial,
      matched: result.employees.length,
    };
  }
}
