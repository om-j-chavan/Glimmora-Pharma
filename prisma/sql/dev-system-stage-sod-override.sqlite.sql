-- ⚠️ UNVERIFIED — CSV stage-approval SoD override, built without DB access.
-- Requires (1) QA/regulatory policy authorization to enable single-QA stage
-- approval, and (2) Postgres verification before deploy. Waives the ONLY
-- identity control in the CSV validation chain — ceiling is load-bearing.
--
-- ⚠️ NOT APPLIED. LOCAL dev.db ONLY — never Postgres. Run manually when you want
-- the table locally:
--     sqlite3 prisma/dev.db < prisma/sql/dev-system-stage-sod-override.sqlite.sql
--
-- SQLite mirror of 20260814120000_add_system_stage_sod_override for local dev.
-- Same columns/indexes; SQLite types + inline FKs (no ALTER TABLE ADD CONSTRAINT).
-- Mirrors dev-finding-sod-override.sqlite.sql.

CREATE TABLE IF NOT EXISTS "SystemStageSODOverride" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "tenantId"      TEXT NOT NULL,
    "systemId"      TEXT NOT NULL,
    "stageId"       TEXT NOT NULL,
    "control"       TEXT NOT NULL,
    "actorUserId"   TEXT NOT NULL,
    "actorName"     TEXT NOT NULL,
    "actorRole"     TEXT NOT NULL,
    "reasonCode"    TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemStageSODOverride_systemId_fkey"
      FOREIGN KEY ("systemId") REFERENCES "GxPSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SystemStageSODOverride_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES "ValidationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SystemStageSODOverride_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_stageId_idx"  ON "SystemStageSODOverride"("stageId");
CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_systemId_idx" ON "SystemStageSODOverride"("systemId");
CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_tenantId_idx" ON "SystemStageSODOverride"("tenantId");
