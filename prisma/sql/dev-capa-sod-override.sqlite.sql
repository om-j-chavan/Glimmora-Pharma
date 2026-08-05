-- DEV-ONLY (SQLite): CAPA Single-QA SoD override (Phase 0 — schema + enablement
-- flag only), applied to dev.db without a full `prisma db push`. Prod source of
-- truth: prisma/migrations/20260803130000_add_capa_sod_override/migration.sql.
--
-- One-shot (SQLite has no `ADD COLUMN IF NOT EXISTS`).

-- 1. Org enablement flag (Super-Admin-set). SQLite spells false as 0.
ALTER TABLE "Tenant" ADD COLUMN "sodSingleQAOverride" BOOLEAN NOT NULL DEFAULT false;

-- 2. Waiver record — one row per SoD control waived under the flag.
CREATE TABLE IF NOT EXISTS "CAPASODOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPASODOverride_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPASODOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CAPASODOverride_capaId_idx" ON "CAPASODOverride"("capaId");
CREATE INDEX IF NOT EXISTS "CAPASODOverride_tenantId_idx" ON "CAPASODOverride"("tenantId");
