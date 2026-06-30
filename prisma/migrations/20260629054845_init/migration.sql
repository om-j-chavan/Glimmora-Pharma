-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer_admin',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sessionsValidAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "displayName" TEXT,
    "maxUsers" INTEGER NOT NULL,
    "maxSites" INTEGER NOT NULL,
    "minRetentionYears" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 12,
    "startDate" DATETIME NOT NULL,
    "expiryDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Plan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location" TEXT,
    "gmpScope" TEXT,
    "risk" TEXT NOT NULL DEFAULT 'MEDIUM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Site_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gxpSignatory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "User_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "requirement" TEXT NOT NULL,
    "purpose" TEXT,
    "area" TEXT NOT NULL,
    "framework" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "owner" TEXT NOT NULL,
    "targetDate" DATETIME,
    "rcaMethod" TEXT,
    "rcaDetail" TEXT,
    "rootCause" TEXT,
    "evidenceLink" TEXT,
    "linkedCAPAId" TEXT,
    "createdBy" TEXT NOT NULL,
    "previousCAPAId" TEXT,
    "systemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "Finding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Finding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Finding_previousCAPAId_fkey" FOREIGN KEY ("previousCAPAId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FindingEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedByName" TEXT NOT NULL,
    "editedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "changes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FindingEdit_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "findingId" TEXT,
    "systemId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rca" TEXT,
    "rcaMethod" TEXT,
    "rcaDetail" TEXT,
    "correctiveActions" TEXT,
    "alignmentStatus" TEXT,
    "alignmentReviewedBy" TEXT,
    "alignmentReviewedById" TEXT,
    "alignmentReviewedAt" DATETIME,
    "alignmentNotes" TEXT,
    "alignmentOverrideBy" TEXT,
    "alignmentOverrideById" TEXT,
    "alignmentOverrideAt" DATETIME,
    "alignmentOverrideReason" TEXT,
    "rcaApproved" BOOLEAN,
    "rcaReviewedBy" TEXT,
    "rcaReviewedById" TEXT,
    "rcaReviewedAt" DATETIME,
    "rcaReviewNotes" TEXT,
    "rcaOverrideBy" TEXT,
    "rcaOverrideById" TEXT,
    "rcaOverrideAt" DATETIME,
    "rcaOverrideReason" TEXT,
    "verifiedBy" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "verificationNotes" TEXT,
    "verificationSignatureId" TEXT,
    "effectivenessCheck" BOOLEAN NOT NULL DEFAULT true,
    "effectivenessDate" DATETIME,
    "effectivenessReviewedAt" DATETIME,
    "effectivenessVerdict" TEXT,
    "effectivenessReviewedBy" TEXT,
    "effectivenessReviewedById" TEXT,
    "effectivenessReviewNotes" TEXT,
    "effectivenessSignatureId" TEXT,
    "diGate" BOOLEAN NOT NULL DEFAULT false,
    "diGateStatus" TEXT,
    "diGateNotes" TEXT,
    "diGateReviewedBy" TEXT,
    "diGateReviewDate" DATETIME,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "ccBlockOverrideReason" TEXT,
    "ccBlockOverrideById" TEXT,
    "ccBlockOverrideByName" TEXT,
    "ccBlockOverrideAt" DATETIME,
    "closureSignatureId" TEXT,
    "deviationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT,
    "ownerId" TEXT,
    "rejectionReason" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "CAPA_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPA_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_verificationSignatureId_fkey" FOREIGN KEY ("verificationSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_effectivenessSignatureId_fkey" FOREIGN KEY ("effectivenessSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_deviationId_fkey" FOREIGN KEY ("deviationId") REFERENCES "Deviation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPA_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPAActionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reworkReason" TEXT,
    "reworkRequestedById" TEXT,
    "reworkRequestedAt" DATETIME,
    "completedBy" TEXT,
    "completedById" TEXT,
    "completedAt" DATETIME,
    "completionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "CAPAActionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_reworkRequestedById_fkey" FOREIGN KEY ("reworkRequestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAActionItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPADocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capaId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" TEXT,
    "fileType" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'current',
    "uploadedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPADocument_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deviation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "detectedDate" DATETIME NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'open',
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "rcaMethod" TEXT,
    "patientSafetyImpact" TEXT,
    "productQualityImpact" TEXT,
    "regulatoryImpact" TEXT,
    "batchesAffected" TEXT,
    "linkedCAPAId" TEXT,
    "closedBy" TEXT,
    "closedDate" DATETIME,
    "closureNotes" TEXT,
    "closureSignatureId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdById" TEXT,
    "previousCAPAId" TEXT,
    "rcaData" TEXT,
    "investigationCompletedAt" DATETIME,
    "investigationCompletedById" TEXT,
    "capaDecisionMade" BOOLEAN NOT NULL DEFAULT false,
    "capaDecisionRequired" BOOLEAN,
    "capaDecisionReason" TEXT,
    "capaDecisionAt" DATETIME,
    "capaDecisionById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "Deviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deviation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_closureSignatureId_fkey" FOREIGN KEY ("closureSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_investigationCompletedById_fkey" FOREIGN KEY ("investigationCompletedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_capaDecisionById_fkey" FOREIGN KEY ("capaDecisionById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Deviation_previousCAPAId_fkey" FOREIGN KEY ("previousCAPAId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FDA483Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "inspectionDate" DATETIME NOT NULL,
    "responseDeadline" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "responseDraft" TEXT,
    "agiDraft" TEXT,
    "submittedAt" DATETIME,
    "submittedBy" TEXT,
    "signatureMeaning" TEXT,
    "closedAt" DATETIME,
    "responseSignatureId" TEXT,
    "inspectionEndDate" DATETIME,
    "leadInvestigator" TEXT,
    "internalOwnerId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FDA483Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_responseSignatureId_fkey" FOREIGN KEY ("responseSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Event_internalOwnerId_fkey" FOREIGN KEY ("internalOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FDA483Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" TEXT,
    "type" TEXT NOT NULL DEFAULT 'response',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FDA483Document_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "FDA483Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FDA483Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "eventId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "area" TEXT,
    "regulation" TEXT,
    "rcaMethod" TEXT,
    "rootCause" TEXT,
    "capaId" TEXT,
    "responseText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FDA483Observation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "FDA483Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FDA483Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueDate" DATETIME,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "reference" TEXT,
    "observationId" TEXT,
    "capaId" TEXT,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completionNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "FDA483Commitment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "FDA483Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "FDA483Observation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FDA483Commitment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FDA483CommitmentDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    CONSTRAINT "FDA483CommitmentDocument_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "FDA483Commitment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FDA483CommitmentDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GxPSystem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "vendor" TEXT,
    "version" TEXT,
    "gxpRelevance" TEXT NOT NULL DEFAULT 'Major',
    "part11Status" TEXT NOT NULL DEFAULT 'N/A',
    "annex11Status" TEXT NOT NULL DEFAULT 'N/A',
    "gamp5Category" TEXT NOT NULL DEFAULT '4',
    "validationStatus" TEXT NOT NULL DEFAULT 'Not Started',
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "siteId" TEXT,
    "intendedUse" TEXT,
    "gxpScope" TEXT,
    "plannedActions" TEXT,
    "owner" TEXT,
    "createdBy" TEXT NOT NULL,
    "patientSafetyRisk" TEXT,
    "productQualityImpact" TEXT,
    "regulatoryExposure" TEXT,
    "diImpact" TEXT,
    "criticalFunctions" TEXT,
    "riskFactors" TEXT,
    "lastValidated" DATETIME,
    "nextReview" DATETIME,
    "remediationPlan" TEXT,
    "remediationStatus" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletionReason" TEXT,
    "statusManuallySet" BOOLEAN NOT NULL DEFAULT false,
    "statusManualReason" TEXT,
    "statusManuallySetAt" DATETIME,
    "statusManuallySetByName" TEXT,
    "reference" TEXT,
    "signedOffAt" DATETIME,
    "signedOffById" TEXT,
    "signedOffByName" TEXT,
    "signedOffReason" TEXT,
    "signedOffContentHash" TEXT,
    "signedOffSignatureId" TEXT,
    "signedOffPart11Compliant" BOOLEAN,
    "signedOffAnnex11Compliant" BOOLEAN,
    "signedOffRtmCoverage" REAL,
    "signedOffStagesApproved" INTEGER,
    "signedOffStagesTotal" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GxPSystem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "submittedBy" TEXT,
    "submittedDate" DATETIME,
    "approvedBy" TEXT,
    "approvedDate" DATETIME,
    "rejectedBy" TEXT,
    "rejectedDate" DATETIME,
    "rejectionReason" TEXT,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ValidationStage_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "validationStageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "retainUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageDocument_validationStageId_fkey" FOREIGN KEY ("validationStageId") REFERENCES "ValidationStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RTMEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemId" TEXT NOT NULL,
    "ursId" TEXT NOT NULL,
    "reference" TEXT,
    "ursRequirement" TEXT NOT NULL,
    "ursRegulation" TEXT,
    "ursPriority" TEXT NOT NULL DEFAULT 'high',
    "fsReference" TEXT,
    "fsStatus" TEXT NOT NULL DEFAULT 'missing',
    "dsReference" TEXT,
    "dsStatus" TEXT NOT NULL DEFAULT 'na',
    "iqTestId" TEXT,
    "iqResult" TEXT,
    "oqTestId" TEXT,
    "oqResult" TEXT,
    "pqTestId" TEXT,
    "pqResult" TEXT,
    "evidenceStatus" TEXT NOT NULL DEFAULT 'missing',
    "traceabilityStatus" TEXT NOT NULL DEFAULT 'broken',
    "linkedFindingId" TEXT,
    "notes" TEXT,
    "findingId" TEXT,
    "capaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RTMEntry_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RTMEntry_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RTMEntry_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "systemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "owner" TEXT,
    "completionType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapActivity_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "GxPSystem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "fileSize" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "linkedModule" TEXT,
    "linkedRecordId" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceModule" TEXT,
    "sourceId" TEXT,
    "siteId" TEXT,
    "category" TEXT,
    "sha256" TEXT,
    "storageKey" TEXT,
    "originalFileName" TEXT,
    "fileExtension" TEXT,
    "retainUntil" DATETIME,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "notes" TEXT,
    "uploadedAt" DATETIME,
    "approvalSignatureId" TEXT,
    CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_approvalSignatureId_fkey" FOREIGN KEY ("approvalSignatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RAIDItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "impact" TEXT,
    "mitigation" TEXT,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "reopenedBy" TEXT,
    "reopenedAt" DATETIME,
    "reopenReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RAIDItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "siteName" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "expectedDate" DATETIME,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "inspectionLead" TEXT,
    "notes" TEXT,
    "linkedFDA483Id" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Inspection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadinessAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "owner" TEXT,
    "dueDate" DATETIME,
    "completedBy" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReadinessAction_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "duration" INTEGER,
    "scheduledAt" DATETIME,
    "participants" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "score" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Simulation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userRole" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT,
    "recordTitle" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadinessCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inspectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "owner" TEXT,
    "dueDate" DATETIME,
    "completedBy" TEXT,
    "completedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReadinessCard_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "score" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingRecord_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capaId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "naReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lockedSignatureId" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceNoteVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceItemId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "statusAtTime" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceNoteVersion_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "retainUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedById" TEXT,
    "actionItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceFile_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvidenceFile_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "CAPAActionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPAEffectivenessCriterion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetMetric" TEXT NOT NULL,
    "measurementMethod" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "monitoringPeriod" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lockedSignatureId" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    CONSTRAINT "CAPAEffectivenessCriterion_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignedRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signatureMeaning" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentSummary" TEXT NOT NULL,
    "passwordVerifiedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CAPAApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "signatureId" TEXT,
    "revokedAt" DATETIME,
    "revokedSignatureId" TEXT,
    CONSTRAINT "CAPAApproval_signatureId_fkey" FOREIGN KEY ("signatureId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAApproval_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPAComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "parentId" TEXT,
    "actionItemId" TEXT,
    "body" TEXT NOT NULL,
    "isConcern" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedComment" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CAPAComment_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CAPAComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CAPAComment_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "CAPAActionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeControl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "impactAssessment" TEXT,
    "affectedSystems" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "owner" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "targetImplementationDate" DATETIME,
    "actualImplementationDate" DATETIME,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "closedByName" TEXT,
    "deletedAt" DATETIME,
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletionReason" TEXT,
    "latestSignedTransitionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeControl_latestSignedTransitionId_fkey" FOREIGN KEY ("latestSignedTransitionId") REFERENCES "SignedRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CAPAChangeControlLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "capaId" TEXT NOT NULL,
    "changeControlId" TEXT NOT NULL,
    "initiatedFrom" TEXT NOT NULL,
    "linkRationale" TEXT,
    "linkedById" TEXT NOT NULL,
    "linkedByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CAPAChangeControlLink_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CAPAChangeControlLink_changeControlId_fkey" FOREIGN KEY ("changeControlId") REFERENCES "ChangeControl" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailOTP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "tenantId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkPath" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'New',
    "description" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "relatedModule" TEXT,
    "relatedRecordId" TEXT,
    "relatedRecordRef" TEXT,
    "slaDueAt" DATETIME,
    "resolutionSummary" TEXT,
    "resolutionCategory" TEXT,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "autoCloseAfter" DATETIME,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "reopenReason" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "appVersion" TEXT,
    "originUrl" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT,
    "summary" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_customerCode_key" ON "Tenant"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_username_key" ON "Tenant"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_tenantId_key" ON "Plan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_tenantId_name_key" ON "Site"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Site_tenantId_code_key" ON "Site"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_reference_key" ON "Finding"("reference");

-- CreateIndex
CREATE INDEX "Finding_deletedAt_idx" ON "Finding"("deletedAt");

-- CreateIndex
CREATE INDEX "FindingEdit_findingId_idx" ON "FindingEdit"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_reference_key" ON "CAPA"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_findingId_key" ON "CAPA"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_verificationSignatureId_key" ON "CAPA"("verificationSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_effectivenessSignatureId_key" ON "CAPA"("effectivenessSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_closureSignatureId_key" ON "CAPA"("closureSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPA_deviationId_key" ON "CAPA"("deviationId");

-- CreateIndex
CREATE INDEX "CAPA_effectivenessDate_idx" ON "CAPA"("effectivenessDate");

-- CreateIndex
CREATE INDEX "CAPA_deletedAt_idx" ON "CAPA"("deletedAt");

-- CreateIndex
CREATE INDEX "CAPAActionItem_tenantId_capaId_idx" ON "CAPAActionItem"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAActionItem_capaId_sequence_idx" ON "CAPAActionItem"("capaId", "sequence");

-- CreateIndex
CREATE INDEX "CAPAActionItem_dueDate_idx" ON "CAPAActionItem"("dueDate");

-- CreateIndex
CREATE INDEX "CAPAActionItem_ownerId_idx" ON "CAPAActionItem"("ownerId");

-- CreateIndex
CREATE INDEX "CAPAActionItem_deletedAt_idx" ON "CAPAActionItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deviation_reference_key" ON "Deviation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Deviation_closureSignatureId_key" ON "Deviation"("closureSignatureId");

-- CreateIndex
CREATE INDEX "Deviation_deletedAt_idx" ON "Deviation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FDA483Event_responseSignatureId_key" ON "FDA483Event"("responseSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "FDA483Observation_reference_key" ON "FDA483Observation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "FDA483Commitment_reference_key" ON "FDA483Commitment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "GxPSystem_reference_key" ON "GxPSystem"("reference");

-- CreateIndex
CREATE INDEX "StageDocument_validationStageId_idx" ON "StageDocument"("validationStageId");

-- CreateIndex
CREATE INDEX "StageDocument_tenantId_uploadedAt_idx" ON "StageDocument"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "StageDocument_deletedAt_idx" ON "StageDocument"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RTMEntry_reference_key" ON "RTMEntry"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Document_approvalSignatureId_key" ON "Document"("approvalSignatureId");

-- CreateIndex
CREATE INDEX "Document_tenantId_sourceModule_sourceId_idx" ON "Document"("tenantId", "sourceModule", "sourceId");

-- CreateIndex
CREATE INDEX "Document_tenantId_uploadedAt_idx" ON "Document"("tenantId", "uploadedAt");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_capaId_idx" ON "EvidenceItem"("capaId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceItem_capaId_category_key" ON "EvidenceItem"("capaId", "category");

-- CreateIndex
CREATE INDEX "EvidenceNoteVersion_evidenceItemId_idx" ON "EvidenceNoteVersion"("evidenceItemId");

-- CreateIndex
CREATE INDEX "EvidenceFile_evidenceItemId_idx" ON "EvidenceFile"("evidenceItemId");

-- CreateIndex
CREATE INDEX "EvidenceFile_deletedAt_idx" ON "EvidenceFile"("deletedAt");

-- CreateIndex
CREATE INDEX "EvidenceFile_actionItemId_idx" ON "EvidenceFile"("actionItemId");

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_tenantId_capaId_idx" ON "CAPAEffectivenessCriterion"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_capaId_idx" ON "CAPAEffectivenessCriterion"("capaId");

-- CreateIndex
CREATE INDEX "CAPAEffectivenessCriterion_deletedAt_idx" ON "CAPAEffectivenessCriterion"("deletedAt");

-- CreateIndex
CREATE INDEX "SignedRecord_recordType_recordId_idx" ON "SignedRecord"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "SignedRecord_tenantId_signerId_idx" ON "SignedRecord"("tenantId", "signerId");

-- CreateIndex
CREATE INDEX "SignedRecord_createdAt_idx" ON "SignedRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CAPAApproval_signatureId_key" ON "CAPAApproval"("signatureId");

-- CreateIndex
CREATE INDEX "CAPAApproval_tenantId_capaId_idx" ON "CAPAApproval"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAApproval_capaId_idx" ON "CAPAApproval"("capaId");

-- CreateIndex
CREATE INDEX "CAPAApproval_revokedAt_idx" ON "CAPAApproval"("revokedAt");

-- CreateIndex
CREATE INDEX "CAPAComment_capaId_createdAt_idx" ON "CAPAComment"("capaId", "createdAt");

-- CreateIndex
CREATE INDEX "CAPAComment_tenantId_capaId_idx" ON "CAPAComment"("tenantId", "capaId");

-- CreateIndex
CREATE INDEX "CAPAComment_parentId_idx" ON "CAPAComment"("parentId");

-- CreateIndex
CREATE INDEX "CAPAComment_actionItemId_idx" ON "CAPAComment"("actionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeControl_reference_key" ON "ChangeControl"("reference");

-- CreateIndex
CREATE INDEX "ChangeControl_tenantId_status_idx" ON "ChangeControl"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ChangeControl_tenantId_createdAt_idx" ON "ChangeControl"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeControl_deletedAt_idx" ON "ChangeControl"("deletedAt");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_capaId_idx" ON "CAPAChangeControlLink"("capaId");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_changeControlId_idx" ON "CAPAChangeControlLink"("changeControlId");

-- CreateIndex
CREATE INDEX "CAPAChangeControlLink_tenantId_idx" ON "CAPAChangeControlLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CAPAChangeControlLink_capaId_changeControlId_key" ON "CAPAChangeControlLink"("capaId", "changeControlId");

-- CreateIndex
CREATE INDEX "EmailOTP_identifier_tenantId_idx" ON "EmailOTP"("identifier", "tenantId");

-- CreateIndex
CREATE INDEX "EmailOTP_expiresAt_idx" ON "EmailOTP"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_isRead_createdAt_idx" ON "Notification"("recipientUserId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_status_idx" ON "Ticket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");

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
