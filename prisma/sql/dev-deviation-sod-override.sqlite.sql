-- DEV-ONLY (SQLite): Deviation Single-QA SoD override (Phase 0 — schema only),
-- applied to dev.db without a full `prisma db push`. Prod source of truth:
-- prisma/migrations/20260803140000_add_deviation_sod_override/migration.sql.
--
-- REUSES Tenant.sodSingleQAOverride (added by dev-capa-sod-override.sqlite.sql) —
-- one org attestation covers CAPA + Deviations, so no new flag here.

CREATE TABLE IF NOT EXISTS "DeviationSODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviationSODOverride_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviationSODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DeviationSODOverride_deviationId_idx" ON "DeviationSODOverride"("deviationId");
CREATE INDEX IF NOT EXISTS "DeviationSODOverride_tenantId_idx" ON "DeviationSODOverride"("tenantId");
