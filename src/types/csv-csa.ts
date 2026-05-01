/**
 * CSV/CSA module types — extracted from the deprecated Redux slices
 * (`systems.slice.ts` + `rtm.slice.ts`) so components can import without
 * coupling to slice files. The shapes and enum values match the slices
 * exactly, so this is a pure relocation: existing code keeps working
 * with no behavior changes.
 *
 * Enum casing intentionally matches what's actually in the database
 * (PascalCase with spaces, e.g. "Validated", "Not Started") rather
 * than lowercase-underscore conventions used in some specs.
 */

import type {
  GxPSystem as PrismaGxPSystem,
  ValidationStage as PrismaValidationStage,
  RTMEntry as PrismaRTMEntry,
  RoadmapActivity as PrismaRoadmapActivity,
} from "@prisma/client";

/* ══════════════════════════════════════
 * SYSTEMS — enums + constants
 * ══════════════════════════════════════ */

export type SystemType = "QMS" | "LIMS" | "ERP" | "CDS" | "SCADA" | "MES" | "CMMS" | "Other";
export type GxPRelevance = "Critical" | "Major" | "Minor";
export type ValidationStatus = "Validated" | "In Progress" | "Overdue" | "Not Started";
export type ComplianceStatus = "Compliant" | "Non-Compliant" | "In Progress" | "N/A";
export type GAMP5Category = "1" | "3" | "4" | "5";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValidationStageKey = "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR";
export type ValidationStageStatus =
  | "not_started"
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "skipped"
  | "complete"
  | "in-progress"
  | "pending";

export const VALIDATION_STAGE_LABELS: Record<ValidationStageKey, string> = {
  URS: "User Requirement Spec",
  FS: "Functional Specification",
  DS: "Design Specification",
  IQ: "Installation Qualification",
  OQ: "Operational Qualification",
  PQ: "Performance Qualification",
  RTR: "Release to Production",
};

export const VALIDATION_STAGE_KEYS: ValidationStageKey[] = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"];

/* ══════════════════════════════════════
 * SYSTEMS — interfaces
 * ══════════════════════════════════════ */

export interface StageDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  version: string;
  status: "draft" | "in_review" | "approved";
  uploadedBy: string;
  uploadedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ValidationStage {
  key: ValidationStageKey;
  status: ValidationStageStatus;
  date?: string;
  targetDate?: string;
  documentName?: string;
  documents?: StageDocument[];
  notes?: string;
  submittedBy?: string;
  submittedDate?: string;
  reviewedBy?: string;
  reviewedDate?: string;
  approvedBy?: string;
  approvedDate?: string;
  rejectedBy?: string;
  rejectedDate?: string;
  rejectionReason?: string;
  completionDate?: string;
  /**
   * Optional Prisma row id — set by `adaptPrismaStage()`.
   * Used by ValidationPanel to address the right row when calling
   * server actions (which take a Prisma `id`, not a stage `key`).
   * Stays optional so non-adapter code constructing ValidationStage
   * objects (e.g. the legacy slice reducers) doesn't break.
   */
  prismaId?: string;
}

export interface GxPSystem {
  id: string;
  tenantId: string;
  name: string;
  type: SystemType;
  vendor: string;
  version: string;
  gxpRelevance: GxPRelevance;
  part11Status: ComplianceStatus;
  annex11Status: ComplianceStatus;
  gamp5Category: GAMP5Category;
  validationStatus: ValidationStatus;
  riskLevel: RiskLevel;
  siteId: string;
  intendedUse: string;
  gxpScope: string;
  criticalFunctions: string;
  riskFactors: string;
  plannedActions: string;
  owner: string;
  lastValidated?: string;
  nextReview?: string;
  validationStages?: ValidationStage[];
  patientSafetyRisk?: RiskLevel;
  productQualityImpact?: RiskLevel;
  regulatoryExposure?: RiskLevel;
  diImpact?: RiskLevel;
  remediationCapaId?: string;
  remediationTargetDate?: string;
  remediationNotes?: string;
  createdAt: string;
}

export type CompletionType = "execution" | "approval";

export interface RoadmapActivity {
  id: string;
  tenantId: string;
  systemId: string;
  title: string;
  type: "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR" | "Risk Assessment" | "Periodic Review";
  status: "Planned" | "In Progress" | "Complete" | "Overdue";
  startDate: string;
  endDate: string;
  completionType?: CompletionType;
  completionCriteria?: string;
  owner: string;
}

/* ══════════════════════════════════════
 * RTM — enums + interfaces
 * ══════════════════════════════════════ */

export type RTMPriority = "critical" | "high" | "medium";
export type LinkStatus = "linked" | "missing" | "na" | "skipped";
export type TestResult = "pass" | "fail" | "pending" | "na";
export type EvidenceStatus = "complete" | "partial" | "missing";
export type TraceabilityStatus = "complete" | "partial" | "broken";

export interface RTMEntry {
  id: string;
  tenantId: string;
  systemId: string;
  systemName: string;
  ursId: string;
  ursRequirement: string;
  ursRegulation: string;
  ursPriority: RTMPriority;
  fsReference?: string;
  fsDescription?: string;
  fsStatus: LinkStatus;
  dsReference?: string;
  dsDescription?: string;
  dsStatus: LinkStatus;
  iqTestId?: string;
  iqTestDescription?: string;
  iqResult?: TestResult;
  iqDocument?: string;
  oqTestId?: string;
  oqTestDescription?: string;
  oqResult?: TestResult;
  oqDocument?: string;
  pqTestId?: string;
  pqTestDescription?: string;
  pqResult?: TestResult;
  pqDocument?: string;
  evidenceDocId?: string;
  evidenceStatus: EvidenceStatus;
  traceabilityStatus: TraceabilityStatus;
  linkedFindingId?: string;
  linkedCAPAId?: string;
}

/* ══════════════════════════════════════
 * Server-component prop adapters
 * ══════════════════════════════════════ */

/** Prisma row + included relations (server-fetched). */
export type SystemFromPrisma = PrismaGxPSystem & {
  validationStages: PrismaValidationStage[];
  rtmEntries: PrismaRTMEntry[];
  roadmapActivities: PrismaRoadmapActivity[];
};

/**
 * Adapt a Prisma GxPSystem (with relations) into the slice `GxPSystem`
 * shape the existing UI is built around.
 *
 * Key field-name mappings (Prisma → slice):
 *   - `stageName`   → `key`           (ValidationStage)
 *   - relations come in pre-included; nested arrays mapped element-wise
 *
 * Schema gaps (slice has, Prisma doesn't) are filled with safe defaults:
 *   - `criticalFunctions`, `riskFactors`, `lastValidated`, `nextReview`
 *   - patient/product/regulatory/DI risk classifications
 *   - remediation tracking (capaId / target date / notes)
 *   - StageDocument arrays (no Prisma model yet)
 *   - RTM description columns + linkedCAPAId (Prisma RTMEntry has only linkedFindingId)
 */
export function adaptPrismaSystem(s: SystemFromPrisma): GxPSystem {
  return {
    id: s.id,
    tenantId: s.tenantId,
    name: s.name,
    type: (s.type as SystemType) ?? "Other",
    vendor: s.vendor ?? "",
    version: s.version ?? "",
    gxpRelevance: (s.gxpRelevance as GxPRelevance) ?? "Major",
    part11Status: (s.part11Status as ComplianceStatus) ?? "N/A",
    annex11Status: (s.annex11Status as ComplianceStatus) ?? "N/A",
    gamp5Category: (s.gamp5Category as GAMP5Category) ?? "4",
    validationStatus: (s.validationStatus as ValidationStatus) ?? "Not Started",
    riskLevel: (s.riskLevel as RiskLevel) ?? "MEDIUM",
    siteId: s.siteId ?? "",
    intendedUse: s.intendedUse ?? "",
    gxpScope: s.gxpScope ?? "",
    criticalFunctions: "",
    riskFactors: "",
    plannedActions: s.plannedActions ?? "",
    owner: s.owner ?? "",
    validationStages: s.validationStages.map(adaptPrismaStage),
    createdAt: s.createdAt.toISOString(),
  };
}

function adaptPrismaStage(s: PrismaValidationStage): ValidationStage {
  return {
    // Schema field is `stageName`; slice uses `key`.
    key: (s.stageName as ValidationStageKey) ?? "URS",
    status: (s.status as ValidationStageStatus) ?? "not_started",
    notes: s.notes ?? undefined,
    submittedBy: s.submittedBy ?? undefined,
    submittedDate: s.submittedDate ? s.submittedDate.toISOString() : undefined,
    approvedBy: s.approvedBy ?? undefined,
    approvedDate: s.approvedDate ? s.approvedDate.toISOString() : undefined,
    rejectedBy: s.rejectedBy ?? undefined,
    rejectionReason: s.rejectionReason ?? undefined,
    documents: [],
    prismaId: s.id,
  };
}

/**
 * Look up a Prisma `ValidationStage.id` from a (slice-shaped) GxPSystem
 * given a stage key (e.g. "URS"). Returns `null` if the stage hasn't been
 * adapted from Prisma data (the slice's reducers don't set `prismaId`).
 *
 * Use this in components that hold the slice-shaped system but need to
 * call server actions that address stages by Prisma id.
 */
export function getStageId(
  system: GxPSystem,
  stageKey: ValidationStageKey,
): string | null {
  const stage = system.validationStages?.find((s) => s.key === stageKey);
  return stage?.prismaId ?? null;
}

/**
 * Flatten roadmap activities across systems into the slice's top-level
 * shape. Slice `RoadmapActivity` requires `tenantId` + `startDate` (string,
 * not optional); Prisma's are nullable — defaults used when null.
 */
export function adaptPrismaRoadmap(systems: SystemFromPrisma[]): RoadmapActivity[] {
  return systems.flatMap((s) =>
    s.roadmapActivities.map((a) => ({
      id: a.id,
      tenantId: s.tenantId,
      systemId: a.systemId,
      title: a.title,
      type: a.type as RoadmapActivity["type"],
      status: (a.status as RoadmapActivity["status"]) ?? "Planned",
      startDate: a.startDate ? a.startDate.toISOString() : "",
      endDate: a.endDate ? a.endDate.toISOString() : "",
      completionType: (a.completionType ?? undefined) as CompletionType | undefined,
      owner: a.owner ?? "",
    })),
  );
}

/**
 * Flatten RTM entries across systems into the slice shape. Slice requires
 * `tenantId` + `systemName`; Prisma RTMEntry has neither — derive from the
 * containing system. Slice has many richer fields (descriptions, doc refs,
 * `linkedCAPAId`); Prisma omits them — defaults to `undefined`.
 */
export function adaptPrismaRTM(systems: SystemFromPrisma[]): RTMEntry[] {
  return systems.flatMap((s) =>
    s.rtmEntries.map((r) => ({
      id: r.id,
      tenantId: s.tenantId,
      systemId: r.systemId,
      systemName: s.name,
      ursId: r.ursId,
      ursRequirement: r.ursRequirement,
      ursRegulation: r.ursRegulation ?? "",
      ursPriority: (r.ursPriority as RTMPriority) ?? "high",
      fsReference: r.fsReference ?? undefined,
      fsStatus: (r.fsStatus as LinkStatus) ?? "missing",
      dsReference: r.dsReference ?? undefined,
      dsStatus: (r.dsStatus as LinkStatus) ?? "na",
      iqTestId: r.iqTestId ?? undefined,
      iqResult: (r.iqResult ?? undefined) as TestResult | undefined,
      oqTestId: r.oqTestId ?? undefined,
      oqResult: (r.oqResult ?? undefined) as TestResult | undefined,
      pqTestId: r.pqTestId ?? undefined,
      pqResult: (r.pqResult ?? undefined) as TestResult | undefined,
      evidenceStatus: (r.evidenceStatus as EvidenceStatus) ?? "missing",
      traceabilityStatus: (r.traceabilityStatus as TraceabilityStatus) ?? "broken",
      linkedFindingId: r.linkedFindingId ?? undefined,
    })),
  );
}

/* ══════════════════════════════════════
 * Stats types
 * ══════════════════════════════════════ */

export interface SystemsStats {
  total: number;
  validated: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  auditTrailEnabled: number;
}

export interface RTMStats {
  total: number;
  complete: number;
  partial: number;
  broken: number;
}
