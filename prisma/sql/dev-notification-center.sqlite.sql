-- DEV-ONLY (SQLite): apply the Notification Center columns to dev.db without a
-- full `prisma db push` (which would drop unrelated pre-existing drift). The
-- committed source of truth for prod is the Postgres migration at
-- prisma/migrations/20260727130000_notification_center/migration.sql.
--
-- SQLite ADD COLUMN forbids a non-constant default (e.g. CURRENT_TIMESTAMP), so
-- updatedAt backfills existing rows with a constant sentinel; new rows get their
-- value from Prisma's @updatedAt.
ALTER TABLE "Notification" ADD COLUMN "priority"   TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "Notification" ADD COLUMN "severity"   TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "Notification" ADD COLUMN "source"     TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "Notification" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Notification" ADD COLUMN "deletedAt"  DATETIME;
ALTER TABLE "Notification" ADD COLUMN "updatedAt"  DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE "Notification" ADD COLUMN "tags"       TEXT;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey"  TEXT;

CREATE INDEX IF NOT EXISTS "Notification_recipientUserId_tenantId_isArchived_createdAt_idx"
    ON "Notification" ("recipientUserId", "tenantId", "isArchived", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_dedupeKey_idx"
    ON "Notification" ("dedupeKey");
