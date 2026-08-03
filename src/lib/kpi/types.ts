/**
 * Shared KPI input/output types (Phase 2).
 *
 * The whole `src/lib/kpi/` module is framework-agnostic — NO React, NO Prisma,
 * NO Redux — modelled on `src/lib/capa-readiness.ts`. It takes plain record
 * arrays in and returns plain numbers/objects out, so the SAME formulas run on:
 *   • the Dashboard (tenant-wide server rows, adapted to the slice shape), and
 *   • Governance → KPI Scorecards (the same tenant-wide rows),
 * guaranteeing both screens can never disagree.
 *
 * Inputs are STRUCTURAL (only the fields the maths touches) so callers can pass
 * their real Finding / CAPA / GxPSystem / FDA483 rows without reshaping.
 */

/** Minimal Finding shape the KPI maths reads. */
export interface KPIFinding {
  id: string;
  siteId?: string | null;
  area: string;
  /** "Critical" | "High" | "Medium" | "Low" */
  severity: string;
  /** "Open" | "In Progress" | "Submitted" | "Rework" | "Closed" */
  status: string;
  createdAt?: string | null;
}

/** Minimal CAPA shape the KPI maths reads. */
export interface KPICapa {
  id: string;
  siteId?: string | null;
  findingId?: string | null;
  /** "483" | "Deviation" | "Gap Assessment" | ... — used for area fallback. */
  source?: string | null;
  /** "Critical" | "High" | "Medium" | "Low" */
  risk?: string;
  /** CAPAStatus — "open" | "in_progress" | ... | "closed" | "rejected" */
  status: string;
  dueDate?: string | null;
  closedAt?: string | null;
  diGate?: boolean | null;
}

/** Minimal GxP system shape the KPI maths reads. */
export interface KPISystem {
  id: string;
  siteId?: string | null;
  /** "HIGH" | "MEDIUM" | "LOW" */
  riskLevel?: string;
  /** "Validated" | "In Progress" | "Overdue" | "Not Started" | ... */
  validationStatus?: string;
  /** "Compliant" | "Non-Compliant" | "N/A" | ... */
  part11Status?: string;
  annex11Status?: string;
  nextReview?: string | null;
}

/**
 * Minimal FDA-483 event shape. Works with the RAW `getFDA483Events` Prisma rows
 * (observations + commitments come back as relations) — no adapter needed.
 * `dueDate` may be a Date (server) or ISO string (serialised to the client).
 */
export interface KPIFDA483Event {
  siteId?: string | null;
  status?: string;
  observations: { status: string }[];
  commitments: { status: string; dueDate?: string | Date | null }[];
}

/**
 * Minimal Deviation shape the KPI maths reads (role dashboards, Phase 4).
 * Structural, so the RAW `getDeviations` Prisma rows pass straight in —
 * `detectedDate`/`dueDate` may be a Date (server) or ISO string (client).
 */
export interface KPIDeviation {
  id: string;
  siteId?: string | null;
  /** "QC Lab" | "Manufacturing" | "Warehouse" | "Utilities" | "QMS" | … */
  area: string;
  /** "process" | "equipment" | "material" | "environmental" | … */
  category?: string | null;
  /** FDA or generic taxonomy — normalised by the caller before comparison. */
  severity: string;
  /** "open" | "closed" | "rejected" */
  status: string;
  dueDate?: string | Date | null;
  createdAt?: string | Date | null;
  /** Non-empty → the deviation impacts released/in-process batches. */
  batchesAffected?: string | null;
  /** Non-empty → a regulatory-reportable impact was recorded. */
  regulatoryImpact?: string | null;
  /** Set once the post-report investigation (RCA) is complete. */
  investigationCompletedAt?: string | Date | null;
  /** True once QA has recorded the CAPA-needed verdict. */
  capaDecisionMade?: boolean | null;
  /** Set when this deviation was reported as a recurrence of a prior CAPA. */
  previousCAPAId?: string | null;
}

/** Minimal ChangeControl shape the KPI maths reads. */
export interface KPIChangeControl {
  id: string;
  /** "Draft" | "In Review" | "Approved" | "In Implementation" | "Implemented" | "Closed" | "Rejected" */
  status: string;
  /** "Critical" | "High" | "Medium" | "Low" */
  risk: string;
  /** "SOP" | "Equipment" | "Process" | "Product" | "Computer System" | "Material" | "Other" */
  changeType: string;
  targetImplementationDate?: string | Date | null;
}

/** Minimal TrainingRecord shape — the evidence behind training compliance. */
export interface KPITrainingRecord {
  /** "pending" | "in_progress" | "completed" | … */
  status: string;
  completedAt?: string | Date | null;
}

/**
 * Minimal per-inspection readiness row — the shape `getReadinessStats`
 * already returns in `inspectionsWithReadiness`.
 */
export interface KPIInspectionReadiness {
  id: string;
  title: string;
  agency?: string | null;
  siteName?: string | null;
  status?: string | null;
  /** Inspection.expectedDate — the regulatory deadline the org is racing. */
  expectedDate?: string | Date | null;
  readinessScore: number;
  completedActions: number;
  totalActions: number;
  overdueActions: number;
  trainingRecords?: KPITrainingRecord[];
}

/** A validation stage on a GxP system (qualification progress). */
export interface KPIValidationStage {
  /** "not_started" | "in_progress" | "submitted" | "approved" | "rejected" */
  status: string;
}

/** A tenant site — only id + name are needed for per-site KPIs. */
export interface KPISite {
  id: string;
  name: string;
}

/** The full record set every KPI computation draws from. */
export interface KPIDataset {
  findings: KPIFinding[];
  capas: KPICapa[];
  systems: KPISystem[];
  fda483Events?: KPIFDA483Event[];
}

/**
 * Per-site KPI row (the contract KPIScorecardTab renders for the multi-site
 * comparison, ranking and trend). Mirrors the original `SiteKPI` interface that
 * lived in KPIScorecardTab.tsx — now produced by `computeSiteKPIs`.
 */
export interface SiteKPI {
  siteId: string;
  siteName: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  readinessScore: number;
  openFindings: number;
  criticalFindings: number;
  openCAPAs: number;
  overdueCAPAs: number;
  activeFDA483: number;
  systemsValidated: number;
  systemsTotal: number;
  diExceptions: number;
  openDeviations: number;
  inspectionReadiness: number;
  nextInspection?: string;
  nextInspectionDate?: string;
  capaTimeliness: number;
  auditTrailCoverage: number;
}
