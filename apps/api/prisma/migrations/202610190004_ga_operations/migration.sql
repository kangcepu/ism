CREATE TYPE "GaWorkStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REWORK', 'OVERDUE');
CREATE TABLE "GaCleaningChecklist" (
  "id" SERIAL NOT NULL, "areaId" INTEGER NOT NULL, "workDate" DATE NOT NULL, "assigneeId" INTEGER, "status" "GaWorkStatus" NOT NULL DEFAULT 'DRAFT', "note" TEXT, "submittedAt" TIMESTAMP(3), "verifiedById" INTEGER, "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GaCleaningChecklist_pkey" PRIMARY KEY ("id"), CONSTRAINT "GaCleaningChecklist_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "GaCleaningChecklist_areaId_workDate_key" ON "GaCleaningChecklist"("areaId", "workDate");
CREATE INDEX "GaCleaningChecklist_workDate_status_idx" ON "GaCleaningChecklist"("workDate", "status");
CREATE TABLE "GaCleaningLine" (
  "id" SERIAL NOT NULL, "checklistId" INTEGER NOT NULL, "task" TEXT NOT NULL, "completed" BOOLEAN NOT NULL DEFAULT false, "completedAt" TIMESTAMP(3), "note" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "GaCleaningLine_pkey" PRIMARY KEY ("id"), CONSTRAINT "GaCleaningLine_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "GaCleaningChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "GaOutdoorInspection" (
  "id" SERIAL NOT NULL, "areaId" INTEGER NOT NULL, "inspectedAt" DATE NOT NULL, "inspectorId" INTEGER, "plantCondition" TEXT NOT NULL, "drainCondition" TEXT NOT NULL, "cleanliness" TEXT NOT NULL, "action" TEXT, "status" "GaWorkStatus" NOT NULL DEFAULT 'DRAFT', "submittedAt" TIMESTAMP(3), "verifiedById" INTEGER, "verifiedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GaOutdoorInspection_pkey" PRIMARY KEY ("id"), CONSTRAINT "GaOutdoorInspection_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "GaOutdoorInspection_areaId_inspectedAt_key" ON "GaOutdoorInspection"("areaId", "inspectedAt");
CREATE INDEX "GaOutdoorInspection_inspectedAt_status_idx" ON "GaOutdoorInspection"("inspectedAt", "status");
