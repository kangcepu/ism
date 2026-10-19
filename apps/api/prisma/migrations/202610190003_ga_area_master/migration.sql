CREATE TYPE "GaRole" AS ENUM ('none', 'staff', 'supervisor');
CREATE TYPE "GaAreaType" AS ENUM ('building', 'floor', 'zone', 'area', 'point');
CREATE TYPE "GaAreaStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'REVISED', 'RETIRED');
ALTER TABLE "User" ADD COLUMN "gaRole" "GaRole" NOT NULL DEFAULT 'none';
CREATE TABLE "GaArea" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "GaAreaType" NOT NULL,
  "status" "GaAreaStatus" NOT NULL DEFAULT 'DRAFT',
  "parentId" INTEGER,
  "company" TEXT,
  "site" TEXT,
  "building" TEXT,
  "floor" TEXT,
  "description" TEXT,
  "floorPage" INTEGER,
  "x" DOUBLE PRECISION,
  "y" DOUBLE PRECISION,
  "qrCode" TEXT,
  "ownerGaId" INTEGER,
  "cameraAssetId" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GaArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GaArea_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GaArea"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GaArea_ownerGaId_fkey" FOREIGN KEY ("ownerGaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GaArea_code_key" ON "GaArea"("code");
CREATE UNIQUE INDEX "GaArea_qrCode_key" ON "GaArea"("qrCode");
CREATE INDEX "GaArea_parentId_idx" ON "GaArea"("parentId");
CREATE INDEX "GaArea_company_site_idx" ON "GaArea"("company", "site");
CREATE INDEX "GaArea_status_active_idx" ON "GaArea"("status", "active");
CREATE TABLE "GaAreaHistory" (
  "id" BIGSERIAL NOT NULL,
  "areaId" INTEGER NOT NULL,
  "actorId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GaAreaHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GaAreaHistory_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GaAreaHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GaAreaHistory_areaId_createdAt_idx" ON "GaAreaHistory"("areaId", "createdAt");
