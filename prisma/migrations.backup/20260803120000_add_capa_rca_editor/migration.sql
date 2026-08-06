-- CAPA lifecycle rework — RCA-authorship FK for separation of duties.
--
-- ADDITIVE ONLY + idempotent. Adds CAPA.rcaEditedById (nullable) — the User who
-- last edited the rca/rcaMethod text — used to enforce editor ≠ approver and
-- closer ≠ RCA author. Nothing existing is altered or dropped; legacy rows keep
-- rcaEditedById = NULL (the author-based SoD checks simply don't apply to them).

ALTER TABLE "CAPA" ADD COLUMN IF NOT EXISTS "rcaEditedById" TEXT;
