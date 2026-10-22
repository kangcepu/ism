import { Module } from "@nestjs/common";
import { CctvController } from "./cctv.controller";
import { CctvEvidenceController } from "./cctv-evidence.controller";
import { CctvLiveController, CctvLiveService } from "./cctv-live.controller";
@Module({
  controllers: [CctvController, CctvEvidenceController, CctvLiveController],
  providers: [CctvLiveService],
  exports: [CctvLiveService],
})
export class CctvModule {}
