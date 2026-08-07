-- CSV/CSA sign-off — RTM coverage gate (gate 4) + its documented-exception path.
--
-- ADDITIVE ONLY + idempotent. Adds two nullable GxPSystem columns recording
-- whether a validation sign-off was taken WITHOUT full requirements
-- traceability, and the QA reason for that exception. Nothing existing is
-- altered or dropped.
--
-- Legacy rows (systems signed off before the gate existed) keep both columns
-- NULL. NULL is read as "no override recorded" — identical to false for every
-- display and query — so historical sign-offs are unaffected. Their
-- signedOffContentHash was computed WITHOUT the override field and stays valid:
-- the canonicaliser omits the key entirely when no override applies (see the
-- V1/V2 note in src/lib/signing.ts).

ALTER TABLE "GxPSystem" ADD COLUMN IF NOT EXISTS "signedOffRtmOverride" BOOLEAN;
ALTER TABLE "GxPSystem" ADD COLUMN IF NOT EXISTS "signedOffRtmOverrideReason" TEXT;
