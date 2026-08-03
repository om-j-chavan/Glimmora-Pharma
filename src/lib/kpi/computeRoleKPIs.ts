/**
 * ROLE-SCOPED KPI computations (role-based dashboard, Phase 4).
 *
 * Extends the shared KPI library with the metric groups the per-role dashboards
 * need. Same rules as the rest of `src/lib/kpi/`: PURE — no React, no Prisma, no
 * Redux — plain record arrays in, plain numbers out, so the identical formula can
 * run on the server, in a test, or in the client page.
 *
 * EVERY number here is derived from a REAL persisted column. Where a role's
 * classic KPI has no schema backing (OOS/OOT registers, instrument masters,
 * batch-release masters, production-efficiency feeds), this module deliberately
 * does NOT invent one — it computes the closest honestly-labelled signal the
 * tenant's own records evidence (e.g. "QC Lab deviations open" rather than a
 * fabricated "OOS count"). Adding a fake number to a GxP dashboard is a
 * data-integrity defect, not a feature.
 *
 * Reuses `records.ts` predicates throughout so a count shown on a role dashboard
 * is computed identically to its Dashboard/Governance twin.
 */

import { normalizeSeverityForDisplay } from "@/lib/severity";
import {
  isOpenCapa, isCapaOverdue, isCriticalOpen, isOpenFinding,
  isCsvHighRisk, isValidationDrift, isDIException, pct,
} from "./records";
import { calculateReadiness, type ReadinessResult } from "./readiness";
import type {
  KPICapa, KPIChangeControl, KPIDeviation, KPIFDA483Event, KPIFinding,
  KPIInspectionReadiness, KPISystem, KPITrainingRecord, KPIValidationStage,
} from "./types";

/* ══════════════════════════════════════════════════════════════════════════
 * Shared helpers
 * ══════════════════════════════════════════════════════════════════════════ */

/** Coerce a Date | ISO string | null into epoch ms, or null when absent/invalid. */
function ms(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

/** True when `d` is strictly in the past relative to `now`. */
function isPast(d: string | Date | null | undefined, now: number): boolean {
  const t = ms(d);
  return t !== null && t < now;
}

/** True when `d` falls inside the next `days` window (never in the past). */
function isDueWithin(d: string | Date | null | undefined, now: number, days: number): boolean {
  const t = ms(d);
  if (t === null) return false;
  return t >= now && t <= now + days * 86_400_000;
}

/** Non-blank free-text column (the schema stores "" and null interchangeably). */
const hasText = (v: string | null | undefined): boolean => typeof v === "string" && v.trim().length > 0;

/** Deviation is still in flight. Mirrors getDashboardStats' `isOpen`. */
export const isOpenDeviation = (d: KPIDeviation) => d.status !== "closed" && d.status !== "rejected";

/** Critical deviation, severity-normalised (the DB carries both taxonomies). */
export const isCriticalDeviation = (d: KPIDeviation) =>
  normalizeSeverityForDisplay(d.severity, "fda") === "Critical";

/** Reported but not yet investigated — the RCA queue. */
export const isDeviationAwaitingInvestigation = (d: KPIDeviation) =>
  isOpenDeviation(d) && !d.investigationCompletedAt;

/** Investigated, but QA has not yet recorded the CAPA-needed verdict. */
export const isDeviationAwaitingCapaDecision = (d: KPIDeviation) =>
  isOpenDeviation(d) && Boolean(d.investigationCompletedAt) && d.capaDecisionMade !== true;

/** Change control that has been approved but is not yet Implemented/Closed. */
export const isChangeControlInFlight = (c: KPIChangeControl) =>
  c.status !== "Closed" && c.status !== "Rejected" && c.status !== "Implemented";

/** A CAPA sitting in a QA queue (review or independent verification). */
export const isCapaAwaitingQA = (c: KPICapa) =>
  c.status === "pending_qa_review" || c.status === "pending_verification";

/** FDA 483 / inspection event still requiring work. */
export const isOpenFDA483 = (e: KPIFDA483Event) => e.status !== "Closed";

/* ══════════════════════════════════════════════════════════════════════════
 * Training compliance — the ONE formula, evidenced by TrainingRecord rows
 * ══════════════════════════════════════════════════════════════════════════
 * `computeDashboardKPIs` returns `trainingCompliance: null` by design (it takes
 * no training input, and a training figure must never be inferred from another
 * signal — 21 CFR 211.25). This function is that missing input: it counts REAL
 * TrainingRecord rows. Null when the tenant has logged none, so the card still
 * renders "—" instead of a fabricated 100%.
 */
export interface TrainingKPIs {
  completed: number;
  total: number;
  /** % complete, or null when no training has been assigned. */
  compliance: number | null;
}

export function computeTrainingKPIs(records: KPITrainingRecord[]): TrainingKPIs {
  const total = records.length;
  const completed = records.filter((r) => r.status === "completed" || Boolean(r.completedAt)).length;
  return { completed, total, compliance: pct(completed, total) };
}

/* ══════════════════════════════════════════════════════════════════════════
 * QUALITY (QA Head) — deviations, CAPA, investigations, audit findings
 * ══════════════════════════════════════════════════════════════════════════ */

export interface QualityKPIs {
  openDeviations: number;
  criticalDeviations: number;
  awaitingInvestigation: number;
  awaitingCapaDecision: number;
  recurrences: number;
  openCAPAs: number;
  overdueCAPAs: number;
  capaOverdueRate: number | null;
  capaAwaitingQA: number;
  diExceptions: number;
  openFindings: number;
  criticalFindings: number;
  training: TrainingKPIs;
  /** 0–100 inverse of the shared readiness model — "how much risk is carried". */
  riskScore: number | null;
  readiness: ReadinessResult;
}

export interface QualityKPIInput {
  findings: KPIFinding[];
  capas: KPICapa[];
  systems: KPISystem[];
  deviations: KPIDeviation[];
  trainingRecords: KPITrainingRecord[];
}

export function computeQualityKPIs({
  findings, capas, systems, deviations, trainingRecords,
}: QualityKPIInput): QualityKPIs {
  const openDev = deviations.filter(isOpenDeviation);
  const openCAPAs = capas.filter(isOpenCapa);
  const overdueCAPAs = capas.filter(isCapaOverdue);
  const openFindings = findings.filter(isOpenFinding);
  const criticalFindings = findings.filter(isCriticalOpen);
  const training = computeTrainingKPIs(trainingRecords);

  // ONE readiness model (calculateReadiness) — the same weights Governance and
  // the area heatmap use, fed the tenant-wide counts. `riskScore` is its inverse
  // so "Risk score" and "Readiness" can never tell contradictory stories.
  const readiness = calculateReadiness({
    findings: openFindings.length,
    criticalFindings: criticalFindings.length,
    highRiskSystems: systems.filter(isCsvHighRisk).length,
    capaOverdue: overdueCAPAs.length,
    validationRisk: systems.filter(isValidationDrift).length,
    diExceptions: capas.filter(isDIException).length,
    trainingCompliance: training.compliance,
  }, {
    hasData: findings.length + capas.length + systems.length + deviations.length > 0,
  });

  return {
    openDeviations: openDev.length,
    criticalDeviations: openDev.filter(isCriticalDeviation).length,
    awaitingInvestigation: deviations.filter(isDeviationAwaitingInvestigation).length,
    awaitingCapaDecision: deviations.filter(isDeviationAwaitingCapaDecision).length,
    recurrences: deviations.filter((d) => Boolean(d.previousCAPAId)).length,
    openCAPAs: openCAPAs.length,
    overdueCAPAs: overdueCAPAs.length,
    capaOverdueRate: pct(overdueCAPAs.length, openCAPAs.length),
    capaAwaitingQA: capas.filter(isCapaAwaitingQA).length,
    diExceptions: capas.filter(isDIException).length,
    openFindings: openFindings.length,
    criticalFindings: criticalFindings.length,
    training,
    riskScore: readiness.score === null ? null : 100 - readiness.score,
    readiness,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * REGULATORY (Regulatory Affairs) — 483s, submissions, inspections, deadlines
 * ══════════════════════════════════════════════════════════════════════════ */

export interface RegulatoryDeadline {
  id: string;
  label: string;
  detail: string;
  dueDate: string | Date;
  /** True when already past due. */
  overdue: boolean;
  kind: "response" | "commitment" | "inspection";
}

export interface RegulatoryKPIs {
  openEvents: number;
  totalEvents: number;
  /** Events whose response has been signed & submitted. */
  submittedResponses: number;
  /** Open events whose 483-response deadline has passed. */
  overdueResponses: number;
  /** Open events whose response is due inside the next 30 days. */
  responsesDueSoon: number;
  openObservations: number;
  openCommitments: number;
  overdueCommitments: number;
  /** Deviations flagged with a recorded regulatory impact. */
  regulatoryImpactDeviations: number;
  activeInspections: number;
  /** Lowest readiness % across active inspections (most urgent). */
  inspectionReadiness: number | null;
  overdueReadinessActions: number;
  /** The soonest expected inspection date, if any. */
  nextInspection: KPIInspectionReadiness | null;
  /** Merged, date-sorted regulatory calendar (soonest first). */
  deadlines: RegulatoryDeadline[];
}

/**
 * Structural FDA-483 row with the extra columns the regulatory KPIs read. Extends
 * the shared `KPIFDA483Event` so the RAW `getFDA483Events` Prisma rows still pass
 * straight in with no adapter.
 */
export interface RegulatoryFDA483 extends KPIFDA483Event {
  id?: string;
  referenceNumber?: string;
  agency?: string;
  responseDeadline?: string | Date | null;
  submittedAt?: string | Date | null;
}

export interface RegulatoryKPIInput {
  fda483: RegulatoryFDA483[];
  deviations: KPIDeviation[];
  inspections: KPIInspectionReadiness[];
  /** Epoch ms "now" — injected so the function stays pure/testable. */
  now: number;
}

export function computeRegulatoryKPIs({
  fda483, deviations, inspections, now,
}: RegulatoryKPIInput): RegulatoryKPIs {
  const open = fda483.filter(isOpenFDA483);
  const deadlines: RegulatoryDeadline[] = [];

  let overdueResponses = 0;
  let responsesDueSoon = 0;
  for (const e of open) {
    // "Response Submitted" already met the deadline — only unmet ones count.
    if (e.status === "Response Submitted" || e.submittedAt) continue;
    if (isPast(e.responseDeadline, now)) overdueResponses++;
    else if (isDueWithin(e.responseDeadline, now, 30)) responsesDueSoon++;
    if (e.responseDeadline) {
      deadlines.push({
        id: `resp-${e.id ?? e.referenceNumber ?? deadlines.length}`,
        label: `483 response — ${e.referenceNumber ?? "event"}`,
        detail: e.agency ?? "Regulatory response due",
        dueDate: e.responseDeadline,
        overdue: isPast(e.responseDeadline, now),
        kind: "response",
      });
    }
  }

  let openObservations = 0;
  let openCommitments = 0;
  let overdueCommitments = 0;
  for (const e of fda483) {
    openObservations += e.observations.filter((o) => o.status !== "Closed" && o.status !== "Complete").length;
    for (const c of e.commitments) {
      const done = c.status === "Complete" || c.status === "Closed";
      if (done) continue;
      openCommitments++;
      if (isPast(c.dueDate, now)) overdueCommitments++;
      if (c.dueDate) {
        deadlines.push({
          id: `cmt-${e.id ?? ""}-${deadlines.length}`,
          label: "483 commitment due",
          detail: e.referenceNumber ?? "Commitment",
          dueDate: c.dueDate,
          overdue: isPast(c.dueDate, now),
          kind: "commitment",
        });
      }
    }
  }

  const active = inspections.filter((i) => i.status !== "completed" && i.status !== "cancelled");
  for (const i of active) {
    if (!i.expectedDate) continue;
    deadlines.push({
      id: `insp-${i.id}`,
      label: i.title,
      detail: `${i.agency ?? "Inspection"} · ${i.readinessScore}% ready`,
      dueDate: i.expectedDate,
      overdue: isPast(i.expectedDate, now),
      kind: "inspection",
    });
  }

  const dated = active.filter((i) => ms(i.expectedDate) !== null);
  const nextInspection = dated.length
    ? dated.reduce((a, b) => ((ms(a.expectedDate) ?? 0) <= (ms(b.expectedDate) ?? 0) ? a : b))
    : null;

  return {
    openEvents: open.length,
    totalEvents: fda483.length,
    submittedResponses: fda483.filter((e) => e.status === "Response Submitted" || Boolean(e.submittedAt)).length,
    overdueResponses,
    responsesDueSoon,
    openObservations,
    openCommitments,
    overdueCommitments,
    regulatoryImpactDeviations: deviations.filter((d) => isOpenDeviation(d) && hasText(d.regulatoryImpact)).length,
    activeInspections: active.length,
    inspectionReadiness: active.length ? Math.min(...active.map((i) => i.readinessScore)) : null,
    overdueReadinessActions: active.reduce((n, i) => n + i.overdueActions, 0),
    nextInspection,
    deadlines: deadlines.sort((a, b) => (ms(a.dueDate) ?? 0) - (ms(b.dueDate) ?? 0)),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * VALIDATION (CSV Validation Lead / IT-CDO) — lifecycle, qualification, drift
 * ══════════════════════════════════════════════════════════════════════════ */

/** Structural system row plus the validation stages the funnel/progress read. */
export interface ValidationSystem extends KPISystem {
  name?: string;
  validationStages?: KPIValidationStage[];
}

export interface ValidationKPIs {
  total: number;
  validated: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  /** % of registered systems in the Validated state, or null when none. */
  validatedRate: number | null;
  pendingValidation: number;
  highRisk: number;
  drift: number;
  part11NonCompliant: number;
  annex11NonCompliant: number;
  periodicReviewOverdue: number;
  periodicReviewDueSoon: number;
  /** Approved validation stages / total stages across all systems. */
  stagesApproved: number;
  stagesTotal: number;
  /** % of qualification stages approved, or null when no stages exist. */
  qualificationProgress: number | null;
  /** Validation-status distribution, ready for a chart. */
  byStatus: { status: string; count: number }[];
}

/** The canonical CSV lifecycle order — drives the funnel chart's x-axis. */
export const VALIDATION_STATUSES = ["Not Started", "In Progress", "Validated", "Overdue"] as const;

export function computeValidationKPIs(systems: ValidationSystem[], now: number): ValidationKPIs {
  const count = (s: string) => systems.filter((x) => x.validationStatus === s).length;
  const validated = count("Validated");

  let stagesApproved = 0;
  let stagesTotal = 0;
  for (const s of systems) {
    for (const st of s.validationStages ?? []) {
      stagesTotal++;
      if (st.status === "approved") stagesApproved++;
    }
  }

  // Any status outside the canonical four still gets a bar, so a legacy or
  // newly-added lifecycle value can never be silently dropped from the chart.
  const known = new Set<string>(VALIDATION_STATUSES);
  const extra = [...new Set(systems.map((s) => s.validationStatus ?? "Not Started").filter((s) => !known.has(s)))];

  return {
    total: systems.length,
    validated,
    inProgress: count("In Progress"),
    notStarted: count("Not Started"),
    overdue: count("Overdue"),
    validatedRate: pct(validated, systems.length),
    pendingValidation: systems.filter((s) => s.validationStatus !== "Validated").length,
    highRisk: systems.filter(isCsvHighRisk).length,
    drift: systems.filter(isValidationDrift).length,
    part11NonCompliant: systems.filter((s) => s.part11Status === "Non-Compliant").length,
    annex11NonCompliant: systems.filter((s) => s.annex11Status === "Non-Compliant").length,
    periodicReviewOverdue: systems.filter((s) => isPast(s.nextReview, now)).length,
    periodicReviewDueSoon: systems.filter((s) => isDueWithin(s.nextReview, now, 30)).length,
    stagesApproved,
    stagesTotal,
    qualificationProgress: pct(stagesApproved, stagesTotal),
    byStatus: [...VALIDATION_STATUSES, ...extra].map((status) => ({
      status,
      count: systems.filter((s) => (s.validationStatus ?? "Not Started") === status).length,
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * AREA KPIs (QC Lab Director / Operations Head)
 * ══════════════════════════════════════════════════════════════════════════
 * Both roles own a GxP AREA, and every quality record carries one (`Finding.area`,
 * `Deviation.area`, and a CAPA via its linked finding). So an area dashboard is a
 * real, narrowed view of real records — not a separate data domain.
 */

export interface AreaKPIs {
  area: string;
  openDeviations: number;
  criticalDeviations: number;
  awaitingInvestigation: number;
  openFindings: number;
  criticalFindings: number;
  openCAPAs: number;
  overdueCAPAs: number;
  /** Open deviations in this area that recorded an affected batch. */
  batchImpacting: number;
  /** Open deviations in this area attributed to equipment. */
  equipmentRelated: number;
  /** Deviation category mix for the area (chart-ready, descending). */
  byCategory: { category: string; count: number }[];
  readiness: ReadinessResult;
}

export interface AreaKPIInput {
  area: string;
  findings: KPIFinding[];
  capas: KPICapa[];
  deviations: KPIDeviation[];
  systems: KPISystem[];
  /** Resolves a CAPA to its GxP area — pass `capaArea`-bound closure. */
  capaAreaOf: (c: KPICapa) => string;
}

export function computeAreaKPIs({
  area, findings, capas, deviations, systems, capaAreaOf,
}: AreaKPIInput): AreaKPIs {
  const areaFindings = findings.filter((f) => f.area === area);
  const openAreaFindings = areaFindings.filter(isOpenFinding);
  const criticalAreaFindings = areaFindings.filter(isCriticalOpen);
  const areaCapas = capas.filter((c) => capaAreaOf(c) === area);
  const overdueAreaCapas = areaCapas.filter(isCapaOverdue);
  const areaDeviations = deviations.filter((d) => d.area === area);
  const openAreaDeviations = areaDeviations.filter(isOpenDeviation);

  const categories = new Map<string, number>();
  for (const d of openAreaDeviations) {
    const key = d.category?.trim() || "other";
    categories.set(key, (categories.get(key) ?? 0) + 1);
  }

  // CSV/IT is the only area whose readiness is system-driven; every other area
  // scores on findings + CAPA timeliness alone (systems carry no area column).
  const areaSystems = area === "CSV/IT" ? systems : [];

  return {
    area,
    openDeviations: openAreaDeviations.length,
    criticalDeviations: openAreaDeviations.filter(isCriticalDeviation).length,
    awaitingInvestigation: areaDeviations.filter(isDeviationAwaitingInvestigation).length,
    openFindings: openAreaFindings.length,
    criticalFindings: criticalAreaFindings.length,
    openCAPAs: areaCapas.filter(isOpenCapa).length,
    overdueCAPAs: overdueAreaCapas.length,
    batchImpacting: openAreaDeviations.filter((d) => hasText(d.batchesAffected)).length,
    equipmentRelated: openAreaDeviations.filter((d) => d.category === "equipment").length,
    byCategory: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    readiness: calculateReadiness({
      findings: openAreaFindings.length,
      criticalFindings: criticalAreaFindings.length,
      highRiskSystems: areaSystems.filter(isCsvHighRisk).length,
      capaOverdue: overdueAreaCapas.length,
      validationRisk: areaSystems.filter(isValidationDrift).length,
      diExceptions: areaCapas.filter(isDIException).length,
    }, {
      hasData: areaFindings.length + areaCapas.length + areaDeviations.length > 0,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * OPERATIONS (Operations Head) — change control on top of the area view
 * ══════════════════════════════════════════════════════════════════════════ */

export interface OperationsKPIs {
  changeControlsOpen: number;
  changeControlsInReview: number;
  changeControlsInImplementation: number;
  changeControlsOverdue: number;
  changeControlsHighRisk: number;
  /** Equipment / Computer-System change controls — the operational subset. */
  changeControlsEquipment: number;
  /** Status mix, chart-ready in lifecycle order. */
  byStatus: { status: string; count: number }[];
}

/** Change-control lifecycle order — drives the status chart's x-axis. */
export const CHANGE_CONTROL_STATUSES = [
  "Draft", "In Review", "Approved", "In Implementation", "Implemented", "Closed", "Rejected",
] as const;

export function computeOperationsKPIs(changeControls: KPIChangeControl[], now: number): OperationsKPIs {
  const inFlight = changeControls.filter(isChangeControlInFlight);
  return {
    changeControlsOpen: inFlight.length,
    changeControlsInReview: changeControls.filter((c) => c.status === "In Review").length,
    changeControlsInImplementation: changeControls.filter((c) => c.status === "In Implementation").length,
    changeControlsOverdue: inFlight.filter((c) => isPast(c.targetImplementationDate, now)).length,
    changeControlsHighRisk: inFlight.filter((c) => c.risk === "Critical" || c.risk === "High").length,
    changeControlsEquipment: inFlight.filter((c) => c.changeType === "Equipment" || c.changeType === "Computer System").length,
    byStatus: CHANGE_CONTROL_STATUSES.map((status) => ({
      status,
      count: changeControls.filter((c) => c.status === status).length,
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * TENANT HEALTH (Customer Admin) — users, sites, licence, module adoption
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ModuleAdoption {
  module: string;
  label: string;
  records: number;
  href: string;
}

export interface TenantKPIs {
  activeUsers: number;
  inactiveUsers: number;
  totalUsers: number;
  seatsUsed: number;
  seatsTotal: number;
  /** % of licensed seats consumed, or null when the tenant has no plan. */
  seatUtilisation: number | null;
  activeSites: number;
  siteCapacity: number;
  planName: string | null;
  licenceDaysRemaining: number | null;
  licenceExpired: boolean;
  /** Modules with at least one record — the honest adoption signal. */
  modulesInUse: number;
  moduleAdoption: ModuleAdoption[];
}

export interface TenantKPIInput {
  users: { isActive?: boolean; status?: string; role: string }[];
  activeSites: number;
  seatsUsed: number;
  seatsTotal: number;
  siteCapacity: number;
  planName: string | null;
  licenceDaysRemaining: number | null;
  licenceExpired: boolean;
  /** Record counts per module — real totals, supplied by the caller. */
  moduleCounts: { module: string; label: string; records: number; href: string }[];
}

export function computeTenantKPIs(input: TenantKPIInput): TenantKPIs {
  // A tenant user config carries either `isActive` or a "Active"/"Inactive"
  // status string depending on its origin; treat an absent flag as active
  // (matches useTenantConfig's own site/user handling).
  const isActive = (u: { isActive?: boolean; status?: string }) =>
    u.isActive === undefined ? u.status !== "Inactive" : u.isActive;
  const active = input.users.filter(isActive).length;

  return {
    activeUsers: active,
    inactiveUsers: input.users.length - active,
    totalUsers: input.users.length,
    seatsUsed: input.seatsUsed,
    seatsTotal: input.seatsTotal,
    seatUtilisation: input.seatsTotal > 0 ? pct(input.seatsUsed, input.seatsTotal) : null,
    activeSites: input.activeSites,
    siteCapacity: input.siteCapacity,
    planName: input.planName,
    licenceDaysRemaining: input.licenceDaysRemaining,
    licenceExpired: input.licenceExpired,
    modulesInUse: input.moduleCounts.filter((m) => m.records > 0).length,
    moduleAdoption: [...input.moduleCounts].sort((a, b) => b.records - a.records),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * Deviation trend — monthly volume by severity (QA / QC Lab / Operations)
 * ══════════════════════════════════════════════════════════════════════════
 * Mirrors `severityTrend` (trend.ts) for findings, on the FDA taxonomy the
 * Deviation table actually stores. Kept here (not trend.ts) because it needs
 * `normalizeSeverityForDisplay`, which trend.ts deliberately does not import.
 */

export interface DeviationTrendPoint {
  month: string;
  Critical: number;
  Major: number;
  Minor: number;
}

/** Last `months` calendar months of deviation volume, oldest → newest. */
export function deviationSeverityTrend(
  deviations: KPIDeviation[],
  now: number,
  months = 6,
): DeviationTrendPoint[] {
  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const base = new Date(now);
  const buckets: DeviationTrendPoint[] = [];
  const index = new Map<string, DeviationTrendPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const point: DeviationTrendPoint = { month: MONTH_LABELS[d.getMonth()], Critical: 0, Major: 0, Minor: 0 };
    buckets.push(point);
    index.set(`${d.getFullYear()}-${d.getMonth()}`, point);
  }

  for (const dev of deviations) {
    const t = ms(dev.createdAt);
    if (t === null) continue;
    const d = new Date(t);
    const point = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!point) continue;
    const sev = normalizeSeverityForDisplay(dev.severity, "fda");
    if (sev === "Critical") point.Critical++;
    else if (sev === "Major") point.Major++;
    else point.Minor++;
  }

  return buckets;
}

/** True when every bucket is empty — render an empty state instead of a chart. */
export function isDeviationTrendEmpty(points: DeviationTrendPoint[]): boolean {
  return points.every((p) => p.Critical + p.Major + p.Minor === 0);
}
