/*
  Warnings:

  - You are about to drop the column `assigneeId` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `assigneeName` on the `Ticket` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "description" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
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
    "lastEditedAt" DATETIME,
    "lastEditedById" TEXT,
    "lastEditedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Ticket" ("appVersion", "autoCloseAfter", "cancelReason", "cancelledAt", "category", "closedAt", "closedById", "createdAt", "currentHandler", "description", "escalatedAt", "escalatedById", "escalatedByName", "id", "originUrl", "priority", "reference", "relatedModule", "relatedRecordId", "relatedRecordRef", "reopenReason", "requesterId", "requesterName", "requesterRole", "resolutionCategory", "resolutionSummary", "resolvedAt", "resolvedById", "slaDueAt", "status", "subject", "tenantId", "updatedAt", "userAgent") SELECT "appVersion", "autoCloseAfter", "cancelReason", "cancelledAt", "category", "closedAt", "closedById", "createdAt", "currentHandler", "description", "escalatedAt", "escalatedById", "escalatedByName", "id", "originUrl", "priority", "reference", "relatedModule", "relatedRecordId", "relatedRecordRef", "reopenReason", "requesterId", "requesterName", "requesterRole", "resolutionCategory", "resolutionSummary", "resolvedAt", "resolvedById", "slaDueAt", "status", "subject", "tenantId", "updatedAt", "userAgent" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");
CREATE INDEX "Ticket_tenantId_status_idx" ON "Ticket"("tenantId", "status");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_slaDueAt_idx" ON "Ticket"("slaDueAt");
CREATE INDEX "Ticket_tenantId_createdAt_idx" ON "Ticket"("tenantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
