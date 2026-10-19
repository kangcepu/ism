ALTER TYPE "InventoryLedgerType" ADD VALUE 'HOLD_RELEASE';

CREATE TABLE "InventoryReturn" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "issueId" BIGINT NOT NULL,
    "resultId" BIGINT,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryReceipt" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "accepted" INTEGER,
    "held" INTEGER,
    "rejected" INTEGER,
    "poReference" TEXT,
    "note" TEXT,
    "qcNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" INTEGER NOT NULL,
    "checkedBy" INTEGER,
    "postedBy" INTEGER,
    "resultId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryHoldRelease" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "sourceId" BIGINT NOT NULL,
    "resultId" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHoldRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryPurchaseProposal" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "available" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requestedBy" INTEGER NOT NULL,
    "approvedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "closedBy" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,

    CONSTRAINT "InventoryPurchaseProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CctvEvidence" (
    "id" SERIAL NOT NULL,
    "cameraId" INTEGER NOT NULL,
    "maintenanceId" INTEGER,
    "verificationId" INTEGER,
    "internalName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CctvEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryReturn_code_key" ON "InventoryReturn"("code");

CREATE UNIQUE INDEX "InventoryReturn_resultId_key" ON "InventoryReturn"("resultId");

CREATE INDEX "InventoryReturn_issueId_status_idx" ON "InventoryReturn"("issueId", "status");

CREATE UNIQUE INDEX "InventoryReceipt_code_key" ON "InventoryReceipt"("code");

CREATE UNIQUE INDEX "InventoryReceipt_resultId_key" ON "InventoryReceipt"("resultId");

CREATE INDEX "InventoryReceipt_itemId_status_idx" ON "InventoryReceipt"("itemId", "status");

CREATE UNIQUE INDEX "InventoryHoldRelease_code_key" ON "InventoryHoldRelease"("code");

CREATE UNIQUE INDEX "InventoryHoldRelease_resultId_key" ON "InventoryHoldRelease"("resultId");

CREATE INDEX "InventoryHoldRelease_sourceId_idx" ON "InventoryHoldRelease"("sourceId");

CREATE UNIQUE INDEX "InventoryPurchaseProposal_code_key" ON "InventoryPurchaseProposal"("code");

CREATE INDEX "InventoryPurchaseProposal_itemId_status_idx" ON "InventoryPurchaseProposal"("itemId", "status");

CREATE UNIQUE INDEX "CctvEvidence_internalName_key" ON "CctvEvidence"("internalName");

CREATE INDEX "CctvEvidence_cameraId_createdAt_idx" ON "CctvEvidence"("cameraId", "createdAt");

ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryHoldRelease" ADD CONSTRAINT "InventoryHoldRelease_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryHoldRelease" ADD CONSTRAINT "InventoryHoldRelease_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryPurchaseProposal" ADD CONSTRAINT "InventoryPurchaseProposal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "CctvMaintenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "CctvVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_values_check" CHECK ("quantity" > 0 AND "disposition" IN ('RESTOCK', 'HOLD') AND "status" IN ('REQUESTED', 'POSTED', 'CANCELLED') AND (("status" = 'POSTED') = ("resultId" IS NOT NULL)));
ALTER TABLE "InventoryPurchaseProposal" ADD CONSTRAINT "InventoryPurchaseProposal_values_check" CHECK ("quantity" > 0 AND "status" IN ('DRAFT', 'APPROVED', 'CLOSED', 'CANCELLED'));
CREATE UNIQUE INDEX "InventoryPurchaseProposal_active_item_key" ON "InventoryPurchaseProposal"("itemId") WHERE "status" IN ('DRAFT', 'APPROVED');
ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_values_check" CHECK ("size" > 0 AND NOT ("maintenanceId" IS NOT NULL AND "verificationId" IS NOT NULL));
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_values_check" CHECK ("quantity" > 0 AND "status" IN ('DRAFT', 'INSPECTED', 'POSTED', 'CANCELLED') AND ("accepted" IS NULL OR "accepted" >= 0) AND ("held" IS NULL OR "held" >= 0) AND ("rejected" IS NULL OR "rejected" >= 0));
ALTER TABLE "InventoryHoldRelease" ADD CONSTRAINT "InventoryHoldRelease_values_check" CHECK ("quantity" > 0);
