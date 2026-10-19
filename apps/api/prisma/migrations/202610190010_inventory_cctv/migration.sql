ALTER TABLE "InventoryItem" ADD COLUMN     "assetId" INTEGER;

ALTER TABLE "InventoryLedger" ADD COLUMN     "holdDelta" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservedDelta" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CctvRecorder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "address" TEXT,
    "monitorId" INTEGER,
    "capacityGb" DOUBLE PRECISION,
    "freeGb" DOUBLE PRECISION,
    "targetRetentionDays" INTEGER,
    "actualRetentionDays" INTEGER,
    "lastRecordingAt" TIMESTAMP(3),
    "storageCheckedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctvRecorder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CctvCamera" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "zone" TEXT,
    "assetId" INTEGER,
    "recorderId" INTEGER,
    "monitorId" INTEGER,
    "channel" INTEGER,
    "serial" TEXT,
    "address" TEXT,
    "coverageArea" TEXT,
    "floorPage" INTEGER,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION,
    "fieldOfView" DOUBLE PRECISION,
    "retentionDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CctvCamera_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CctvMaintenance" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "cameraId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "result" TEXT,
    "ticketReference" TEXT,
    "createdById" INTEGER NOT NULL,
    "completedById" INTEGER,
    "verifiedById" INTEGER,
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CctvMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CctvVerification" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "cameraId" INTEGER NOT NULL,
    "actualLocation" TEXT NOT NULL,
    "serialMatch" BOOLEAN NOT NULL,
    "channelMatch" BOOLEAN NOT NULL,
    "installed" BOOLEAN NOT NULL,
    "note" TEXT,
    "verifiedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CctvVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetAuditSession" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AssetAuditSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssetAuditEntry" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "expectedLocation" TEXT NOT NULL,
    "actualLocation" TEXT NOT NULL,
    "expectedSerial" TEXT,
    "actualSerial" TEXT,
    "found" BOOLEAN NOT NULL,
    "condition" TEXT,
    "note" TEXT,
    "countedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CctvRecorder_code_key" ON "CctvRecorder"("code");

CREATE UNIQUE INDEX "CctvCamera_code_key" ON "CctvCamera"("code");

CREATE UNIQUE INDEX "CctvCamera_assetId_key" ON "CctvCamera"("assetId");

CREATE UNIQUE INDEX "CctvCamera_recorderId_channel_key" ON "CctvCamera"("recorderId", "channel");

CREATE UNIQUE INDEX "CctvMaintenance_code_key" ON "CctvMaintenance"("code");

CREATE UNIQUE INDEX "CctvVerification_code_key" ON "CctvVerification"("code");

CREATE UNIQUE INDEX "AssetAuditSession_code_key" ON "AssetAuditSession"("code");

CREATE UNIQUE INDEX "AssetAuditEntry_sessionId_assetId_key" ON "AssetAuditEntry"("sessionId", "assetId");

CREATE UNIQUE INDEX "InventoryItem_assetId_key" ON "InventoryItem"("assetId");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CctvRecorder" ADD CONSTRAINT "CctvRecorder_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "CctvRecorder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CctvMaintenance" ADD CONSTRAINT "CctvMaintenance_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CctvVerification" ADD CONSTRAINT "CctvVerification_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssetAuditEntry" ADD CONSTRAINT "AssetAuditEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssetAuditSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssetAuditEntry" ADD CONSTRAINT "AssetAuditEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "InventoryLedger" SET "legacy" = true;

INSERT INTO "InventoryLedger" ("reference", "itemId", "binId", "type", "qty", "reservedDelta", "holdDelta", "legacy", "actorId", "note")
SELECT 'BASELINE-' || id::text, "itemId", "binId", 'ADJUSTMENT', "onHand", "reserved", "hold", false, 0, 'Saldo awal saat pembaruan ledger'
FROM "InventoryBalance";

ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_valid_balance" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "hold" >= 0 AND "onHand" >= "reserved" + "hold");

CREATE FUNCTION "reject_inventory_ledger_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory ledger entries cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_ledger_immutable" BEFORE UPDATE OR DELETE ON "InventoryLedger" FOR EACH ROW EXECUTE FUNCTION "reject_inventory_ledger_change"();
