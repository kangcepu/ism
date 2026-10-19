CREATE TABLE "InventoryReservation" (
    "id" SERIAL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "requestedBy" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryReservation_quantity_check" CHECK ("quantity" > 0 AND "remaining" >= 0 AND "remaining" <= "quantity"),
    CONSTRAINT "InventoryReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryReservation_code_key" ON "InventoryReservation"("code");
CREATE INDEX "InventoryReservation_itemId_binId_status_idx" ON "InventoryReservation"("itemId", "binId", "status");
ALTER TABLE "InventoryLedger" ADD COLUMN "reservationId" INTEGER;
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
