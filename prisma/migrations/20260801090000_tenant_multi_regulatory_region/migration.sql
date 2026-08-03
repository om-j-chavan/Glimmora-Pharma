-- Multiple Regulatory Regions per tenant.
--
-- Replaces the single "Tenant"."regulatoryRegion" column with a join table, so a
-- tenant can answer to FDA, EMA and MHRA at once. Modelled as a relation rather
-- than a scalar array because local dev runs SQLite (no array type) while the
-- deployed DB is Postgres — and because it mirrors "FrameworkRegion", letting the
-- region archive / supersede / purge paths treat both reference tables alike.
--
-- BACKWARD COMPATIBILITY: every tenant that already had a region keeps it. Step 2
-- copies the existing value into exactly one link row before step 3 drops the
-- column, so an existing customer reads back as "one selected region" with no
-- manual intervention.
--
-- Idempotent throughout, so it runs safely on a clean database, on one that
-- already received the table via `db push`, and on a re-run.

-- 1. The join table.
CREATE TABLE IF NOT EXISTS "TenantRegulatoryRegion" (
    "id"       TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "region"   TEXT NOT NULL,
    CONSTRAINT "TenantRegulatoryRegion_pkey" PRIMARY KEY ("id")
);

-- A region may be selected at most once per tenant. This unique index is what
-- makes "prevent duplicate selections" a database guarantee rather than a
-- client-side convention, so a double-submit or a concurrent edit cannot create
-- a duplicate pair.
CREATE UNIQUE INDEX IF NOT EXISTS "TenantRegulatoryRegion_tenantId_region_key"
    ON "TenantRegulatoryRegion" ("tenantId", "region");
CREATE INDEX IF NOT EXISTS "TenantRegulatoryRegion_region_idx"
    ON "TenantRegulatoryRegion" ("region");
CREATE INDEX IF NOT EXISTS "TenantRegulatoryRegion_tenantId_idx"
    ON "TenantRegulatoryRegion" ("tenantId");

-- Cascade on tenant delete, matching every other Tenant child table: purging a
-- customer must not strand its region links.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TenantRegulatoryRegion_tenantId_fkey'
    ) THEN
        ALTER TABLE "TenantRegulatoryRegion"
            ADD CONSTRAINT "TenantRegulatoryRegion_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Backfill from the old column, when it is still present. Guarded by the
--    column's existence so a re-run (or a clean DB that never had it) is a no-op,
--    and by NOT EXISTS so a partially-completed run cannot violate the unique
--    index above.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Tenant' AND column_name = 'regulatoryRegion'
    ) THEN
        INSERT INTO "TenantRegulatoryRegion" ("id", "tenantId", "region")
        SELECT gen_random_uuid()::text, t."id", t."regulatoryRegion"
        FROM "Tenant" t
        WHERE t."regulatoryRegion" IS NOT NULL
          AND t."regulatoryRegion" <> ''
          AND NOT EXISTS (
              SELECT 1 FROM "TenantRegulatoryRegion" x
              WHERE x."tenantId" = t."id" AND x."region" = t."regulatoryRegion"
          );
    END IF;
END $$;

-- 3. Drop the superseded column. Runs only after the backfill above, so no
--    assignment is lost.
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "regulatoryRegion";
