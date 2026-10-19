CREATE TYPE "GaCctvOfflineStatus" AS ENUM ('DETECTED', 'VALIDATED', 'IT_ESCALATED', 'IN_REPAIR', 'RECOVERED', 'VERIFIED');
CREATE TABLE "GaCctvOfflineCase" (
  "id" SERIAL PRIMARY KEY, "cameraAssetId" INTEGER REFERENCES "Asset"("id"), "cameraName" TEXT NOT NULL, "areaId" INTEGER REFERENCES "GaArea"("id"), "detectedAt" TIMESTAMP(3) NOT NULL, "recoveredAt" TIMESTAMP(3), "offlineMinutes" INTEGER, "source" TEXT NOT NULL DEFAULT 'MANUAL', "severity" TEXT NOT NULL DEFAULT 'MEDIUM', "screenshot" TEXT, "reason" TEXT, "status" "GaCctvOfflineStatus" NOT NULL DEFAULT 'DETECTED', "validatedAt" TIMESTAMP(3), "escalatedAt" TIMESTAMP(3), "repairStartedAt" TIMESTAMP(3), "verifiedById" INTEGER, "verifiedAt" TIMESTAMP(3), "createdById" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GaCctvOfflineCase_status_detectedAt_idx" ON "GaCctvOfflineCase"("status", "detectedAt");
CREATE INDEX "GaCctvOfflineCase_cameraAssetId_detectedAt_idx" ON "GaCctvOfflineCase"("cameraAssetId", "detectedAt");
