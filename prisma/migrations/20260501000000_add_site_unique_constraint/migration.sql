-- Self-healing migration: dedupe existing Site rows BEFORE applying the
-- unique constraint, then add the index. The pre-existing dev DB had 4
-- sites × 3 duplicates each (12 total) from earlier seed runs that used
-- `prisma.site.create` instead of upsert; the dedup keeps the oldest
-- row per (tenantId, name) by lowest rowid and drops the rest.
--
-- Wrapped in a BEGIN/COMMIT so the dedup + index creation are atomic.
-- If the index creation fails for any reason, the dedup is rolled back.

BEGIN;

DELETE FROM "Site" WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM "Site" GROUP BY "tenantId", "name"
);

CREATE UNIQUE INDEX "Site_tenantId_name_key" ON "Site"("tenantId", "name");

COMMIT;
