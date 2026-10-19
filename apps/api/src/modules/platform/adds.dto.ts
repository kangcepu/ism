import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class DirectoryObjectDto {
  @IsString() @Length(1, 512) parentDn!: string;
  @IsString() @Length(1, 64) name!: string;
}
export class DirectoryUserDto {
  @IsString() @Length(1, 512) parentDn!: string;
  @IsString() @Length(1, 128) displayName!: string;
  @IsString() @Length(1, 20) @Matches(/^[A-Za-z0-9._-]+$/) username!: string;
  @IsString() @Length(8, 256) password!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}
export class DirectoryStatusDto {
  @IsString() @Length(1, 512) userDn!: string;
  @IsBoolean() enabled!: boolean;
}
export class DirectoryPasswordDto {
  @IsString() @Length(1, 512) userDn!: string;
  @IsString() @Length(8, 256) password!: string;
}
export class DirectoryMemberDto {
  @IsString() @Length(1, 512) groupDn!: string;
  @IsString() @Length(1, 512) memberDn!: string;
}
