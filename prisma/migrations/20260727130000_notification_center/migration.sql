-- Notification Center (Phase 2)
--
-- Two responsibilities, both idempotent so this runs safely on:
--   (a) a CLEAN database, where no prior migration ever created "Notification"
--       (audit finding NTF-020 — the table existed in prod only via `db push`), and
--   (b) an EXISTING database that already has the base table via `db push`.
--
-- Every new column is nullable or has a default, so existing rows backfill
-- automatically and nothing that reads the old shape breaks.

-- 1. Provision the base table if a clean DB never got it.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type"            TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "body"            TEXT,
    "linkPath"        TEXT,
    "entityType"      TEXT,
    "entityId"        TEXT,
    "isRead"          BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt"          TIMESTAMP(3),
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- 2. Add the Notification Center columns (idempotent).
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority"   TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "severity"   TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "source"     TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deletedAt"  TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tags"       TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "dedupeKey"  TEXT;

-- 3. Indexes (idempotent).
CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_isRead_createdAt_idx"
    ON "Notification" ("recipientUserId", "isRead", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx"
    ON "Notification" ("tenantId");
CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_tenantId_isArchived_createdAt_idx"
    ON "Notification" ("recipientUserId", "tenantId", "isArchived", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_dedupeKey_idx"
    ON "Notification" ("dedupeKey");
