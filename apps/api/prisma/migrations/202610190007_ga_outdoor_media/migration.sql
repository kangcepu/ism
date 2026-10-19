CREATE TYPE "GaOutdoorMediaType" AS ENUM ('PHOTO', 'VIDEO');
CREATE TABLE "GaOutdoorMedia" (
  "id" SERIAL PRIMARY KEY, "inspectionId" INTEGER NOT NULL REFERENCES "GaOutdoorInspection"("id") ON DELETE CASCADE, "type" "GaOutdoorMediaType" NOT NULL, "internalName" TEXT NOT NULL, "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "createdById" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GaOutdoorMedia_inspectionId_idx" ON "GaOutdoorMedia"("inspectionId");
