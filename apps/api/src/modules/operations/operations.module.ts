import { Module } from "@nestjs/common";
import { GaTicketsController } from "./ga-tickets.controller";
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
    GaTicketsController,
    InventoryReportsController,
    NotificationsController,
  ],
})
export class OperationsModule {}
