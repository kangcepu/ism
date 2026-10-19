import {
  FloorBackgroundsController,
  FloorIconsController,
} from "./floor-backgrounds.controller";
import { AddsController } from "./adds.controller";
import { ZeroTierController } from "./zerotier.controller";
import { Module } from "@nestjs/common";
import { AssetSyncController } from "./integrations.controller";
import {
  FloorMapController,
  MapAssetsController,
  MobileFloorMapController,
} from "./floor-map.controller";
import { BrandingController, SettingsController } from "./settings.controller";
import {
  AiController,
  AppUpdateController,
  AuditController,
  PublicReleasesController,
  ReleasesController,
} from "./system.controller";
import {
  MarkerActionsController,
  SwitchRemoteController,
  UnifiController,
} from "./live-integrations.controller";
@Module({
  controllers: [
    SettingsController,
    BrandingController,
    AddsController,
    ZeroTierController,
    AssetSyncController,
    FloorMapController,
    FloorBackgroundsController,
    FloorIconsController,
    MapAssetsController,
    MobileFloorMapController,
    AuditController,
    ReleasesController,
    PublicReleasesController,
    AppUpdateController,
    AiController,
    UnifiController,
    MarkerActionsController,
    SwitchRemoteController,
  ],
})
export class PlatformModule {}
