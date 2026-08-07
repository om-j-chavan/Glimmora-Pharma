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
  StageDocument as PrismaStageDocument,
  ValidationStageTask as PrismaValidationStageTask,
} from "@prisma/client";

/* ══════════════════════════════════════
 * SYSTEMS — enums + constants
 * ══════════════════════════════════════ */

export type SystemType = "QMS" | "LIMS" | "ERP" | "CDS" | "SCADA" | "MES" | "CMMS" | "Other";
export type GxPRelevance = "Critical" | "Major" | "Minor";
// "Under Review" + "Validation Failed" added in RUNG 1 for the auto-derive
// state machine (deriveValidationStatus in src/actions/systems.ts).
export type ValidationStatus =
  | "Validated"
  | "In Progress"
  | "Overdue"
  | "Not Started"
  | "Under Review"
  | "Validation Failed";
// RUNG 3K — "Partial" added to close the audit gap (the DB carried a real
// partial-compliance value, formerly "Gaps Identified", backfilled to
// "Partial"). Server-side enforced via a zod enum in src/actions/systems.ts.
export type ComplianceStatus = "Compliant" | "Non-Compliant" | "Partial" | "In Progress" | "N/A";
export type GAMP5Category = "1" | "3" | "4" | "5";

// RUNG 3K — single source of truth for GAMP 5 category dropdown options
// (was duplicated verbatim in AddSystemModal + EditSystemModal). Labels are
// the exact strings those modals used.
export const GAMP5_CATEGORIES = [
  { value: "1", label: "Cat 1 — Infrastructure" },
  { value: "3", label: "Cat 3 — Non-configured" },
  { value: "4", label: "Cat 4 — Configured software" },
  { value: "5", label: "Cat 5 — Custom software" },
] as const;
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValidationStageKey = "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR";
export type ValidationStageStatus =
  | "not_started"
  | "draft"
  // RUNG 2.8 — "in_progress": stage carries evidence (≥1 uploaded doc) but is
  // not yet submitted for QA review. Set by addStageDocument; the honest
  // replacement for "not_started while a document exists".
  | "in_progress"
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

// Stage document shape used by the UI. Mirrors the Prisma StageDocument
// model 1:1 plus a derived `isLocked` flag — set by the adapter when the
// parent stage's status is "approved", letting the UI hide delete buttons
// without re-deriving the rule per render.
export interface StageDocument {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  contentHashSha256: string;
  retainUntil: string;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
  isLocked: boolean;
}

/** A lightweight, assignable rework task raised against a (rejected) stage and
 *  delegated to operational staff. Mirrors the Prisma ValidationStageTask. */
export interface StageReworkTask {
  id: string;
  stageKey: ValidationStageKey;
  systemId: string;
  assignee: string;
  assigneeId?: string;
  message: string;
  findingRef?: string;
  status: "pending" | "in_progress" | "submitted" | "closed" | "rework" | "cancelled";
  completionNotes?: string;
  reworkReason?: string;
  dueDate?: string;
  submittedAt?: string;
  reviewedAt?: string;
  closedAt?: string;
  createdById?: string;
  createdAt: string;
}

export interface ValidationStage {
  key: ValidationStageKey;
  status: ValidationStageStatus;
  documents?: StageDocument[];
  reworkTasks?: StageReworkTask[];
  notes?: string;
  submittedBy?: string;
  // RUNG 2.8 — stable submitter principal id (for the self-approval SoD hint).
  submittedById?: string;
  submittedDate?: string;
  approvedBy?: string;
  approvedDate?: string;
  rejectedBy?: string;
  rejectedDate?: string;
  rejectionReason?: string;
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
  // ── RUNG 1 persistence fields ──
  remediationPlan?: string;
  remediationStatus?: string;
  statusManuallySet?: boolean;
  statusManualReason?: string;
  statusManuallySetAt?: string;
  statusManuallySetByName?: string;
  // RUNG 2.6 — Part 11 validation sign-off snapshot (null until signed off).
  signedOffAt?: string | null;
  signedOffByName?: string | null;
  signedOffReason?: string | null;
  signedOffContentHash?: string | null;
  signedOffPart11Compliant?: boolean | null;
  signedOffAnnex11Compliant?: boolean | null;
  signedOffRtmCoverage?: number | null;
  signedOffStagesApproved?: number | null;
  signedOffStagesTotal?: number | null;
  // Gate-4 exception — true when the sign-off was taken without full RTM
  // traceability under a documented QA reason (both null on legacy sign-offs
  // predating the gate, which read the same as "no override").
  signedOffRtmOverride?: boolean | null;
  signedOffRtmOverrideReason?: string | null;
  reference?: string;
  // RUNG 2 — real FK-hydrated linked findings/CAPAs (system detail page).
  findings?: SystemFinding[];
  capas?: SystemCapa[];
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
  // RUNG 2.8 — generated read-only reference (URS-<SITE_CODE>-<NNNN>).
  reference?: string;
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
  notes?: string;
  // RUNG 2 — real FK links + hydrated refs for deep-linking from the panel.
  findingId?: string;
  capaId?: string;
  findingRef?: { id: string; reference?: string; status: string };
  capaRef?: { id: string; reference?: string; status: string };
}

/* ══════════════════════════════════════
 * Server-component prop adapters
 * ══════════════════════════════════════ */

/** Prisma row + included relations (server-fetched). Stage documents
 *  arrive nested under each ValidationStage — the read-path query in
 *  src/lib/queries/systems.ts filters out soft-deleted rows. */
type ValidationStageWithDocs = PrismaValidationStage & {
  documents: PrismaStageDocument[];
  reworkTasks: PrismaValidationStageTask[];
};

/** RUNG 2 — compact ref to a linked Finding/CAPA (matches the query selects). */
type LinkRef = { id: string; reference: string | null; status: string };
type RTMEntryWithLinks = PrismaRTMEntry & {
  finding: LinkRef | null;
  capa: LinkRef | null;
};
type SystemFindingRow = { id: string; reference: string | null; status: string; requirement: string; severity: string; targetDate: Date | null; createdAt: Date };
type SystemCapaRow = { id: string; reference: string | null; status: string; description: string; risk: string; owner: string; dueDate: Date | null; createdAt: Date };

export type SystemFromPrisma = PrismaGxPSystem & {
  validationStages: ValidationStageWithDocs[];
  rtmEntries: RTMEntryWithLinks[];
  roadmapActivities: PrismaRoadmapActivity[];
  // RUNG 2 — real FK-hydrated linked findings/CAPAs (minimal selects).
  findings: SystemFindingRow[];
  capas: SystemCapaRow[];
};

/** Linked-record shapes surfaced on the system detail page (RUNG 2). */
export interface SystemFinding { id: string; reference?: string; status: string; requirement: string; severity: string; targetDate?: string; createdAt: string; }
export interface SystemCapa { id: string; reference?: string; status: string; description: string; risk: string; owner: string; dueDate?: string; createdAt: string; }

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
    // RUNG 1: read from DB (was hardcoded "" — Finding #2).
    criticalFunctions: s.criticalFunctions ?? "",
    riskFactors: s.riskFactors ?? "",
    plannedActions: s.plannedActions ?? "",
    owner: s.owner ?? "",
    // RUNG 1: persisted risk classifications + requalification dates +
    // remediation + manual-attestation metadata + reference.
    patientSafetyRisk: (s.patientSafetyRisk as RiskLevel | null) ?? undefined,
    productQualityImpact: (s.productQualityImpact as RiskLevel | null) ?? undefined,
    regulatoryExposure: (s.regulatoryExposure as RiskLevel | null) ?? undefined,
    diImpact: (s.diImpact as RiskLevel | null) ?? undefined,
    lastValidated: s.lastValidated ? s.lastValidated.toISOString() : undefined,
    nextReview: s.nextReview ? s.nextReview.toISOString() : undefined,
    remediationPlan: s.remediationPlan ?? undefined,
    remediationStatus: s.remediationStatus ?? undefined,
    statusManuallySet: s.statusManuallySet,
    statusManualReason: s.statusManualReason ?? undefined,
    statusManuallySetAt: s.statusManuallySetAt ? s.statusManuallySetAt.toISOString() : undefined,
    statusManuallySetByName: s.statusManuallySetByName ?? undefined,
    signedOffAt: s.signedOffAt ? s.signedOffAt.toISOString() : null,
    signedOffByName: s.signedOffByName,
    signedOffReason: s.signedOffReason,
    signedOffContentHash: s.signedOffContentHash,
    signedOffPart11Compliant: s.signedOffPart11Compliant,
    signedOffAnnex11Compliant: s.signedOffAnnex11Compliant,
    signedOffRtmCoverage: s.signedOffRtmCoverage,
    signedOffStagesApproved: s.signedOffStagesApproved,
    signedOffStagesTotal: s.signedOffStagesTotal,
    signedOffRtmOverride: s.signedOffRtmOverride,
    signedOffRtmOverrideReason: s.signedOffRtmOverrideReason,
    reference: s.reference ?? undefined,
    // RUNG 2 — FK-hydrated linked findings / CAPAs.
    findings: s.findings.map((f) => ({
      id: f.id, reference: f.reference ?? undefined, status: f.status,
      requirement: f.requirement, severity: f.severity,
      targetDate: f.targetDate ? f.targetDate.toISOString() : undefined,
      createdAt: f.createdAt.toISOString(),
    })),
    capas: s.capas.map((c) => ({
      id: c.id, reference: c.reference ?? undefined, status: c.status,
      description: c.description, risk: c.risk, owner: c.owner,
      dueDate: c.dueDate ? c.dueDate.toISOString() : undefined,
      createdAt: c.createdAt.toISOString(),
    })),
    validationStages: s.validationStages.map(adaptPrismaStage),
    createdAt: s.createdAt.toISOString(),
  };
}

function adaptPrismaStage(s: ValidationStageWithDocs): ValidationStage {
  // Stage is locked once approved — once the lock fires, the UI hides
  // upload + delete affordances, and the server actions reject mutations
  // with the same locked-stage message. Computed once here so every doc
  // in the stage carries the same flag without per-doc re-derivation.
  const isLocked = s.status === "approved";
  return {
    // Schema field is `stageName`; slice uses `key`.
    key: (s.stageName as ValidationStageKey) ?? "URS",
    status: (s.status as ValidationStageStatus) ?? "not_started",
    notes: s.notes ?? undefined,
    submittedBy: s.submittedBy ?? undefined,
    submittedById: s.submittedById ?? undefined,
    submittedDate: s.submittedDate ? s.submittedDate.toISOString() : undefined,
    approvedBy: s.approvedBy ?? undefined,
    approvedDate: s.approvedDate ? s.approvedDate.toISOString() : undefined,
    rejectedBy: s.rejectedBy ?? undefined,
    rejectedDate: s.rejectedDate ? s.rejectedDate.toISOString() : undefined,
    rejectionReason: s.rejectionReason ?? undefined,
    documents: s.documents.map((d) => adaptPrismaStageDocument(d, isLocked)),
    reworkTasks: (s.reworkTasks ?? []).map((t) => adaptPrismaStageTask(t, s.stageName as ValidationStageKey)),
    prismaId: s.id,
  };
}

function adaptPrismaStageTask(t: PrismaValidationStageTask, stageKey: ValidationStageKey): StageReworkTask {
  return {
    id: t.id,
    stageKey,
    systemId: t.systemId,
    assignee: t.assignee,
    assigneeId: t.assigneeId ?? undefined,
    message: t.message,
    findingRef: t.findingRef ?? undefined,
    status: t.status as StageReworkTask["status"],
    completionNotes: t.completionNotes ?? undefined,
    reworkReason: t.reworkReason ?? undefined,
    dueDate: t.dueDate ? t.dueDate.toISOString() : undefined,
    submittedAt: t.submittedAt ? t.submittedAt.toISOString() : undefined,
    reviewedAt: t.reviewedAt ? t.reviewedAt.toISOString() : undefined,
    closedAt: t.closedAt ? t.closedAt.toISOString() : undefined,
    createdById: t.createdById ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

function adaptPrismaStageDocument(
  d: PrismaStageDocument,
  isLocked: boolean,
): StageDocument {
  return {
    id: d.id,
    fileName: d.fileName,
    originalFileName: d.originalFileName,
    fileSize: d.fileSize,
    fileType: d.fileType,
    fileUrl: d.fileUrl,
    contentHashSha256: d.contentHashSha256,
    retainUntil: d.retainUntil.toISOString(),
    uploadedById: d.uploadedById,
    uploadedByName: d.uploadedByName,
    uploadedAt: d.uploadedAt.toISOString(),
    isLocked,
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
      reference: r.reference ?? undefined,
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
      notes: r.notes ?? undefined,
      findingId: r.findingId ?? undefined,
      capaId: r.capaId ?? undefined,
      findingRef: r.finding ? { id: r.finding.id, reference: r.finding.reference ?? undefined, status: r.finding.status } : undefined,
      capaRef: r.capa ? { id: r.capa.id, reference: r.capa.reference ?? undefined, status: r.capa.status } : undefined,
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
