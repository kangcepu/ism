ALTER TYPE "GaWorkStatus" ADD VALUE 'CANCELLED';
DROP INDEX "GaCleaningChecklist_areaId_workDate_key";
ALTER TABLE "GaCleaningChecklist" ADD COLUMN     "submittedById" INTEGER,
ADD COLUMN     "templateId" INTEGER;
ALTER TABLE "GaCleaningLine" ADD COLUMN     "completedById" INTEGER;
ALTER TABLE "GaOutdoorInspection" ADD COLUMN     "submittedById" INTEGER;
ALTER TABLE "GaPreventiveJob" ADD COLUMN     "submittedById" INTEGER;
ALTER TABLE "GaFinding" ADD COLUMN     "resolvedById" INTEGER;
CREATE TABLE "GaCleaningTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "areaId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "tasks" TEXT[],
    "weekdays" INTEGER[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "generatedThrough" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GaCleaningTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GaItTicket" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "findingId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GaItTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GaReport" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB NOT NULL,
    "createdById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GaReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GaCleaningTemplate_active_startDate_endDate_idx" ON "GaCleaningTemplate"("active", "startDate", "endDate");
CREATE UNIQUE INDEX "GaItTicket_code_key" ON "GaItTicket"("code");
CREATE UNIQUE INDEX "GaItTicket_findingId_key" ON "GaItTicket"("findingId");
CREATE UNIQUE INDEX "GaReport_code_key" ON "GaReport"("code");
CREATE INDEX "GaReport_periodStart_periodEnd_idx" ON "GaReport"("periodStart", "periodEnd");
CREATE UNIQUE INDEX "GaCleaningChecklist_areaId_workDate_assigneeId_key" ON "GaCleaningChecklist"("areaId", "workDate", "assigneeId");
ALTER TABLE "GaCleaningChecklist" ADD CONSTRAINT "GaCleaningChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GaCleaningTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GaCleaningTemplate" ADD CONSTRAINT "GaCleaningTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GaItTicket" ADD CONSTRAINT "GaItTicket_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "GaFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
