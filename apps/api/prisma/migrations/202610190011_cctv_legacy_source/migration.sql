ALTER TABLE "CctvCamera" ADD COLUMN "sourceMarkerId" TEXT;
CREATE UNIQUE INDEX "CctvCamera_sourceMarkerId_key" ON "CctvCamera"("sourceMarkerId");
