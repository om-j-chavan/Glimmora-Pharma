-- Gap Assessment — QA finding-closure metadata.
--
-- ADDITIVE ONLY + idempotent. Adds three nullable Finding columns recording WHO
-- closed the finding, WHEN, and the closure message they recorded. Nothing
-- existing is altered or dropped; legacy closed findings keep NULL in all three,
-- which reads correctly as "closed before this metadata was captured".
--
-- ⚠️ THIS CLOSURE IS AUDITED, NOT ELECTRONICALLY SIGNED.
-- Deliberately ABSENT: `closureSignatureId`. The QA close path re-authenticates
-- the actor's password (identity) and writes a paired AuditLog row, but it mints
-- no SignedRecord and computes no content hash — there is no 21 CFR Part 11
-- electronic signature on a finding closure. Adding the signature is separate,
-- deferred work; when it lands it adds `closureSignatureId TEXT UNIQUE` here plus
-- a FINDING_CLOSURE recordType and canonicaliser in src/lib/signing.ts. Until
-- then, no document, report or UI may describe a closed finding as "signed".

ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "closedDate" TIMESTAMP(3);
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "closureNotes" TEXT;
