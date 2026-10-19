import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { GaRole, Role } from "@prisma/client";
export class CreateUserDto {
  @IsString() username!: string;
  @IsString() fullname!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsEnum(GaRole) gaRole?: GaRole;
  @IsOptional() permissionGroupId?: number | null;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() division?: string;
  @IsOptional() @IsString() company?: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() fullname?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(GaRole) gaRole?: GaRole;
  @IsOptional() permissionGroupId?: number | null;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() division?: string;
  @IsOptional() @IsString() company?: string;
}
