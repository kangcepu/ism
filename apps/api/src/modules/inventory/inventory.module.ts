import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryDocumentsController } from "./inventory-documents.controller";
import { InventoryReviewsController } from "./inventory-reviews.controller";
@Module({
  controllers: [
    InventoryController,
    InventoryDocumentsController,
    InventoryReviewsController,
  ],
})
export class InventoryModule {}
