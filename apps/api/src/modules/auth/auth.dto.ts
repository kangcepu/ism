import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() deviceName?: string;
}
export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
  @IsString() confirmPassword!: string;
}
