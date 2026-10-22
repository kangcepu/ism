-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "GaRole" AS ENUM ('none', 'staff', 'supervisor');

-- CreateEnum
CREATE TYPE "GaAreaType" AS ENUM ('building', 'floor', 'zone', 'area', 'point');

-- CreateEnum
CREATE TYPE "GaAreaStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'REVISED', 'RETIRED');

-- CreateEnum
CREATE TYPE "GaWorkStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REWORK', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GaPlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GaPreventiveJobStatus" AS ENUM ('RELEASED', 'STARTED', 'SUBMITTED', 'VERIFIED', 'REWORK', 'OVERDUE', 'CLOSED');

-- CreateEnum
CREATE TYPE "GaCctvOfflineStatus" AS ENUM ('DETECTED', 'VALIDATED', 'IT_ESCALATED', 'IN_REPAIR', 'RECOVERED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "GaOutdoorMediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('available', 'in_use', 'maintenance', 'retired', 'disposed');

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('new', 'good', 'fair', 'poor', 'broken');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('online', 'degraded', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('local', 'hr');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ON_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "FloorAccess" AS ENUM ('none', 'view', 'edit');

-- CreateEnum
CREATE TYPE "InventoryLedgerType" AS ENUM ('RECEIPT', 'RESERVE', 'RELEASE', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN', 'ADJUSTMENT', 'COUNT', 'HOLD_RELEASE');

-- CreateEnum
CREATE TYPE "GaAngleStatus" AS ENUM ('PLANNED', 'INSPECTED', 'MATCH', 'GAP_FOUND', 'IT_ACTION', 'RECHECK', 'CLOSED');

-- CreateEnum
CREATE TYPE "GaFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'VERIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GaReconciliationStatus" AS ENUM ('PENDING', 'MATCH', 'DISCREPANCY', 'RESOLVED', 'VERIFIED');

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'PCS',
    "stockType" TEXT NOT NULL DEFAULT 'CONSUMABLE',
    "serialControl" BOOLEAN NOT NULL DEFAULT false,
    "assetId" INTEGER,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBin" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "site" TEXT,
    "zone" TEXT,
    "rack" TEXT,
    "level" TEXT,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "hold" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedger" (
    "id" BIGSERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "type" "InventoryLedgerType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "holdDelta" INTEGER NOT NULL DEFAULT 0,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "actorId" INTEGER NOT NULL,
    "reservationId" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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
    "purchaseOrderId" INTEGER,
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

-- CreateTable
CREATE TABLE "InventoryPurchaseOrder" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" INTEGER,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "InventoryStockReview" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "snapshotQty" INTEGER NOT NULL,
    "snapshotLedgerId" BIGINT,
    "proposedQty" INTEGER NOT NULL,
    "recountQty" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "recountedBy" INTEGER,
    "approvedBy" INTEGER,
    "resultId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recountedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryStockReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "CodeSequence" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeSequence_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "division" TEXT,
    "company" TEXT,
    "avatarPath" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "gaRole" "GaRole" NOT NULL DEFAULT 'none',
    "permissionGroupId" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGroup" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomField" (
    "id" SERIAL NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "macAddress" TEXT,
    "serialNumber" TEXT,
    "description" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "price" DECIMAL(18,2),
    "status" "AssetStatus" NOT NULL DEFAULT 'available',
    "condition" "ConditionGrade",
    "assignedUserId" INTEGER,
    "assignedSource" "AssignmentSource",
    "assigneeName" TEXT,
    "assigneeCode" TEXT,
    "assigneeCompany" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedById" INTEGER,
    "assignmentNote" TEXT,
    "expectedReturnAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "retiredReason" TEXT,
    "externalSource" TEXT,
    "externalId" TEXT,
    "externalHidden" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCustomData" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCustomData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetHistory" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" INTEGER,
    "statusFrom" "AssetStatus",
    "statusTo" "AssetStatus",
    "assigneeSnapshot" JSONB,
    "locationSnapshot" JSONB,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPhoto" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "internalName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkMonitor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "location" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 3000,
    "customPorts" INTEGER[],
    "notes" TEXT,
    "snmpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "snmpVersion" TEXT,
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "snmpCommunityEncrypted" TEXT,
    "httpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "httpUrl" TEXT,
    "lastStatus" "MonitorStatus" NOT NULL DEFAULT 'unknown',
    "latencyMs" DECIMAL(10,2),
    "lastMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorSample" (
    "id" BIGSERIAL NOT NULL,
    "monitorId" INTEGER NOT NULL,
    "status" "MonitorStatus",
    "latencyMs" DECIMAL(10,2),
    "trafficInBps" DECIMAL(16,2),
    "trafficOutBps" DECIMAL(16,2),
    "temperature" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorEvent" (
    "id" BIGSERIAL NOT NULL,
    "monitorId" INTEGER NOT NULL,
    "previousStatus" "MonitorStatus",
    "newStatus" "MonitorStatus" NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,

    CONSTRAINT "MonitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" SERIAL NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "encryptedValue" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItSupportReport" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reporter" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "resolution" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItSupportReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorMapPermission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "access" "FloorAccess" NOT NULL DEFAULT 'none',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorMapPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorMapGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "access" "FloorAccess" NOT NULL,

    CONSTRAINT "FloorMapGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorMapGroupMember" (
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FloorMapGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "FloorMapState" (
    "key" TEXT NOT NULL DEFAULT 'default',
    "state" JSONB NOT NULL,
    "updatedBy" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorMapState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FloorMapArea" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "background" TEXT,
    "canvasWidth" INTEGER NOT NULL DEFAULT 1920,
    "canvasHeight" INTEGER NOT NULL DEFAULT 1080,
    "state" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorMapArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapAssetPosition" (
    "assetId" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "placedBy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapAssetPosition_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "MapAssetRoom" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapAssetRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapAssetRoomItem" (
    "roomId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapAssetRoomItem_pkey" PRIMARY KEY ("roomId","assetId")
);

-- CreateTable
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

    CONSTRAINT "GaArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaAreaHistory" (
    "id" BIGSERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaAreaHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaCleaningChecklist" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "assigneeId" INTEGER,
    "status" "GaWorkStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" INTEGER,
    "templateId" INTEGER,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaCleaningChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "GaCleaningLine" (
    "id" SERIAL NOT NULL,
    "checklistId" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" INTEGER,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GaCleaningLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaOutdoorInspection" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "inspectedAt" DATE NOT NULL,
    "inspectorId" INTEGER,
    "plantCondition" TEXT NOT NULL,
    "drainCondition" TEXT NOT NULL,
    "cleanliness" TEXT NOT NULL,
    "action" TEXT,
    "status" "GaWorkStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" INTEGER,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaOutdoorInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaPreventivePlan" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "areaId" INTEGER NOT NULL,
    "standardWork" TEXT NOT NULL,
    "weekNo" INTEGER NOT NULL,
    "targetDate" DATE NOT NULL,
    "recurrence" TEXT,
    "pic1Id" INTEGER NOT NULL,
    "pic2Id" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "toolsRequired" TEXT,
    "status" "GaPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedAt" TIMESTAMP(3),
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaPreventivePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaPreventiveJob" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "areaId" INTEGER NOT NULL,
    "pic1Id" INTEGER NOT NULL,
    "pic2Id" INTEGER,
    "targetDate" DATE NOT NULL,
    "standardWork" TEXT NOT NULL,
    "status" "GaPreventiveJobStatus" NOT NULL DEFAULT 'RELEASED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "result" TEXT,
    "beforePhoto" TEXT,
    "afterPhoto" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" INTEGER,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "reworkReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaPreventiveJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaPreventiveHistory" (
    "id" BIGSERIAL NOT NULL,
    "planId" INTEGER,
    "jobId" INTEGER,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaPreventiveHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaCctvAngleInspection" (
    "id" SERIAL NOT NULL,
    "cameraAssetId" INTEGER,
    "cameraName" TEXT NOT NULL,
    "areaId" INTEGER,
    "plannedViewReference" TEXT,
    "actualViewPhoto" TEXT,
    "coverage" TEXT,
    "gapDescription" TEXT,
    "status" "GaAngleStatus" NOT NULL DEFAULT 'PLANNED',
    "inspectedAt" TIMESTAMP(3),
    "inspectorId" INTEGER NOT NULL,
    "ticketReference" TEXT,
    "reviewerId" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaCctvAngleInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaWeighbridgeReconciliation" (
    "id" SERIAL NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "securityTime" TIMESTAMP(3) NOT NULL,
    "cctvTime" TIMESTAMP(3) NOT NULL,
    "cameraName" TEXT NOT NULL,
    "plateNumber" TEXT,
    "vehicleType" TEXT,
    "goodsType" TEXT,
    "durationMinutes" INTEGER,
    "checkerId" INTEGER NOT NULL,
    "status" "GaReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "discrepancyReason" TEXT,
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaWeighbridgeReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaFinding" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "areaId" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "GaFindingStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" INTEGER,
    "dueDate" TIMESTAMP(3),
    "containment" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "evidence" TEXT,
    "escalatedTicket" TEXT,
    "verifiedById" INTEGER,
    "resolvedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "GaOutdoorMedia" (
    "id" SERIAL NOT NULL,
    "inspectionId" INTEGER NOT NULL,
    "type" "GaOutdoorMediaType" NOT NULL,
    "internalName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaOutdoorMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaCctvOfflineCase" (
    "id" SERIAL NOT NULL,
    "cameraAssetId" INTEGER,
    "cameraName" TEXT NOT NULL,
    "areaId" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "recoveredAt" TIMESTAMP(3),
    "offlineMinutes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "screenshot" TEXT,
    "reason" TEXT,
    "status" "GaCctvOfflineStatus" NOT NULL DEFAULT 'DETECTED',
    "validatedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "repairStartedAt" TIMESTAMP(3),
    "verifiedById" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaCctvOfflineCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationResource" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileRelease" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "versionName" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "notes" TEXT,
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" SERIAL NOT NULL,
    "normalizedQuestion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChat" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tools" JSONB NOT NULL,
    "verified" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "CctvCamera" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "sourceMarkerId" TEXT,
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_assetId_key" ON "InventoryItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBin_code_key" ON "InventoryBin"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_itemId_binId_key" ON "InventoryBalance"("itemId", "binId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLedger_reference_key" ON "InventoryLedger"("reference");

-- CreateIndex
CREATE INDEX "InventoryLedger_itemId_binId_createdAt_idx" ON "InventoryLedger"("itemId", "binId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_code_key" ON "InventoryReservation"("code");

-- CreateIndex
CREATE INDEX "InventoryReservation_itemId_binId_status_idx" ON "InventoryReservation"("itemId", "binId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReturn_code_key" ON "InventoryReturn"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReturn_resultId_key" ON "InventoryReturn"("resultId");

-- CreateIndex
CREATE INDEX "InventoryReturn_issueId_status_idx" ON "InventoryReturn"("issueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceipt_code_key" ON "InventoryReceipt"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReceipt_resultId_key" ON "InventoryReceipt"("resultId");

-- CreateIndex
CREATE INDEX "InventoryReceipt_itemId_status_idx" ON "InventoryReceipt"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPurchaseOrder_code_key" ON "InventoryPurchaseOrder"("code");

-- CreateIndex
CREATE INDEX "InventoryPurchaseOrder_itemId_status_idx" ON "InventoryPurchaseOrder"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHoldRelease_code_key" ON "InventoryHoldRelease"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHoldRelease_resultId_key" ON "InventoryHoldRelease"("resultId");

-- CreateIndex
CREATE INDEX "InventoryHoldRelease_sourceId_idx" ON "InventoryHoldRelease"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStockReview_code_key" ON "InventoryStockReview"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStockReview_resultId_key" ON "InventoryStockReview"("resultId");

-- CreateIndex
CREATE INDEX "InventoryStockReview_itemId_binId_status_idx" ON "InventoryStockReview"("itemId", "binId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPurchaseProposal_code_key" ON "InventoryPurchaseProposal"("code");

-- CreateIndex
CREATE INDEX "InventoryPurchaseProposal_itemId_status_idx" ON "InventoryPurchaseProposal"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroup_code_key" ON "PermissionGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WebSession_tokenHash_key" ON "WebSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MobileToken_tokenHash_key" ON "MobileToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_itemType_key" ON "Category"("name", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_fieldName_key" ON "CustomField"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_categoryId_locationId_idx" ON "Asset"("categoryId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_externalSource_externalId_key" ON "Asset"("externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCustomData_assetId_fieldName_key" ON "AssetCustomData"("assetId", "fieldName");

-- CreateIndex
CREATE INDEX "AssetHistory_assetId_createdAt_idx" ON "AssetHistory"("assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPhoto_internalName_key" ON "AssetPhoto"("internalName");

-- CreateIndex
CREATE INDEX "NetworkMonitor_host_idx" ON "NetworkMonitor"("host");

-- CreateIndex
CREATE INDEX "MonitorSample_monitorId_createdAt_idx" ON "MonitorSample"("monitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_group_key_key" ON "AppSetting"("group", "key");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FloorMapPermission_userId_key" ON "FloorMapPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorMapGroup_name_key" ON "FloorMapGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FloorMapArea_slug_key" ON "FloorMapArea"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MapAssetRoomItem_assetId_key" ON "MapAssetRoomItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "GaArea_code_key" ON "GaArea"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GaArea_qrCode_key" ON "GaArea"("qrCode");

-- CreateIndex
CREATE INDEX "GaArea_parentId_idx" ON "GaArea"("parentId");

-- CreateIndex
CREATE INDEX "GaArea_company_site_idx" ON "GaArea"("company", "site");

-- CreateIndex
CREATE INDEX "GaArea_status_active_idx" ON "GaArea"("status", "active");

-- CreateIndex
CREATE INDEX "GaAreaHistory_areaId_createdAt_idx" ON "GaAreaHistory"("areaId", "createdAt");

-- CreateIndex
CREATE INDEX "GaCleaningChecklist_workDate_status_idx" ON "GaCleaningChecklist"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GaCleaningChecklist_areaId_workDate_assigneeId_key" ON "GaCleaningChecklist"("areaId", "workDate", "assigneeId");

-- CreateIndex
CREATE INDEX "GaCleaningTemplate_active_startDate_endDate_idx" ON "GaCleaningTemplate"("active", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "GaOutdoorInspection_inspectedAt_status_idx" ON "GaOutdoorInspection"("inspectedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GaOutdoorInspection_areaId_inspectedAt_key" ON "GaOutdoorInspection"("areaId", "inspectedAt");

-- CreateIndex
CREATE INDEX "GaPreventivePlan_targetDate_status_idx" ON "GaPreventivePlan"("targetDate", "status");

-- CreateIndex
CREATE INDEX "GaPreventivePlan_areaId_weekNo_idx" ON "GaPreventivePlan"("areaId", "weekNo");

-- CreateIndex
CREATE UNIQUE INDEX "GaPreventiveJob_planId_key" ON "GaPreventiveJob"("planId");

-- CreateIndex
CREATE INDEX "GaPreventiveJob_targetDate_status_idx" ON "GaPreventiveJob"("targetDate", "status");

-- CreateIndex
CREATE INDEX "GaPreventiveJob_pic1Id_pic2Id_idx" ON "GaPreventiveJob"("pic1Id", "pic2Id");

-- CreateIndex
CREATE INDEX "GaPreventiveHistory_planId_createdAt_idx" ON "GaPreventiveHistory"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "GaPreventiveHistory_jobId_createdAt_idx" ON "GaPreventiveHistory"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "GaCctvAngleInspection_status_createdAt_idx" ON "GaCctvAngleInspection"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GaWeighbridgeReconciliation_ticketNumber_key" ON "GaWeighbridgeReconciliation"("ticketNumber");

-- CreateIndex
CREATE INDEX "GaWeighbridgeReconciliation_status_securityTime_idx" ON "GaWeighbridgeReconciliation"("status", "securityTime");

-- CreateIndex
CREATE UNIQUE INDEX "GaFinding_code_key" ON "GaFinding"("code");

-- CreateIndex
CREATE INDEX "GaFinding_status_dueDate_idx" ON "GaFinding"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "GaItTicket_code_key" ON "GaItTicket"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GaItTicket_findingId_key" ON "GaItTicket"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "GaReport_code_key" ON "GaReport"("code");

-- CreateIndex
CREATE INDEX "GaReport_periodStart_periodEnd_idx" ON "GaReport"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "GaOutdoorMedia_inspectionId_idx" ON "GaOutdoorMedia"("inspectionId");

-- CreateIndex
CREATE INDEX "GaCctvOfflineCase_status_detectedAt_idx" ON "GaCctvOfflineCase"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "GaCctvOfflineCase_cameraAssetId_detectedAt_idx" ON "GaCctvOfflineCase"("cameraAssetId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationResource_domain_name_key" ON "IntegrationResource"("domain", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MobileRelease_platform_versionCode_key" ON "MobileRelease"("platform", "versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "AiMemory_normalizedQuestion_fingerprint_key" ON "AiMemory"("normalizedQuestion", "fingerprint");

-- CreateIndex
CREATE INDEX "AiChat_userId_createdAt_idx" ON "AiChat"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CctvRecorder_code_key" ON "CctvRecorder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CctvCamera_code_key" ON "CctvCamera"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CctvCamera_sourceMarkerId_key" ON "CctvCamera"("sourceMarkerId");

-- CreateIndex
CREATE UNIQUE INDEX "CctvCamera_assetId_key" ON "CctvCamera"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CctvCamera_recorderId_channel_key" ON "CctvCamera"("recorderId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CctvMaintenance_code_key" ON "CctvMaintenance"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CctvVerification_code_key" ON "CctvVerification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CctvEvidence_internalName_key" ON "CctvEvidence"("internalName");

-- CreateIndex
CREATE INDEX "CctvEvidence_cameraId_createdAt_idx" ON "CctvEvidence"("cameraId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAuditSession_code_key" ON "AssetAuditSession"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAuditEntry_sessionId_assetId_key" ON "AssetAuditEntry"("sessionId", "assetId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "InventoryReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReturn" ADD CONSTRAINT "InventoryReturn_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "InventoryPurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReceipt" ADD CONSTRAINT "InventoryReceipt_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchaseOrder" ADD CONSTRAINT "InventoryPurchaseOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHoldRelease" ADD CONSTRAINT "InventoryHoldRelease_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHoldRelease" ADD CONSTRAINT "InventoryHoldRelease_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_binId_fkey" FOREIGN KEY ("binId") REFERENCES "InventoryBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStockReview" ADD CONSTRAINT "InventoryStockReview_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "InventoryLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPurchaseProposal" ADD CONSTRAINT "InventoryPurchaseProposal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_permissionGroupId_fkey" FOREIGN KEY ("permissionGroupId") REFERENCES "PermissionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileToken" ADD CONSTRAINT "MobileToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCustomData" ADD CONSTRAINT "AssetCustomData_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetHistory" ADD CONSTRAINT "AssetHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorSample" ADD CONSTRAINT "MonitorSample_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorEvent" ADD CONSTRAINT "MonitorEvent_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorMapPermission" ADD CONSTRAINT "FloorMapPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorMapGroupMember" ADD CONSTRAINT "FloorMapGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FloorMapGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorMapGroupMember" ADD CONSTRAINT "FloorMapGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapAssetPosition" ADD CONSTRAINT "MapAssetPosition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapAssetRoomItem" ADD CONSTRAINT "MapAssetRoomItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MapAssetRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapAssetRoomItem" ADD CONSTRAINT "MapAssetRoomItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaArea" ADD CONSTRAINT "GaArea_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GaArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaArea" ADD CONSTRAINT "GaArea_ownerGaId_fkey" FOREIGN KEY ("ownerGaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaAreaHistory" ADD CONSTRAINT "GaAreaHistory_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaAreaHistory" ADD CONSTRAINT "GaAreaHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCleaningChecklist" ADD CONSTRAINT "GaCleaningChecklist_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCleaningChecklist" ADD CONSTRAINT "GaCleaningChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "GaCleaningTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCleaningTemplate" ADD CONSTRAINT "GaCleaningTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCleaningLine" ADD CONSTRAINT "GaCleaningLine_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "GaCleaningChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaOutdoorInspection" ADD CONSTRAINT "GaOutdoorInspection_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaPreventivePlan" ADD CONSTRAINT "GaPreventivePlan_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaPreventiveJob" ADD CONSTRAINT "GaPreventiveJob_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GaPreventivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaPreventiveJob" ADD CONSTRAINT "GaPreventiveJob_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaPreventiveHistory" ADD CONSTRAINT "GaPreventiveHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GaPreventivePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaPreventiveHistory" ADD CONSTRAINT "GaPreventiveHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GaPreventiveJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCctvAngleInspection" ADD CONSTRAINT "GaCctvAngleInspection_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaFinding" ADD CONSTRAINT "GaFinding_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaItTicket" ADD CONSTRAINT "GaItTicket_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "GaFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaOutdoorMedia" ADD CONSTRAINT "GaOutdoorMedia_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "GaOutdoorInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCctvOfflineCase" ADD CONSTRAINT "GaCctvOfflineCase_cameraAssetId_fkey" FOREIGN KEY ("cameraAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaCctvOfflineCase" ADD CONSTRAINT "GaCctvOfflineCase_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GaArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChat" ADD CONSTRAINT "AiChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvRecorder" ADD CONSTRAINT "CctvRecorder_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "CctvRecorder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvCamera" ADD CONSTRAINT "CctvCamera_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "NetworkMonitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvMaintenance" ADD CONSTRAINT "CctvMaintenance_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvVerification" ADD CONSTRAINT "CctvVerification_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "CctvCamera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "CctvMaintenance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CctvEvidence" ADD CONSTRAINT "CctvEvidence_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "CctvVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAuditEntry" ADD CONSTRAINT "AssetAuditEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AssetAuditSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAuditEntry" ADD CONSTRAINT "AssetAuditEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

