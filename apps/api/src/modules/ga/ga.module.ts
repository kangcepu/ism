import { Module } from "@nestjs/common";
import { GaAreasController } from "./ga.controller";
import { GaOperationsController } from "./ga-operations.controller";
import { GaPreventiveController } from "./ga-preventive.controller";
import { GaCctvOfflineController } from "./ga-cctv.controller";
import { GaControlController } from "./ga-control.controller";
@Module({
  controllers: [
    GaAreasController,
    GaOperationsController,
    GaPreventiveController,
  ],
})
export class GaModule {}
