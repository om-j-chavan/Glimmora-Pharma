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
