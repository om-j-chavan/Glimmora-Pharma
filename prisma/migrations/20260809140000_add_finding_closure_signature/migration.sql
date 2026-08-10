-- ⚠️ UNVERIFIED — finding-closure signing built without DB access. MUST be
-- verified against Postgres before deploy: mint a FINDING_CLOSURE signature,
-- mutate an input, confirm verifyFindingClosure detects drift, and confirm all
-- existing recordTypes still verify unchanged. Do NOT deploy until this passes.
--
-- ⚠️ UNAPPLIED. This migration has never been run against any database. It needs
-- a holder of Postgres (Neon) credentials to `prisma migrate deploy`. It stacks
-- on an already-unapplied lineage — see prisma/migrations/.
--
-- Gap Assessment — Part 11 e-signature link for a finding closure.
--
-- ADDITIVE ONLY + idempotent. Adds one nullable, UNIQUE Finding column pointing
-- at the SignedRecord minted when the closure is signed. Mirrors
-- Deviation.closureSignatureId. Nothing existing is altered or dropped; every
-- current finding (closed or not) keeps NULL, which reads correctly as
-- "closed without an electronic signature".
--
-- NOTE: nothing WRITES this column yet. The live close path (reviewFinding) is
-- still AUDITED-NOT-SIGNED; wiring the signature into it is Part 2. Shipping this
-- column early is deliberate — it lets the signing layer and its verifier be
-- reviewed independently of the close-flow change.
--
-- No FK CONSTRAINT is emitted here, matching how Prisma models the optional 1:1
-- (the constraint is added by `prisma migrate` from the schema relation). If your
-- deploy diffs this against `prisma migrate diff`, take the generated version —
-- this file is the intent, not a substitute for a validated diff.

ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "closureSignatureId" TEXT;

-- Optional 1:1 — a SignedRecord backs at most one finding closure.
CREATE UNIQUE INDEX IF NOT EXISTS "Finding_closureSignatureId_key"
  ON "Finding"("closureSignatureId");
