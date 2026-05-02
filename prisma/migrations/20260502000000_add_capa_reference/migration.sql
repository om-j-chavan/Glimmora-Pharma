-- Add a human-readable per-tenant CAPA reference (e.g. "CAPA-2026-014").
-- The column is nullable in the schema, but every row has a non-null value
-- after this migration: we add the column, backfill, and create the unique
-- index in one transaction. New rows are populated in createCAPA's
-- transaction (src/actions/capas.ts); the schema stays nullable only so
-- the column add and the backfill don't have to live in two migrations.
--
-- Backfill strategy: per (tenantId, year-of-createdAt), assign sequential
-- 3-digit codes ordered by createdAt asc, with id asc as a tiebreaker for
-- the unlikely case of two rows sharing a millisecond-precision timestamp.
-- The correlated COUNT subquery is deterministic — each row's sequence is
-- a function of its own (tenantId, createdAt, id), so the running update
-- is order-independent.
--
-- Wrapped in BEGIN/COMMIT so a duplicate-reference collision (which
-- shouldn't happen given the deterministic ordering, but is possible if
-- someone hand-edited rows pre-migration) rolls the whole thing back
-- instead of leaving the column added but unindexed.

-- AlterTable
ALTER TABLE "CAPA" ADD COLUMN "reference" TEXT;

BEGIN;

UPDATE "CAPA"
SET "reference" = 'CAPA-' || strftime('%Y', datetime("createdAt" / 1000, 'unixepoch')) || '-' || printf('%03d', (
  SELECT COUNT(*) + 1
  FROM "CAPA" AS prev
  WHERE prev."tenantId" = "CAPA"."tenantId"
    AND strftime('%Y', datetime(prev."createdAt" / 1000, 'unixepoch')) = strftime('%Y', datetime("CAPA"."createdAt" / 1000, 'unixepoch'))
    AND (prev."createdAt" < "CAPA"."createdAt"
      OR (prev."createdAt" = "CAPA"."createdAt" AND prev."id" < "CAPA"."id"))
))
WHERE "reference" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_reference_key" ON "CAPA"("reference");

COMMIT;
