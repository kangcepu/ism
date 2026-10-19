import { Module } from "@nestjs/common";
import { HrDirectoryController } from "./hr-directory.controller";
import { HrDirectoryService } from "./hr-directory.service";

@Module({
  controllers: [HrDirectoryController],
  providers: [HrDirectoryService],
  exports: [HrDirectoryService],
})
export class HrDirectoryModule {}
