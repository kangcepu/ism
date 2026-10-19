import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Actor, Public } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { CryptoService } from "../../common/crypto.service";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto } from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post("login") async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.webLogin(dto);
    const secure = process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
    response.cookie("ism_session", result.token, { httpOnly: true, sameSite: "lax", secure, maxAge: result.maxAge, path: "/" });
    response.cookie("ism_csrf", result.csrf, { httpOnly: false, sameSite: "strict", secure, maxAge: result.maxAge, path: "/" });
    return { user: result.user, csrfToken: result.csrf };
  }
  @Get("me") me(@Actor() actor: RequestUser) { return this.auth.me(actor.id); }
  @Post("logout") async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { response.clearCookie("ism_session", { path: "/" }); response.clearCookie("ism_csrf", { path: "/" }); return this.auth.logout(request.cookies?.ism_session, false); }
  @Post("change-password") change(@Actor() actor: RequestUser, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(actor.id, dto); }
}

@Controller("mobile/auth")
export class MobileAuthController {
  constructor(private readonly auth: AuthService, private readonly crypto: CryptoService) {}
  @Public() @Post("login") login(@Body() dto: LoginDto) { return this.auth.mobileLogin(dto); }
  @Get("me") me(@Actor() actor: RequestUser) { return this.auth.me(actor.id); }
  @Post("logout") logout(@Req() request: Request) { return this.auth.logout(request.headers.authorization?.replace(/^Bearer\s+/i, ""), true); }
  @Post("change-password") change(@Actor() actor: RequestUser, @Req() request: Request, @Body() dto: ChangePasswordDto) { const token = request.headers.authorization?.replace(/^Bearer\s+/i, ""); return this.auth.changePassword(actor.id, dto, token ? this.crypto.hash(token) : undefined); }
}
