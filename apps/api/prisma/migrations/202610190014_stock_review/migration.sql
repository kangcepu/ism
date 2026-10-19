CREATE TABLE "InventoryStockReview" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "snapshotQty" INTEGER NOT NULL,
    "snapshotLedgerId" BIGINT,
    "proposedQty" INTEGER NOT NULL,
    "recountQty" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "recountedBy" INTEGER,
    "approvedBy" INTEGER,
    "resultId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recountedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryStockReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryStockReview_code_key" ON "InventoryStockReview"("code");

CREATE UNIQUE INDEX "InventoryStockReview_resultId_key" ON "InventoryStockReview"("resultId");

CREATE INDEX "InventoryStockReview_itemId_binId_status_idx" ON "InventoryStockReview"("itemId", "binId", "status");

ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_values_check" CHECK ("kind" IN ('COUNT', 'ADJUSTMENT') AND "snapshotQty" >= 0 AND "proposedQty" >= 0 AND ("recountQty" IS NULL OR "recountQty" >= 0) AND "status" IN ('PENDING', 'RECOUNT_REQUIRED', 'POSTED', 'CANCELLED') AND (("status" = 'POSTED') = ("resultId" IS NOT NULL)));
