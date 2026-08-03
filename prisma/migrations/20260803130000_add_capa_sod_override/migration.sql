-- CAPA Single-QA SoD override — Phase 0 (schema + enablement only; NO gate reads
-- the flag yet). ADDITIVE + idempotent. Adds the org enablement flag on Tenant and
-- the CAPASODOverride waiver audit-of-record table. Nothing existing is altered or
-- dropped; the flag defaults false, so behaviour is unchanged until Phase 1.

-- 1. Org enablement flag (Super-Admin-set; org attests single-QA operation).
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sodSingleQAOverride" BOOLEAN NOT NULL DEFAULT false;

-- 2. Waiver record — one row per SoD control waived under the flag.
CREATE TABLE IF NOT EXISTS "CAPASODOverride" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "capaId"         TEXT NOT NULL,
    "control"        TEXT NOT NULL,
    "actorUserId"    TEXT NOT NULL,
    "actorName"      TEXT NOT NULL,
    "actorRole"      TEXT NOT NULL,
    "reasonCode"     TEXT NOT NULL,
    "justification"  TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPASODOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CAPASODOverride_capaId_idx" ON "CAPASODOverride"("capaId");
CREATE INDEX IF NOT EXISTS "CAPASODOverride_tenantId_idx" ON "CAPASODOverride"("tenantId");

-- 3. FKs (cascade), guarded so a re-run never errors.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CAPASODOverride_capaId_fkey') THEN
    ALTER TABLE "CAPASODOverride" ADD CONSTRAINT "CAPASODOverride_capaId_fkey"
      FOREIGN KEY ("capaId") REFERENCES "CAPA"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'CAPASODOverride_tenantId_fkey') THEN
    ALTER TABLE "CAPASODOverride" ADD CONSTRAINT "CAPASODOverride_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
