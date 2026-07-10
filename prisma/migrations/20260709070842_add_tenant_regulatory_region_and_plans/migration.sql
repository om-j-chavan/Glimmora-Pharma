-- AlterTable
ALTER TABLE "Deviation" ADD COLUMN "priority" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "linkUrl" TEXT;
ALTER TABLE "Document" ADD COLUMN "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "completionNotes" TEXT;
ALTER TABLE "Finding" ADD COLUMN "reworkAt" DATETIME;
ALTER TABLE "Finding" ADD COLUMN "reworkById" TEXT;
ALTER TABLE "Finding" ADD COLUMN "reworkReason" TEXT;
ALTER TABLE "Finding" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "Finding" ADD COLUMN "submittedById" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Tenant" ADD COLUMN "regulatoryRegion" TEXT;

-- CreateTable
CREATE TABLE "RegulatoryRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" DATETIME,
    "aliasOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RegulatoryRegion_aliasOfId_fkey" FOREIGN KEY ("aliasOfId") REFERENCES "RegulatoryRegion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FindingMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingMessage_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "assigneeId" TEXT,
    "message" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completionNotes" TEXT,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "reworkReason" TEXT,
    "reworkAt" DATETIME,
    "reworkById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "DeviationTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviationTask_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviationTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviationTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviationTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviationTask_reworkById_fkey" FOREIGN KEY ("reworkById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviationTaskMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviationTaskMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviationTaskMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DeviationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationStageTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "validationStageId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "assigneeId" TEXT,
    "message" TEXT NOT NULL,
    "findingRef" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completionNotes" TEXT,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "reworkReason" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "ValidationStageTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValidationStageTask_validationStageId_fkey" FOREIGN KEY ("validationStageId") REFERENCES "ValidationStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ValidationStageTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ValidationStageTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ValidationStageTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platformEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAllRegions" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" DATETIME,
    "aliasOfId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Framework_aliasOfId_fkey" FOREIGN KEY ("aliasOfId") REFERENCES "Framework" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FrameworkRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "frameworkId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    CONSTRAINT "FrameworkRegion_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantFramework" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantFramework_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TenantFramework_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanRoleLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanRoleLimit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantRoleLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantRoleLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FDA483Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "inspectionDate" DATETIME NOT NULL,
    "responseDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "responseDraft" TEXT,
    "agiDraft" TEXT,
    "submittedAt" DATETIME,
    "submittedBy" TEXT,
    "signatureMeaning" TEXT,
    "closedAt" DATETIME,
    "currentStage" TEXT NOT NULL DEFAULT 'intake',
    "outcomeType" TEXT,
    "outcomeNote" TEXT,
    "outcomeSignatureId" TEXT,
    "responseSignatureId" TEXT,
    "inspectionEndDate" DATETIME,
    "leadInvestigator" TEXT,
    "internalOwnerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FDA483Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_responseSignatureId_fkey" FOREIGN KEY ("responseSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_internalOwnerId_fkey" FOREIGN KEY ("internalOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FDA483Event" ("agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "inspectionEndDate", "internalOwnerId", "leadInvestigator", "referenceNumber", "responseDeadline", "responseDraft", "responseSignatureId", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt") SELECT "agency", "agiDraft", "closedAt", "createdAt", "createdBy", "eventType", "id", "inspectionDate", "inspectionEndDate", "internalOwnerId", "leadInvestigator", "referenceNumber", "responseDeadline", "responseDraft", "responseSignatureId", "signatureMeaning", "siteId", "status", "submittedAt", "submittedBy", "tenantId", "updatedAt" FROM "FDA483Event";
DROP TABLE "FDA483Event";
ALTER TABLE "new_FDA483Event" RENAME TO "FDA483Event";
CREATE UNIQUE INDEX "FDA483Event_outcomeSignatureId_key" ON "FDA483Event"("outcomeSignatureId");
CREATE UNIQUE INDEX "FDA483Event_responseSignatureId_key" ON "FDA483Event"("responseSignatureId");
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "description" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "currentHandler" TEXT NOT NULL DEFAULT 'super_admin',
    "escalatedAt" DATETIME,
    "escalatedById" TEXT,
    "escalatedByName" TEXT,
    "relatedModule" TEXT,
    "relatedRecordId" TEXT,
    "relatedRecordRef" TEXT,
    "slaDueAt" DATETIME,
    "resolutionSummary" TEXT,
    "resolutionCategory" TEXT,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "autoCloseAfter" DATETIME,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "reopenReason" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "appVersion" TEXT,
    "originUrl" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Ticket" ("appVersion", "assigneeId", "assigneeName", "autoCloseAfter", "cancelReason", "cancelledAt", "category", "closedAt", "closedById", "createdAt", "description", "id", "originUrl", "priority", "reference", "relatedModule", "relatedRecordId", "relatedRecordRef", "reopenReason", "requesterId", "requesterName", "requesterRole", "resolutionCategory", "resolutionSummary", "resolvedAt", "resolvedById", "slaDueAt", "status", "subject", "tenantId", "updatedAt", "userAgent") SELECT "appVersion", "assigneeId", "assigneeName", "autoCloseAfter", "cancelReason", "cancelledAt", "category", "closedAt", "closedById", "createdAt", "description", "id", "originUrl", "priority", "reference", "relatedModule", "relatedRecordId", "relatedRecordRef", "reopenReason", "requesterId", "requesterName", "requesterRole", "resolutionCategory", "resolutionSummary", "resolvedAt", "resolvedById", "slaDueAt", "status", "subject", "tenantId", "updatedAt", "userAgent" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");
CREATE INDEX "Ticket_tenantId_status_idx" ON "Ticket"("tenantId", "status");
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_slaDueAt_idx" ON "Ticket"("slaDueAt");
CREATE INDEX "Ticket_tenantId_createdAt_idx" ON "Ticket"("tenantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRegion_value_key" ON "RegulatoryRegion"("value");

-- CreateIndex
CREATE INDEX "FindingMessage_tenantId_findingId_idx" ON "FindingMessage"("tenantId", "findingId");

-- CreateIndex
CREATE INDEX "DeviationTask_tenantId_deviationId_idx" ON "DeviationTask"("tenantId", "deviationId");

-- CreateIndex
CREATE INDEX "DeviationTask_assigneeId_idx" ON "DeviationTask"("assigneeId");

-- CreateIndex
CREATE INDEX "DeviationTask_deletedAt_idx" ON "DeviationTask"("deletedAt");

-- CreateIndex
CREATE INDEX "DeviationTaskMessage_tenantId_taskId_idx" ON "DeviationTaskMessage"("tenantId", "taskId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_tenantId_validationStageId_idx" ON "ValidationStageTask"("tenantId", "validationStageId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_assigneeId_idx" ON "ValidationStageTask"("assigneeId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_systemId_idx" ON "ValidationStageTask"("systemId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_deletedAt_idx" ON "ValidationStageTask"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_key" ON "Framework"("key");

-- CreateIndex
CREATE INDEX "FrameworkRegion_region_idx" ON "FrameworkRegion"("region");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkRegion_frameworkId_region_key" ON "FrameworkRegion"("frameworkId", "region");

-- CreateIndex
CREATE INDEX "TenantFramework_tenantId_idx" ON "TenantFramework"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFramework_tenantId_frameworkId_key" ON "TenantFramework"("tenantId", "frameworkId");

-- CreateIndex
CREATE INDEX "PlanRoleLimit_planId_idx" ON "PlanRoleLimit"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanRoleLimit_planId_role_key" ON "PlanRoleLimit"("planId", "role");

-- CreateIndex
CREATE INDEX "TenantRoleLimit_tenantId_idx" ON "TenantRoleLimit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRoleLimit_tenantId_role_key" ON "TenantRoleLimit"("tenantId", "role");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedById_idx" ON "Document"("tenantId", "uploadedById");
