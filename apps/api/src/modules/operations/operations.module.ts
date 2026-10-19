import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import {
  MobileMonitoringController,
  MonitoringController,
} from "./monitoring.controller";
import { SupportReportsController } from "./reports.controller";
import { InventoryReportsController } from "./inventory-reports.controller";
import { NotificationsController } from "./notifications.controller";
import { MonitoringPollerService } from "./monitoring-poller.service";
@Module({
  providers: [MonitoringPollerService],
  controllers: [
    DashboardController,
    MonitoringController,
    MobileMonitoringController,
    SupportReportsController,
    InventoryReportsController,
    NotificationsController,
  ],
})
export class OperationsModule {}
