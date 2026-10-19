ALTER TABLE "InventoryReceipt" ADD COLUMN     "purchaseOrderId" INTEGER;

CREATE TABLE "InventoryPurchaseOrder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" INTEGER,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryPurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryPurchaseOrder_code_key" ON "InventoryPurchaseOrder"("code");

CREATE INDEX "InventoryPurchaseOrder_itemId_status_idx" ON "InventoryPurchaseOrder"("itemId", "status");

ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "InventoryPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryPurchaseOrder" ADD CONSTRAINT "InventoryPurchaseOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryPurchaseOrder" ADD CONSTRAINT "InventoryPurchaseOrder_values_check" CHECK ("quantity" > 0 AND "status" IN ('OPEN', 'CLOSED'));
