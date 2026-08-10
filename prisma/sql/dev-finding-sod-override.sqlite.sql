-- ⚠️ UNVERIFIED — single-QA SoD override for finding closure, built without DB
-- access. See prisma/migrations/20260809160000_add_finding_sod_override/migration.sql
-- for the full verification checklist that must pass before deploy.
--
-- ⚠️ NOT APPLIED to dev.db. Apply it when you want to exercise the waiver locally.
-- Until then the table is absent and any query touching FindingSODOverride fails.
--
-- DEV-ONLY (SQLite): finding-closure single-QA SoD waivers, applied to dev.db
-- without a full `prisma db push`. Prod source of truth: the migration above.
--
-- REUSES Tenant.sodSingleQAOverride (added by dev-capa-sod-override.sqlite.sql) —
-- one org attestation covers CAPA + Deviation + Findings, so no new flag here.

CREATE TABLE IF NOT EXISTS "FindingSODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingSODOverride_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FindingSODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FindingSODOverride_findingId_idx" ON "FindingSODOverride"("findingId");
CREATE INDEX IF NOT EXISTS "FindingSODOverride_tenantId_idx" ON "FindingSODOverride"("tenantId");
