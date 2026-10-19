import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@prisma/client";
import * as argon2 from "argon2";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../database/prisma.service";
import { CryptoService } from "../../common/crypto.service";
import type { ChangePasswordDto, LoginDto } from "./auth.dto";

const publicUser = (user: User) => ({
  id: user.id,
  username: user.username,
  fullname: user.fullname,
  email: user.email,
  phone: user.phone,
  division: user.division,
  company: user.company,
  avatarUrl: user.avatarPath ? `/api/v1/profile/avatar` : null,
  role: user.role,
  gaRole: user.gaRole,
});
async function verifyPassword(hash: string, password: string) {
  if (/^\$2[aby]\$/.test(hash))
    return bcrypt
      .compare(password, hash.replace(/^\$2y\$/, "$2b$"))
      .catch(() => false);
  return argon2.verify(hash, password).catch(() => false);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}
  async verify(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, deletedAt: null },
    });
    if (!user || !(await verifyPassword(user.passwordHash, dto.password)))
      throw new UnauthorizedException("Username atau password tidak valid.");
    if (/^\$2[aby]\$/.test(user.passwordHash)) {
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      await this.prisma.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
    }
    return user;
  }
  async webLogin(dto: LoginDto) {
    const user = await this.verify(dto);
    const token = this.crypto.token();
    const csrf = this.crypto.token(24);
    const days = Math.max(1, Number(process.env.WEB_SESSION_DAYS || 7));
    await this.prisma.$transaction([
      this.prisma.webSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.webSession.create({
        data: {
          userId: user.id,
          tokenHash: this.crypto.hash(token),
          csrfHash: this.crypto.hash(csrf),
          expiresAt: new Date(Date.now() + days * 86400000),
        },
      }),
    ]);
    return { user: publicUser(user), token, csrf, maxAge: days * 86400000 };
  }
  async mobileLogin(dto: LoginDto) {
    const user = await this.verify(dto);
    const token = this.crypto.token();
    const days = Math.min(
      90,
      Math.max(1, Number(process.env.MOBILE_TOKEN_DAYS || 30)),
    );
    await this.prisma.mobileToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hash(token),
        deviceName: dto.deviceName || "Unknown device",
        expiresAt: new Date(Date.now() + days * 86400000),
      },
    });
    return {
      token,
      tokenType: "Bearer",
      expiresIn: days * 86400,
      user: publicUser(user),
    };
  }
  async me(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return publicUser(user);
  }
  async logout(rawToken: string | undefined, mobile: boolean) {
    if (!rawToken) return { loggedOut: true };
    const tokenHash = this.crypto.hash(rawToken);
    if (mobile)
      await this.prisma.mobileToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    else
      await this.prisma.webSession.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    return { loggedOut: true };
  }
  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    keepMobileTokenHash?: string,
  ) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException("Konfirmasi password tidak cocok.");
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword)))
      throw new BadRequestException("Password saat ini salah.");
    const hash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash },
      });
      await tx.webSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.mobileToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(keepMobileTokenHash
            ? { tokenHash: { not: keepMobileTokenHash } }
            : {}),
        },
        data: { revokedAt: new Date() },
      });
    });
    return { changed: true };
  }
}
