import { Module } from "@nestjs/common";
import { AuthController, MobileAuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ProfileController } from "./profile.controller";

@Module({ controllers: [AuthController, MobileAuthController, ProfileController], providers: [AuthService] })
export class AuthModule {}
