-- Record Visibility (Phases 0 + 5.5) — authoritative creator FK.
--
-- Adds a nullable `createdById` User FK to the four record models whose creator
-- was previously stored ONLY as a display-name string (`createdBy`). This lets
-- the shared visibility helper scope reads by creator (rule #1: "creator always
-- sees their record") in addition to assignee + see-all.
--
-- Properties:
--   • ADDITIVE — nullable `ADD COLUMN` with the FK declared INLINE as a
--     `REFERENCES` clause. Every existing row keeps `createdById = NULL`
--     (fail-closed until backfilled).
--   • ZERO DATA LOSS — no column is dropped, altered, or rewritten.
--   • PORTABLE (SQLite + PostgreSQL) — both engines accept
--     `ALTER TABLE … ADD COLUMN … REFERENCES … ON DELETE SET NULL ON UPDATE CASCADE`
--     for a NULL-defaulted column, so a single migration file applies on dev
--     (SQLite) and CI/prod (Postgres) alike. On PostgreSQL the inline FK is
--     auto-named `<Table>_createdById_fkey` — identical to the constraint names
--     the previous revision declared explicitly.
--       NOTE: the previous revision used a separate `ALTER TABLE … ADD CONSTRAINT
--       … FOREIGN KEY`, which is Postgres-only — SQLite cannot add a standalone
--       FK to an existing table (it requires a full table rebuild), so that form
--       broke every `prisma migrate dev` run on the SQLite dev database.
--   • The existing `createdBy` display-name string is retained (dual-field,
--     mirroring Deviation.createdById).
--
-- NOT INCLUDED: the data backfill (resolving `createdBy` name → a User id) is a
-- separate, idempotent DATA step run out-of-band (see the phase reports) — this
-- schema migration is columns + constraints only.

-- AlterTable — add the nullable creator FK column with an inline FOREIGN KEY.
ALTER TABLE "Finding" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GxPSystem" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FDA483Event" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
