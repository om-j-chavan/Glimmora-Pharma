-- ⚠️ UNVERIFIED — CSV stage-approval SoD override, built without DB access.
-- Requires (1) QA/regulatory policy authorization to enable single-QA stage
-- approval, and (2) Postgres verification before deploy. Waives the ONLY
-- identity control in the CSV validation chain — ceiling is load-bearing.
--
-- Verification checklist before deploy:
--   · approve a stage you submitted under a waiver; confirm the
--     SystemStageSODOverride row + SYSTEM_STAGE_SOD_OVERRIDE_USED audit land in
--     the SAME transaction as the stage approval;
--   · confirm a GAMP Category 5 system is still refused;
--   · confirm a HIGH / CRITICAL riskLevel system is still refused;
--   · confirm the flag-OFF path still returns the ORIGINAL segregation-of-duties
--     message from systems.ts:580, verbatim;
--   · confirm every existing CSV_VALIDATION_SIGNOFF signature still verifies
--     (it must — nothing here is hashed).
--
-- ⚠️ UNAPPLIED. Never run against any database. Needs a holder of Postgres (Neon)
-- credentials to `prisma migrate deploy`. Stacks on an already-unapplied lineage.
--
-- CSV/CSA — recorded single-QA SoD waivers on a validation STAGE APPROVAL.
-- Analogue of FindingSODOverride (20260809160000_add_finding_sod_override),
-- scoped to a ValidationStage instead of a Finding.
--
-- REUSES Tenant.sodSingleQAOverride — one org attestation already covers CAPA,
-- Deviation and Finding; CSV stage approval joins it. No new flag.
--
-- NOTE: there is NO signedRecordId here, unlike all three siblings. Stage
-- approval is not a signed record — approveStage writes approvedBy/approvedById
-- on the stage and mints no SignedRecord. The waiver attaches to the STAGE, so
-- this feature touches no canonicaliser and cannot invalidate an existing
-- CSV_VALIDATION_SIGNOFF.

CREATE TABLE IF NOT EXISTS "SystemStageSODOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemStageSODOverride_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_stageId_idx"  ON "SystemStageSODOverride"("stageId");
CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_systemId_idx" ON "SystemStageSODOverride"("systemId");
CREATE INDEX IF NOT EXISTS "SystemStageSODOverride_tenantId_idx" ON "SystemStageSODOverride"("tenantId");

ALTER TABLE "SystemStageSODOverride"
  ADD CONSTRAINT "SystemStageSODOverride_systemId_fkey"
  FOREIGN KEY ("systemId") REFERENCES "GxPSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SystemStageSODOverride"
  ADD CONSTRAINT "SystemStageSODOverride_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "ValidationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SystemStageSODOverride"
  ADD CONSTRAINT "SystemStageSODOverride_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
