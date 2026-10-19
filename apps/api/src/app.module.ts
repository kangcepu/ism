import { CctvModule } from "./modules/cctv/cctv.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { CommonModule } from "./common/common.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { JobsService } from "./jobs.service";
import { AuthModule } from "./modules/auth/auth.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { MasterModule } from "./modules/master/master.module";
import { OperationsModule } from "./modules/operations/operations.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { HrDirectoryModule } from "./modules/hr-directory/hr-directory.module";
import { UsersModule } from "./modules/users/users.module";
import { GaModule } from "./modules/ga/ga.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { validateEnvironment } from "./config/env";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env.local", "../../.env", ".env"],
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    AuthModule,
    HrDirectoryModule,
    UsersModule,
    GaModule,
    InventoryModule,
    CctvModule,
    MasterModule,
    AssetsModule,
    OperationsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [JobsService],
})
export class AppModule {}
