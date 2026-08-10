-- ⚠️ UNVERIFIED — single-QA SoD override for finding closure, built without DB
-- access. MUST be verified against Postgres before deploy: close a finding under
-- a waiver, confirm the FindingSODOverride row + FINDING_SOD_OVERRIDE_USED audit
-- land in the SAME transaction as the FINDING_CLOSURE signature, confirm a
-- Critical finding is still refused, and confirm the flag-OFF path still returns
-- the original SoD block message. Do NOT deploy until this passes.
--
-- ⚠️ UNAPPLIED. Never run against any database. Needs a holder of Postgres (Neon)
-- credentials to `prisma migrate deploy`. Stacks on an already-unapplied lineage.
--
-- Gap Assessment — recorded single-QA SoD waivers on a finding closure.
-- 1:1 mirror of DeviationSODOverride (20260803140000_add_deviation_sod_override).
--
-- REUSES Tenant.sodSingleQAOverride — one org attestation already covers CAPA and
-- Deviation; findings join it. No new flag.
--
-- NOTE: signedRecordId is NOT NULL here, unlike the CAPA/Deviation siblings. A
-- finding closure is always signed (reviewFinding mints FINDING_CLOSURE before
-- writing this row), so an unsigned waiver cannot occur.

CREATE TABLE IF NOT EXISTS "FindingSODOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "signedRecordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingSODOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FindingSODOverride_findingId_idx" ON "FindingSODOverride"("findingId");
CREATE INDEX IF NOT EXISTS "FindingSODOverride_tenantId_idx" ON "FindingSODOverride"("tenantId");

ALTER TABLE "FindingSODOverride"
  ADD CONSTRAINT "FindingSODOverride_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FindingSODOverride"
  ADD CONSTRAINT "FindingSODOverride_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
