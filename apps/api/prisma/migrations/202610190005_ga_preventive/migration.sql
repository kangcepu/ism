CREATE TYPE "GaPlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'RELEASED', 'CANCELLED');
CREATE TYPE "GaPreventiveJobStatus" AS ENUM ('RELEASED', 'STARTED', 'SUBMITTED', 'VERIFIED', 'REWORK', 'OVERDUE', 'CLOSED');
CREATE TABLE "GaPreventivePlan" (
  "id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL, "areaId" INTEGER NOT NULL REFERENCES "GaArea"("id"), "standardWork" TEXT NOT NULL, "weekNo" INTEGER NOT NULL, "targetDate" DATE NOT NULL, "recurrence" TEXT, "pic1Id" INTEGER NOT NULL, "pic2Id" INTEGER, "priority" TEXT NOT NULL DEFAULT 'NORMAL', "toolsRequired" TEXT, "status" "GaPlanStatus" NOT NULL DEFAULT 'DRAFT', "proposedAt" TIMESTAMP(3), "approvedById" INTEGER, "approvedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GaPreventiveJob" (
  "id" SERIAL PRIMARY KEY, "planId" INTEGER NOT NULL UNIQUE REFERENCES "GaPreventivePlan"("id") ON DELETE CASCADE, "areaId" INTEGER NOT NULL REFERENCES "GaArea"("id"), "pic1Id" INTEGER NOT NULL, "pic2Id" INTEGER, "targetDate" DATE NOT NULL, "standardWork" TEXT NOT NULL, "status" "GaPreventiveJobStatus" NOT NULL DEFAULT 'RELEASED', "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "result" TEXT, "beforePhoto" TEXT, "afterPhoto" TEXT, "submittedAt" TIMESTAMP(3), "verifiedById" INTEGER, "verifiedAt" TIMESTAMP(3), "reworkReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GaPreventiveHistory" (
  "id" BIGSERIAL PRIMARY KEY, "planId" INTEGER REFERENCES "GaPreventivePlan"("id") ON DELETE CASCADE, "jobId" INTEGER REFERENCES "GaPreventiveJob"("id") ON DELETE CASCADE, "actorId" INTEGER NOT NULL, "action" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GaPreventivePlan_targetDate_status_idx" ON "GaPreventivePlan"("targetDate", "status");
CREATE INDEX "GaPreventiveJob_targetDate_status_idx" ON "GaPreventiveJob"("targetDate", "status");
