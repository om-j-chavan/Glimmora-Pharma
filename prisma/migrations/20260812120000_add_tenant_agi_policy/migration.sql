-- Tenant-scoped AI agent policy.
--
-- Replaces a browser-local Redux slice (persisted to the `glimmora-state`
-- localStorage blob) that no server ever read, so "disabling" an agent had no
-- effect on any endpoint. Enforcement now happens in the Next.js AI proxy,
-- which is the single doorway every browser AI call passes through.
--
-- Defaults match the previous client-side defaults (all agents on, confidence
-- 72), so an existing tenant's behaviour is unchanged by this migration; rows
-- are created lazily on first read.

CREATE TABLE "TenantAgiPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deviationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fda483Enabled" BOOLEAN NOT NULL DEFAULT true,
    "driftEnabled" BOOLEAN NOT NULL DEFAULT true,
    "regulatoryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supplierEnabled" BOOLEAN NOT NULL DEFAULT true,
    "confidence" INTEGER NOT NULL DEFAULT 72,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAgiPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantAgiPolicy_tenantId_key" ON "TenantAgiPolicy"("tenantId");
CREATE INDEX "TenantAgiPolicy_tenantId_idx" ON "TenantAgiPolicy"("tenantId");

ALTER TABLE "TenantAgiPolicy"
  ADD CONSTRAINT "TenantAgiPolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
