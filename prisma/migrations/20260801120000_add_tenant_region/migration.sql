-- Multi-region tenants — TenantRegion join table (mirrors FrameworkRegion).
--
-- ADDITIVE ONLY, and idempotent so it runs safely on:
--   (a) a CLEAN database that never had the table, and
--   (b) a database that already got it via `db push` (dev parity).
--
-- Tenant.regulatoryRegion is deliberately KEPT — it stays the PRIMARY (regions[0])
-- shim + this migration's backfill source. Nothing existing is dropped or altered,
-- so no existing row or read of the old shape breaks.

-- 1. Join table.
CREATE TABLE IF NOT EXISTS "TenantRegion" (
    "id"       TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "region"   TEXT NOT NULL,
    CONSTRAINT "TenantRegion_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes — unique set membership + region lookup (match the Prisma model).
CREATE UNIQUE INDEX IF NOT EXISTS "TenantRegion_tenantId_region_key" ON "TenantRegion"("tenantId", "region");
CREATE INDEX IF NOT EXISTS "TenantRegion_region_idx" ON "TenantRegion"("region");

-- 3. FK to Tenant (cascade delete), guarded so a re-run never errors.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TenantRegion_tenantId_fkey'
  ) THEN
    ALTER TABLE "TenantRegion"
      ADD CONSTRAINT "TenantRegion_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Backfill from the legacy scalar (idempotent via the unique index). Every
--    tenant with a non-null regulatoryRegion gets one matching TenantRegion row.
INSERT INTO "TenantRegion" ("id", "tenantId", "region")
SELECT gen_random_uuid()::text, "id", "regulatoryRegion"
FROM "Tenant"
WHERE "regulatoryRegion" IS NOT NULL
ON CONFLICT ("tenantId", "region") DO NOTHING;
