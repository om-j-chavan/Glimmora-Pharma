-- DEV-ONLY (SQLite): bring dev.db onto the Path-Z multi-region shape without a
-- full `prisma db push` (which would drop unrelated pre-existing drift). The
-- committed source of truth for prod is the Postgres migration at
-- prisma/migrations/20260801120000_add_tenant_region/migration.sql.
--
-- Why this file exists
-- -------------------
-- The pre-merge dev branch modelled a tenant's regions as `TenantRegulatoryRegion`
-- and had DROPPED the `Tenant.regulatoryRegion` scalar. The merged (Path Z) design
-- in prisma/schema.prisma renames that join table to `TenantRegion` and KEEPS the
-- scalar as the PRIMARY (= regions[0]) shim. dev.db still carried the old shape, so
-- every `include: { regions: … }` read failed with
--     Unknown field `regions` for include statement on model `Tenant`.
--
-- Direction of travel is the inverse of the prod migration: prod backfills the
-- join table FROM the scalar; here the join table already holds the real data, so
-- the scalar is backfilled FROM it.
--
-- One-shot (SQLite has no `ADD COLUMN IF NOT EXISTS`), same as
-- dev-notification-center.sqlite.sql.

-- 1. Re-add the PRIMARY shim column (nullable — matches schema.prisma).
ALTER TABLE "Tenant" ADD COLUMN "regulatoryRegion" TEXT;

-- 2. The renamed join table (identical shape; matches the Prisma model).
CREATE TABLE IF NOT EXISTS "TenantRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    CONSTRAINT "TenantRegion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenantRegion_tenantId_region_key" ON "TenantRegion"("tenantId", "region");
CREATE INDEX IF NOT EXISTS "TenantRegion_region_idx" ON "TenantRegion"("region");

-- 3. Carry the existing region sets across, preserving insertion order (rowid) so
--    the PRIMARY-is-first convention survives the move.
INSERT OR IGNORE INTO "TenantRegion" ("id", "tenantId", "region")
SELECT "id", "tenantId", "region" FROM "TenantRegulatoryRegion" ORDER BY rowid;

-- 4. Backfill the shim: regulatoryRegion = regions[0] (first row inserted for that
--    tenant), the same invariant src/actions/tenants.ts writes on create/update.
UPDATE "Tenant"
SET "regulatoryRegion" = (
    SELECT "region" FROM "TenantRegion"
    WHERE "TenantRegion"."tenantId" = "Tenant"."id"
    ORDER BY rowid LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM "TenantRegion" WHERE "TenantRegion"."tenantId" = "Tenant"."id");

-- 5. Drop the superseded table. It never existed in prod (no migration created it)
--    and nothing in src/ references it any more — every read now goes through
--    `prisma.tenantRegion` / the `regions` relation.
DROP TABLE "TenantRegulatoryRegion";
