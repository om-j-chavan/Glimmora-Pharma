-- DropForeignKey
ALTER TABLE "CAPADocument" DROP CONSTRAINT "CAPADocument_capaId_fkey";

-- DropForeignKey
ALTER TABLE "RAIDItem" DROP CONSTRAINT "RAIDItem_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ReadinessCard" DROP CONSTRAINT "ReadinessCard_inspectionId_fkey";

-- AlterTable
ALTER TABLE "CAPA" ADD COLUMN     "raisedFromRiskId" TEXT;

-- AlterTable
ALTER TABLE "Deviation" ADD COLUMN     "priority" TEXT,
ADD COLUMN     "raisedFromRiskId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "uploadedById" TEXT;

-- AlterTable
ALTER TABLE "FDA483Event" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "currentStage" TEXT NOT NULL DEFAULT 'intake',
ADD COLUMN     "outcomeNote" TEXT,
ADD COLUMN     "outcomeSignatureId" TEXT,
ADD COLUMN     "outcomeType" TEXT;

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "completionNotes" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "raisedFromRiskId" TEXT,
ADD COLUMN     "reworkAt" TIMESTAMP(3),
ADD COLUMN     "reworkById" TEXT,
ADD COLUMN     "reworkReason" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "GxPSystem" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "durationMonths" INTEGER NOT NULL DEFAULT 12,
DROP COLUMN "tier",
ADD COLUMN     "tier" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Site" DROP COLUMN "risk";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "regulatoryRegion" TEXT;

-- DropTable
DROP TABLE "CAPADocument";

-- DropTable
DROP TABLE "RAIDItem";

-- DropTable
DROP TABLE "ReadinessCard";

-- DropEnum
DROP TYPE "PlanTier";

-- CreateTable
CREATE TABLE "RegulatoryRegion" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "aliasOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT,
    "maxAccounts" INTEGER NOT NULL DEFAULT 5,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "trialStartDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "trialConverted" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "currentYear" INTEGER NOT NULL DEFAULT 1,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 7,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL,
    "priceYearly" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "maxAccounts" INTEGER NOT NULL DEFAULT 5,
    "maxSites" INTEGER NOT NULL DEFAULT 1,
    "features" TEXT,
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "companyName" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "language" TEXT NOT NULL DEFAULT 'en',
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'yearly',
    "razorpayOrderId" TEXT,
    "orderAmount" INTEGER,
    "orderCurrency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpaySignature" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "bank" TEXT,
    "wallet" TEXT,
    "vpa" TEXT,
    "description" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "errorCode" TEXT,
    "errorDescription" TEXT,
    "errorSource" TEXT,
    "errorStep" TEXT,
    "errorReason" TEXT,
    "invoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviationTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviationId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "assigneeId" TEXT,
    "message" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completionNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reworkReason" TEXT,
    "reworkAt" TIMESTAMP(3),
    "reworkById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "DeviationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviationTaskMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviationTaskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationStageTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "validationStageId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "assigneeId" TEXT,
    "message" TEXT NOT NULL,
    "findingRef" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completionNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reworkReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "ValidationStageTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "likelihood" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdBy" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "mitigationPlan" TEXT,
    "convertedToType" TEXT,
    "convertedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementDecision" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "attendees" TEXT NOT NULL,
    "chairedById" TEXT,
    "createdById" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "ManagementDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionItem" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "evidenceLink" TEXT,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "description" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "currentHandler" TEXT NOT NULL DEFAULT 'super_admin',
    "escalatedAt" TIMESTAMP(3),
    "escalatedById" TEXT,
    "escalatedByName" TEXT,
    "relatedModule" TEXT,
    "relatedRecordId" TEXT,
    "relatedRecordRef" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "resolutionSummary" TEXT,
    "resolutionCategory" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "autoCloseAfter" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "reopenReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "appVersion" TEXT,
    "originUrl" TEXT,
    "userAgent" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedById" TEXT,
    "lastEditedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketActivity" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "summary" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Framework" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platformEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAllRegions" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "aliasOfId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Framework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkRegion" (
    "id" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "region" TEXT NOT NULL,

    CONSTRAINT "FrameworkRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFramework" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRoleLimit" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanRoleLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRoleLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "cap" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRoleLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRegion_value_key" ON "RegulatoryRegion"("value");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_customerCode_key" ON "PendingSignup"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_adminEmail_key" ON "PendingSignup"("adminEmail");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_adminUsername_key" ON "PendingSignup"("adminUsername");

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_razorpayOrderId_key" ON "PendingSignup"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "FindingMessage_tenantId_findingId_idx" ON "FindingMessage"("tenantId", "findingId");

-- CreateIndex
CREATE INDEX "DeviationTask_tenantId_deviationId_idx" ON "DeviationTask"("tenantId", "deviationId");

-- CreateIndex
CREATE INDEX "DeviationTask_assigneeId_idx" ON "DeviationTask"("assigneeId");

-- CreateIndex
CREATE INDEX "DeviationTask_deletedAt_idx" ON "DeviationTask"("deletedAt");

-- CreateIndex
CREATE INDEX "DeviationTaskMessage_tenantId_taskId_idx" ON "DeviationTaskMessage"("tenantId", "taskId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_tenantId_validationStageId_idx" ON "ValidationStageTask"("tenantId", "validationStageId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_assigneeId_idx" ON "ValidationStageTask"("assigneeId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_systemId_idx" ON "ValidationStageTask"("systemId");

-- CreateIndex
CREATE INDEX "ValidationStageTask_deletedAt_idx" ON "ValidationStageTask"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_reference_key" ON "Risk"("reference");

-- CreateIndex
CREATE INDEX "Risk_tenantId_status_idx" ON "Risk"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Risk_tenantId_ownerId_idx" ON "Risk"("tenantId", "ownerId");

-- CreateIndex
CREATE INDEX "Risk_tenantId_createdById_idx" ON "Risk"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "Risk_tenantId_convertedToType_convertedToId_idx" ON "Risk"("tenantId", "convertedToType", "convertedToId");

-- CreateIndex
CREATE INDEX "Risk_deletedAt_idx" ON "Risk"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementDecision_reference_key" ON "ManagementDecision"("reference");

-- CreateIndex
CREATE INDEX "ManagementDecision_tenantId_meetingDate_idx" ON "ManagementDecision"("tenantId", "meetingDate");

-- CreateIndex
CREATE INDEX "ManagementDecision_tenantId_createdById_idx" ON "ManagementDecision"("tenantId", "createdById");

-- CreateIndex
CREATE INDEX "ManagementDecision_deletedAt_idx" ON "ManagementDecision"("deletedAt");

-- CreateIndex
CREATE INDEX "DecisionItem_decisionId_idx" ON "DecisionItem"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionItem_ownerId_idx" ON "DecisionItem"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_status_idx" ON "Ticket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_slaDueAt_idx" ON "Ticket"("slaDueAt");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_createdAt_idx" ON "Ticket"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_createdAt_idx" ON "TicketActivity"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_key" ON "Framework"("key");

-- CreateIndex
CREATE INDEX "FrameworkRegion_region_idx" ON "FrameworkRegion"("region");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkRegion_frameworkId_region_key" ON "FrameworkRegion"("frameworkId", "region");

-- CreateIndex
CREATE INDEX "TenantFramework_tenantId_idx" ON "TenantFramework"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFramework_tenantId_frameworkId_key" ON "TenantFramework"("tenantId", "frameworkId");

-- CreateIndex
CREATE INDEX "PlanRoleLimit_planId_idx" ON "PlanRoleLimit"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanRoleLimit_planId_role_key" ON "PlanRoleLimit"("planId", "role");

-- CreateIndex
CREATE INDEX "TenantRoleLimit_tenantId_idx" ON "TenantRoleLimit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRoleLimit_tenantId_role_key" ON "TenantRoleLimit"("tenantId", "role");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedById_idx" ON "Document"("tenantId", "uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "FDA483Event_outcomeSignatureId_key" ON "FDA483Event"("outcomeSignatureId");

-- AddForeignKey
ALTER TABLE "RegulatoryRegion" ADD CONSTRAINT "RegulatoryRegion_aliasOfId_fkey" FOREIGN KEY ("aliasOfId") REFERENCES "RegulatoryRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingSignup" ADD CONSTRAINT "PendingSignup_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_raisedFromRiskId_fkey" FOREIGN KEY ("raisedFromRiskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingMessage" ADD CONSTRAINT "FindingMessage_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CAPA" ADD CONSTRAINT "CAPA_raisedFromRiskId_fkey" FOREIGN KEY ("raisedFromRiskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deviation" ADD CONSTRAINT "Deviation_raisedFromRiskId_fkey" FOREIGN KEY ("raisedFromRiskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTask" ADD CONSTRAINT "DeviationTask_reworkById_fkey" FOREIGN KEY ("reworkById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTaskMessage" ADD CONSTRAINT "DeviationTaskMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviationTaskMessage" ADD CONSTRAINT "DeviationTaskMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "DeviationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FDA483Event" ADD CONSTRAINT "FDA483Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GxPSystem" ADD CONSTRAINT "GxPSystem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationStageTask" ADD CONSTRAINT "ValidationStageTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationStageTask" ADD CONSTRAINT "ValidationStageTask_validationStageId_fkey" FOREIGN KEY ("validationStageId") REFERENCES "ValidationStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationStageTask" ADD CONSTRAINT "ValidationStageTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationStageTask" ADD CONSTRAINT "ValidationStageTask_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationStageTask" ADD CONSTRAINT "ValidationStageTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementDecision" ADD CONSTRAINT "ManagementDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementDecision" ADD CONSTRAINT "ManagementDecision_chairedById_fkey" FOREIGN KEY ("chairedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementDecision" ADD CONSTRAINT "ManagementDecision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItem" ADD CONSTRAINT "DecisionItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ManagementDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItem" ADD CONSTRAINT "DecisionItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Framework" ADD CONSTRAINT "Framework_aliasOfId_fkey" FOREIGN KEY ("aliasOfId") REFERENCES "Framework"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkRegion" ADD CONSTRAINT "FrameworkRegion_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFramework" ADD CONSTRAINT "TenantFramework_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFramework" ADD CONSTRAINT "TenantFramework_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "Framework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRoleLimit" ADD CONSTRAINT "PlanRoleLimit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoleLimit" ADD CONSTRAINT "TenantRoleLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

