-- Record Visibility (Phases 0 + 5.5) — authoritative creator FK.
--
-- Adds a nullable `createdById` User FK to the four record models whose creator
-- was previously stored ONLY as a display-name string (`createdBy`). This lets
-- the shared visibility helper scope reads by creator (rule #1: "creator always
-- sees their record") in addition to assignee + see-all.
--
-- Properties:
--   • ADDITIVE — plain `ADD COLUMN` (nullable) + `ADD CONSTRAINT` FK. Every
--     existing row keeps `createdById = NULL` (fail-closed until backfilled).
--   • ZERO DATA LOSS — no column is dropped, altered, or rewritten.
--   • POSTGRES-SAFE — portable `TEXT` type + `ALTER TABLE … ADD CONSTRAINT …
--     FOREIGN KEY` (no SQLite table-rebuild). `migrate deploy` applies it
--     cleanly to a fresh/prod Postgres DB (the four tables exist since `init`).
--   • The existing `createdBy` display-name string is retained (dual-field,
--     mirroring Deviation.createdById).
--
-- NOT INCLUDED: the data backfill (resolving `createdBy` name → a User id) is a
-- separate, idempotent DATA step run out-of-band (see the phase reports) — this
-- schema migration is columns + constraints only.

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "createdById" TEXT;
ALTER TABLE "GxPSystem" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "createdById" TEXT;
ALTER TABLE "FDA483Event" ADD COLUMN "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GxPSystem" ADD CONSTRAINT "GxPSystem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FDA483Event" ADD CONSTRAINT "FDA483Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
