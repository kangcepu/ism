import { AssetAuditsController } from "./asset-audits.controller";
import { Module } from "@nestjs/common";
import { AssetsController, MobileAssetsController } from "./assets.controller";
import { HrDirectoryModule } from "../hr-directory/hr-directory.module";
import { AssetsService } from "./assets.service";
import { PhotosController } from "./photos.controller";
@Module({
  imports: [HrDirectoryModule],
  controllers: [
    AssetAuditsController,
    AssetsController,
    MobileAssetsController,
    PhotosController,
  ],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
