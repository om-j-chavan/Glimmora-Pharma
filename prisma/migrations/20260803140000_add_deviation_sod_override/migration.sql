-- Deviation Single-QA SoD override — Phase 0 (schema only; NO gate reads the flag
-- yet). ADDITIVE + idempotent. Adds the DeviationSODOverride waiver audit-of-record
-- table, the deviation analogue of CAPASODOverride. REUSES the existing
-- Tenant.sodSingleQAOverride flag (one org attestation covers CAPA + Deviations) —
-- NO new flag is added here. Nothing existing is altered or dropped; behaviour is
-- unchanged until Phase 1.

-- Waiver record — one row per deviation-closure SoD control waived under the flag.
CREATE TABLE IF NOT EXISTS "DeviationSODOverride" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "deviationId"    TEXT NOT NULL,
    "control"        TEXT NOT NULL,
    "actorUserId"    TEXT NOT NULL,
    "actorName"      TEXT NOT NULL,
    "actorRole"      TEXT NOT NULL,
    "reasonCode"     TEXT NOT NULL,
    "justification"  TEXT NOT NULL,
    "signedRecordId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviationSODOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeviationSODOverride_deviationId_idx" ON "DeviationSODOverride"("deviationId");
CREATE INDEX IF NOT EXISTS "DeviationSODOverride_tenantId_idx" ON "DeviationSODOverride"("tenantId");

-- FKs (cascade), guarded so a re-run never errors.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'DeviationSODOverride_deviationId_fkey') THEN
    ALTER TABLE "DeviationSODOverride" ADD CONSTRAINT "DeviationSODOverride_deviationId_fkey"
      FOREIGN KEY ("deviationId") REFERENCES "Deviation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'DeviationSODOverride_tenantId_fkey') THEN
    ALTER TABLE "DeviationSODOverride" ADD CONSTRAINT "DeviationSODOverride_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
