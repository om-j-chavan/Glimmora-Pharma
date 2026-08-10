-- ⚠️ UNVERIFIED — finding-closure signing built without DB access. MUST be
-- verified against Postgres before deploy: mint a FINDING_CLOSURE signature,
-- mutate an input, confirm verifyFindingClosure detects drift, and confirm all
-- existing recordTypes still verify unchanged. Do NOT deploy until this passes.
--
-- ⚠️ NOT APPLIED to dev.db. Apply it when you want to exercise the signed close
-- locally (Part 2). Until then the column is absent locally and any Prisma query
-- selecting it will fail — same failure mode as the closedBy/closedDate/
-- closureNotes patch before it was applied.
--
-- DEV-ONLY (SQLite): Part 11 e-signature link for a finding closure, applied to
-- dev.db without a full `prisma db push`. Prod source of truth:
-- prisma/migrations/20260809140000_add_finding_closure_signature/migration.sql.
--
-- NOTE: SQLite has no `ADD COLUMN IF NOT EXISTS`. Re-running a statement that
-- already applied fails with "duplicate column name" — that error is safe to
-- ignore; it means the column is already there.

ALTER TABLE "Finding" ADD COLUMN "closureSignatureId" TEXT;

-- Optional 1:1 — a SignedRecord backs at most one finding closure.
CREATE UNIQUE INDEX IF NOT EXISTS "Finding_closureSignatureId_key"
  ON "Finding"("closureSignatureId");
