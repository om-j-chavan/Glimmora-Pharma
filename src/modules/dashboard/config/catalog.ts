/**
 * ROLE-BASED DASHBOARD — the shared element catalog (Phase 3/4/5).
 *
 * Every KPI card, quick action and navigation shortcut is DEFINED ONCE
 * here and merely REFERENCED by the per-role configs. That is the anti-duplication
 * rule for this folder: a role file lists elements, it never re-implements one.
 * Two roles showing "Open CAPAs" therefore show the SAME formula, colour bands and
 * deep link — they cannot drift.
 *
 * Every KPI selector reads the assembled `DashboardDataset`, whose fields all come
 * from the pure `src/lib/kpi` formulas over real persisted records.
 *
 * ROUTES referenced here are the real app routes under `app/(app)/`. Nothing links
 * to `/change-control` unconditionally (the module is behind
 * `CHANGE_CONTROL_ENABLED`, currently false and redirecting to `/`) or to
 * `/agi-console` (no such route — the AGI surfaces are `/ai-capa` / `/ai-policy`).
 */

import {
  Activity, AlertTriangle, BarChart3, Bell, Bot, Building2, ClipboardCheck,
  ClipboardList, Clock, Database, FileText, FileWarning, GitCompareArrows,
  GraduationCap, Layers, ListChecks, Package, Search, Settings, ShieldCheck,
  ShieldAlert, SlidersHorizontal, Users, Wrench,
} from "lucide-react";
import { READINESS_COLORS } from "@/lib/kpi";
import { CHANGE_CONTROL_ENABLED } from "@/lib/change-control-constants";
import type {
  DashboardGuard, KpiDefinition, NavShortcut, QuickAction,
} from "./types";

/* ══════════════════════════════════════════════════════════════════════════
 * Colour helpers — ONE mapping, so no card invents its own bands
 * ══════════════════════════════════════════════════════════════════════════ */

/** Count-style metric: 0 is good, `watch` and below is amber, above is red. */
export function countColor(n: number, watch = 2): string {
  if (n === 0) return READINESS_COLORS.ready;
  return n <= watch ? READINESS_COLORS.watch : READINESS_COLORS.risk;
}

/** Percentage where HIGHER is better (readiness, training, validated %). */
export function upPctColor(p: number | null): string {
  if (p === null) return READINESS_COLORS.none;
  if (p >= 90) return READINESS_COLORS.ready;
  if (p >= 70) return READINESS_COLORS.watch;
  return READINESS_COLORS.risk;
}

/** Percentage where LOWER is better (overdue rate, risk score). */
export function downPctColor(p: number | null, watch = 20): string {
  if (p === null) return READINESS_COLORS.none;
  if (p === 0) return READINESS_COLORS.ready;
  return p <= watch ? READINESS_COLORS.watch : READINESS_COLORS.risk;
}

/** Render a nullable percentage. */
const pctText = (p: number | null) => (p === null ? "—" : `${p}%`);

/** Pluralise without a library (the app has no i18n layer). */
const s = (n: number) => (n === 1 ? "" : "s");

/* ══════════════════════════════════════════════════════════════════════════
 * Reusable guards
 * ══════════════════════════════════════════════════════════════════════════ */

/** The CAPA module surface gate (CAPA_MODULE_VIEW_ROLES), not the matrix. */
export const capaModuleGuard: DashboardGuard = (a) => a.canViewCAPAModule;
/** The Governance module surface gate (GOVERNANCE_VIEW_ROLES). */
export const governanceGuard: DashboardGuard = (a) => a.canViewGovernance;
/** The audit-trail route gate (AUDIT_TRAIL_VIEW_ROLES). */
export const auditTrailGuard: DashboardGuard = (a) => a.canViewAuditTrail;
/** Tenant administration (users / sites / settings). */
export const tenantAdminGuard: DashboardGuard = (a) => a.canManageTenant;
/** Anything that implies authoring — hidden from read-only postures. */
export const writeGuard: DashboardGuard = (a) => !a.readOnly;
/**
 * Change Control is behind a build flag that currently redirects `/change-control`
 * to `/`. Gating on the flag (not on a role) is what keeps "no broken navigation"
 * true: when the module ships, these elements light up with no config edit.
 */
export const changeControlGuard: DashboardGuard = () => CHANGE_CONTROL_ENABLED;

/** AND-combine guards, keeping each one readable at its call site. */
export const allOf = (...guards: DashboardGuard[]): DashboardGuard =>
  (a) => guards.every((g) => g(a));

/* ══════════════════════════════════════════════════════════════════════════
 * KPI CARDS — Phase 4
 * ══════════════════════════════════════════════════════════════════════════ */

/* ── Cross-role compliance headlines ─────────────────────────────────────── */

export const KPI_OVERALL_READINESS: KpiDefinition = {
  key: "overall-readiness",
  label: "Overall readiness",
  icon: ShieldCheck,
  select: (d) => ({
    value: `${d.readinessScore}%`,
    sub: d.readinessLabel.label,
    color: d.readinessLabel.color,
  }),
  // Governance scorecard for the two oversight roles; the readiness module — whose
  // actions actually drive this number — for everyone else.
  href: "/governance?tab=kpis#kpi-site-readiness",
  hrefModule: "governance",
  fallbackHref: "/readiness",
};

export const KPI_COMPLIANCE_SCORE: KpiDefinition = {
  key: "compliance-score",
  label: "Compliance score",
  icon: BarChart3,
  select: (d) => ({
    value: d.quality.readiness.percentage,
    sub: d.quality.readiness.status,
    color: d.quality.readiness.color,
  }),
  href: "/governance?tab=kpis",
  hrefModule: "governance",
};

export const KPI_CRITICAL_FINDINGS: KpiDefinition = {
  key: "critical-findings",
  label: "Critical findings",
  icon: AlertTriangle,
  requiresModules: ["gap"],
  select: (d) => ({
    value: String(d.core.criticalCount),
    sub: d.findings.length === 0
      ? "No findings logged yet"
      : `${d.quality.openFindings} total outstanding`,
    color: countColor(d.core.criticalCount, 0),
  }),
  href: "/governance?tab=kpis#kpi-repeat-observation",
  hrefModule: "governance",
  fallbackHref: "/gap-assessment",
  fallbackHrefModule: "gap",
};

export const KPI_AUDIT_FINDINGS: KpiDefinition = {
  key: "audit-findings",
  label: "Audit findings",
  icon: Search,
  requiresModules: ["gap"],
  select: (d) => ({
    value: String(d.quality.openFindings),
    sub: d.quality.criticalFindings > 0
      ? `${d.quality.criticalFindings} critical`
      : d.findings.length === 0 ? "No findings logged yet" : "None critical",
    color: countColor(d.quality.criticalFindings, 0),
  }),
  href: "/gap-assessment",
  hrefModule: "gap",
};

export const KPI_OPEN_CAPAS: KpiDefinition = {
  key: "open-capas",
  label: "Open CAPAs",
  icon: ClipboardCheck,
  select: (d) => ({
    value: String(d.quality.openCAPAs),
    sub: d.quality.openCAPAs === 0
      ? "No open CAPAs"
      : `${d.quality.overdueCAPAs} past due`,
    color: countColor(d.quality.overdueCAPAs, 0),
  }),
  href: "/capa",
  hrefModule: "capa",
};

export const KPI_CAPA_OVERDUE_RATE: KpiDefinition = {
  key: "capa-overdue-rate",
  label: "CAPA overdue",
  icon: Clock,
  select: (d) => ({
    value: pctText(d.quality.capaOverdueRate),
    sub: d.quality.openCAPAs === 0
      ? "No open CAPAs"
      : `${d.quality.overdueCAPAs} of ${d.quality.openCAPAs} past due`,
    color: downPctColor(d.quality.capaOverdueRate),
  }),
  href: "/governance?tab=kpis#kpi-capa-timeliness",
  hrefModule: "governance",
  fallbackHref: "/capa",
  fallbackHrefModule: "capa",
};

export const KPI_TRAINING_COMPLIANCE: KpiDefinition = {
  key: "training-compliance",
  label: "Training compliance",
  icon: GraduationCap,
  select: (d) => ({
    value: pctText(d.quality.training.compliance),
    sub: d.quality.training.total === 0
      ? "No training assigned yet"
      : `${d.quality.training.completed} of ${d.quality.training.total} complete`,
    color: upPctColor(d.quality.training.compliance),
  }),
  href: "/readiness",
};

export const KPI_RISK_SCORE: KpiDefinition = {
  key: "risk-score",
  label: "Risk score",
  icon: ShieldAlert,
  select: (d) => ({
    value: pctText(d.quality.riskScore),
    sub: d.quality.riskScore === null
      ? "Nothing logged to score"
      : `${d.quality.readiness.status} · ${d.quality.readiness.percentage} ready`,
    color: downPctColor(d.quality.riskScore, 20),
  }),
  href: "/governance?tab=kpis",
  hrefModule: "governance",
};

/* ── Quality / deviations ────────────────────────────────────────────────── */

export const KPI_OPEN_DEVIATIONS: KpiDefinition = {
  key: "open-deviations",
  label: "Open deviations",
  icon: AlertTriangle,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.quality.openDeviations),
    sub: d.quality.criticalDeviations > 0
      ? `${d.quality.criticalDeviations} critical`
      : d.deviations.length === 0 ? "None reported yet" : "None critical",
    color: countColor(d.quality.criticalDeviations, 0),
  }),
  href: "/deviation",
  hrefModule: "deviation",
};

export const KPI_INVESTIGATIONS: KpiDefinition = {
  key: "investigations-pending",
  label: "Investigations pending",
  icon: Search,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.quality.awaitingInvestigation),
    sub: d.quality.awaitingCapaDecision > 0
      ? `${d.quality.awaitingCapaDecision} awaiting CAPA decision`
      : "Root-cause analysis outstanding",
    color: countColor(d.quality.awaitingInvestigation, 3),
  }),
  href: "/deviation",
  hrefModule: "deviation",
};

export const KPI_CAPA_QA_QUEUE: KpiDefinition = {
  key: "capa-qa-queue",
  label: "Awaiting QA sign-off",
  icon: ClipboardList,
  guard: capaModuleGuard,
  select: (d) => ({
    value: String(d.quality.capaAwaitingQA),
    sub: d.quality.diExceptions > 0
      ? `${d.quality.diExceptions} open DI gate${s(d.quality.diExceptions)}`
      : "CAPAs in a QA review queue",
    color: countColor(d.quality.capaAwaitingQA, 3),
  }),
  href: "/capa",
  hrefModule: "capa",
};

/* ── CSV / validation ────────────────────────────────────────────────────── */

export const KPI_CSV_HIGH_RISK: KpiDefinition = {
  key: "csv-high-risk",
  label: "CSV high risk",
  icon: Database,
  requiresModules: ["csv"],
  select: (d) => ({
    value: String(d.validation.highRisk),
    sub: d.validation.total === 0
      ? "No systems registered"
      : "HIGH risk, not yet validated",
    color: countColor(d.validation.highRisk, 0),
  }),
  href: "/governance?tab=kpis#kpi-validation-drift",
  hrefModule: "governance",
  fallbackHref: "/csv-csa",
  fallbackHrefModule: "csv",
};

export const KPI_SYSTEMS_VALIDATED: KpiDefinition = {
  key: "systems-validated",
  label: "Validated systems",
  icon: ShieldCheck,
  requiresModules: ["csv"],
  select: (d) => ({
    value: pctText(d.validation.validatedRate),
    sub: d.validation.total === 0
      ? "No systems registered"
      : `${d.validation.validated} of ${d.validation.total} systems`,
    color: upPctColor(d.validation.validatedRate),
  }),
  href: "/csv-csa",
  hrefModule: "csv",
};

export const KPI_VALIDATION_PENDING: KpiDefinition = {
  key: "validation-pending",
  label: "Pending validation",
  icon: ClipboardList,
  requiresModules: ["csv"],
  select: (d) => ({
    value: String(d.validation.pendingValidation),
    sub: d.validation.overdue > 0
      ? `${d.validation.overdue} overdue`
      : `${d.validation.inProgress} in progress`,
    color: countColor(d.validation.overdue, 0),
  }),
  href: "/csv-csa",
  hrefModule: "csv",
};

export const KPI_QUALIFICATION_PROGRESS: KpiDefinition = {
  key: "qualification-progress",
  label: "Qualification progress",
  icon: Layers,
  requiresModules: ["csv"],
  select: (d) => ({
    value: pctText(d.validation.qualificationProgress),
    sub: d.validation.stagesTotal === 0
      ? "No validation stages yet"
      : `${d.validation.stagesApproved} of ${d.validation.stagesTotal} stages approved`,
    color: upPctColor(d.validation.qualificationProgress),
  }),
  href: "/csv-csa",
  hrefModule: "csv",
};

export const KPI_VALIDATION_DRIFT: KpiDefinition = {
  key: "validation-drift",
  label: "Validation drift",
  icon: Activity,
  requiresModules: ["csv"],
  select: (d) => ({
    value: String(d.validation.drift),
    sub: d.validation.periodicReviewOverdue > 0
      ? `${d.validation.periodicReviewOverdue} periodic review${s(d.validation.periodicReviewOverdue)} overdue`
      : "Overdue revalidation or Part 11 / Annex 11 gap",
    color: countColor(d.validation.drift, 0),
  }),
  href: "/csv-csa",
  hrefModule: "csv",
};

export const KPI_PART11_COMPLIANCE: KpiDefinition = {
  key: "part11-compliance",
  label: "Part 11 gaps",
  icon: FileText,
  requiresModules: ["csv"],
  select: (d) => ({
    value: String(d.validation.part11NonCompliant),
    sub: d.validation.annex11NonCompliant > 0
      ? `${d.validation.annex11NonCompliant} Annex 11 gap${s(d.validation.annex11NonCompliant)}`
      : "Systems flagged Part 11 non-compliant",
    color: countColor(d.validation.part11NonCompliant, 0),
  }),
  href: "/csv-csa",
  hrefModule: "csv",
};

/* ── Regulatory ──────────────────────────────────────────────────────────── */

export const KPI_REGULATORY_EVENTS: KpiDefinition = {
  key: "regulatory-events",
  label: "Open 483 events",
  icon: FileWarning,
  requiresModules: ["fda483"],
  select: (d) => ({
    value: String(d.regulatory.openEvents),
    sub: d.regulatory.totalEvents === 0
      ? "No inspection events logged"
      : `${d.regulatory.submittedResponses} response${s(d.regulatory.submittedResponses)} submitted`,
    color: countColor(d.regulatory.openEvents, 1),
  }),
  href: "/fda-483",
  hrefModule: "fda483",
};

export const KPI_REGULATORY_DEADLINES: KpiDefinition = {
  key: "regulatory-deadlines",
  label: "Response deadlines",
  icon: Clock,
  requiresModules: ["fda483"],
  select: (d) => ({
    value: String(d.regulatory.overdueResponses + d.regulatory.responsesDueSoon),
    sub: d.regulatory.overdueResponses > 0
      ? `${d.regulatory.overdueResponses} already overdue`
      : d.regulatory.responsesDueSoon > 0
        ? `due within 30 days`
        : "No response deadlines in the next 30 days",
    color: d.regulatory.overdueResponses > 0
      ? READINESS_COLORS.risk
      : countColor(d.regulatory.responsesDueSoon, 2),
  }),
  href: "/fda-483",
  hrefModule: "fda483",
};

export const KPI_REGULATORY_COMMITMENTS: KpiDefinition = {
  key: "regulatory-commitments",
  label: "Open commitments",
  icon: ClipboardCheck,
  requiresModules: ["fda483"],
  select: (d) => ({
    value: String(d.regulatory.openCommitments),
    sub: d.regulatory.overdueCommitments > 0
      ? `${d.regulatory.overdueCommitments} past due`
      : "Commitments to the agency outstanding",
    color: countColor(d.regulatory.overdueCommitments, 0),
  }),
  href: "/fda-483",
  hrefModule: "fda483",
};

export const KPI_REGULATORY_OBSERVATIONS: KpiDefinition = {
  key: "regulatory-observations",
  label: "Open observations",
  icon: FileWarning,
  requiresModules: ["fda483"],
  select: (d) => ({
    value: String(d.regulatory.openObservations),
    sub: d.regulatory.regulatoryImpactDeviations > 0
      ? `${d.regulatory.regulatoryImpactDeviations} deviation${s(d.regulatory.regulatoryImpactDeviations)} with regulatory impact`
      : "Observations not yet closed out",
    color: countColor(d.regulatory.openObservations, 2),
  }),
  href: "/fda-483",
  hrefModule: "fda483",
};

export const KPI_INSPECTION_READINESS: KpiDefinition = {
  key: "inspection-readiness",
  label: "Inspection readiness",
  icon: Building2,
  select: (d) => ({
    value: pctText(d.regulatory.inspectionReadiness),
    sub: d.regulatory.activeInspections === 0
      ? "No active inspections"
      : d.regulatory.overdueReadinessActions > 0
        ? `${d.regulatory.overdueReadinessActions} readiness action${s(d.regulatory.overdueReadinessActions)} overdue`
        : `${d.regulatory.activeInspections} active inspection${s(d.regulatory.activeInspections)}`,
    color: upPctColor(d.regulatory.inspectionReadiness),
  }),
  href: "/readiness",
};

/* ── Area-scoped (QC Lab Director / Operations Head) ─────────────────────── *
 * FACTORIES, not constants: both roles use the same formula on a different
 * `focusArea`, and only the LABEL differs. A factory keeps one implementation
 * while letting each role name the metric in its own vocabulary.               */

/** Open deviations in the role's focus area. */
export const areaDeviationsKpi = (label: string): KpiDefinition => ({
  key: "area-deviations",
  label,
  icon: AlertTriangle,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.area?.openDeviations ?? 0),
    sub: !d.area
      ? "No area assigned"
      : d.area.criticalDeviations > 0
        ? `${d.area.criticalDeviations} critical`
        : `${d.area.area} · none critical`,
    color: countColor(d.area?.criticalDeviations ?? 0, 0),
  }),
  href: "/deviation",
  hrefModule: "deviation",
});

/** Deviations in the area still awaiting a root-cause investigation. */
export const areaInvestigationsKpi = (label: string): KpiDefinition => ({
  key: "area-investigations",
  label,
  icon: Search,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.area?.awaitingInvestigation ?? 0),
    sub: d.area ? `${d.area.area} · RCA outstanding` : "No area assigned",
    color: countColor(d.area?.awaitingInvestigation ?? 0, 2),
  }),
  href: "/deviation",
  hrefModule: "deviation",
});

/** Open gap findings raised against the area. */
export const areaFindingsKpi = (label: string): KpiDefinition => ({
  key: "area-findings",
  label,
  icon: Search,
  requiresModules: ["gap"],
  select: (d) => ({
    value: String(d.area?.openFindings ?? 0),
    sub: !d.area
      ? "No area assigned"
      : d.area.criticalFindings > 0
        ? `${d.area.criticalFindings} critical`
        : `${d.area.area} · none critical`,
    color: countColor(d.area?.criticalFindings ?? 0, 0),
  }),
  href: "/gap-assessment",
  hrefModule: "gap",
});

/** Overdue CAPAs attributed to the area. */
export const areaCapaKpi = (label: string): KpiDefinition => ({
  key: "area-capa-overdue",
  label,
  icon: Clock,
  select: (d) => ({
    value: String(d.area?.overdueCAPAs ?? 0),
    sub: !d.area
      ? "No area assigned"
      : `${d.area.openCAPAs} open in ${d.area.area}`,
    color: countColor(d.area?.overdueCAPAs ?? 0, 0),
  }),
  href: "/capa",
  hrefModule: "capa",
});

/** Weighted readiness for the area — the shared calculateReadiness model. */
export const areaReadinessKpi = (label: string): KpiDefinition => ({
  key: "area-readiness",
  label,
  icon: ShieldCheck,
  select: (d) => ({
    value: d.area?.readiness.percentage ?? "—",
    sub: d.area ? `${d.area.area} · ${d.area.readiness.status}` : "No area assigned",
    color: d.area?.readiness.color ?? READINESS_COLORS.none,
  }),
});

/** Open area deviations that recorded an affected batch (Deviation.batchesAffected). */
export const areaBatchImpactKpi = (label: string): KpiDefinition => ({
  key: "area-batch-impact",
  label,
  icon: Package,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.area?.batchImpacting ?? 0),
    sub: d.area
      ? `${d.area.area} deviations recording affected batches`
      : "No area assigned",
    color: countColor(d.area?.batchImpacting ?? 0, 0),
  }),
  href: "/deviation",
  hrefModule: "deviation",
});

/** Open area deviations attributed to equipment (Deviation.category). */
export const areaEquipmentKpi = (label: string): KpiDefinition => ({
  key: "area-equipment",
  label,
  icon: Wrench,
  requiresModules: ["deviation"],
  select: (d) => ({
    value: String(d.area?.equipmentRelated ?? 0),
    sub: d.area
      ? `equipment-category deviations in ${d.area.area}`
      : "No area assigned",
    color: countColor(d.area?.equipmentRelated ?? 0, 1),
  }),
  href: "/deviation",
  hrefModule: "deviation",
});

/* ── Change control (flag-gated) ─────────────────────────────────────────── */

export const KPI_CHANGE_CONTROLS: KpiDefinition = {
  key: "change-controls",
  label: "Changes in flight",
  icon: GitCompareArrows,
  guard: changeControlGuard,
  select: (d) => ({
    value: String(d.operations.changeControlsOpen),
    sub: d.operations.changeControlsOverdue > 0
      ? `${d.operations.changeControlsOverdue} past target date`
      : `${d.operations.changeControlsInImplementation} in implementation`,
    color: countColor(d.operations.changeControlsOverdue, 0),
  }),
  href: "/change-control",
};

/* ── Tenant health (Customer Admin) ──────────────────────────────────────── */

export const KPI_ACTIVE_USERS: KpiDefinition = {
  key: "active-users",
  label: "Active users",
  icon: Users,
  guard: tenantAdminGuard,
  select: (d) => ({
    value: String(d.tenant.activeUsers),
    sub: d.tenant.seatsTotal > 0
      ? `${d.tenant.seatsUsed} of ${d.tenant.seatsTotal} seats used`
      : `${d.tenant.inactiveUsers} inactive`,
    color: d.tenant.seatUtilisation === null
      ? READINESS_COLORS.ready
      : downPctColor(d.tenant.seatUtilisation, 85),
  }),
  href: "/settings",
  hrefModule: "settings",
};

export const KPI_ACTIVE_SITES: KpiDefinition = {
  key: "active-sites",
  label: "Active sites",
  icon: Building2,
  guard: tenantAdminGuard,
  select: (d) => ({
    value: String(d.tenant.activeSites),
    sub: d.tenant.siteCapacity > 0
      ? `of ${d.tenant.siteCapacity} licensed`
      : "no site cap on this plan",
    color: d.tenant.activeSites === 0 ? READINESS_COLORS.watch : READINESS_COLORS.ready,
  }),
  href: "/settings",
  hrefModule: "settings",
};

export const KPI_LICENCE_STATUS: KpiDefinition = {
  key: "licence-status",
  label: "Licence status",
  icon: ShieldCheck,
  guard: tenantAdminGuard,
  select: (d) => ({
    value: d.tenant.licenceExpired
      ? "Expired"
      : d.tenant.licenceDaysRemaining === null
        ? "—"
        : `${d.tenant.licenceDaysRemaining}d`,
    sub: d.tenant.planName
      ? d.tenant.licenceExpired ? `${d.tenant.planName} · renew now` : `${d.tenant.planName} remaining`
      : "No plan assigned",
    color: d.tenant.licenceExpired
      ? READINESS_COLORS.risk
      : d.tenant.licenceDaysRemaining === null
        ? READINESS_COLORS.none
        : d.tenant.licenceDaysRemaining <= 14
          ? READINESS_COLORS.watch
          : READINESS_COLORS.ready,
  }),
  href: "/settings",
  hrefModule: "settings",
};

export const KPI_MODULE_ADOPTION: KpiDefinition = {
  key: "module-adoption",
  label: "Modules in use",
  icon: Layers,
  guard: tenantAdminGuard,
  select: (d) => ({
    value: `${d.tenant.modulesInUse}/${d.tenant.moduleAdoption.length}`,
    sub: d.tenant.modulesInUse === 0
      ? "No records logged yet"
      : `${d.tenant.moduleAdoption[0]?.label ?? ""} most active`,
    color: d.tenant.modulesInUse === 0
      ? READINESS_COLORS.watch
      : d.tenant.modulesInUse >= Math.ceil(d.tenant.moduleAdoption.length / 2)
        ? READINESS_COLORS.ready
        : READINESS_COLORS.watch,
  }),
};

/* ══════════════════════════════════════════════════════════════════════════
 * QUICK ACTIONS — Phase 5
 * ══════════════════════════════════════════════════════════════════════════
 * A quick action NAVIGATES to the module that owns the operation; the mutation
 * itself always happens behind that module's own server-action gate. Each action
 * declares the permission it needs, so a role never sees a shortcut whose target
 * would reject it.
 */

export const QA_CREATE_DEVIATION: QuickAction = {
  key: "log-deviation",
  label: "Log a deviation",
  description: "Report a new deviation for triage",
  icon: AlertTriangle,
  href: "/deviation",
  requiresModules: ["deviation"],
  guard: (a) => a.can("deviation").canCreate,
};

export const QA_REVIEW_CAPA: QuickAction = {
  key: "review-capa",
  label: "Review CAPAs",
  description: "Work the CAPA review and sign-off queue",
  icon: ClipboardCheck,
  href: "/capa",
  guard: allOf(capaModuleGuard, (a) => a.can("capa").canReview || a.can("capa").canApprove),
};

export const QA_RAISE_FINDING: QuickAction = {
  key: "raise-finding",
  label: "Raise a gap finding",
  description: "Log an audit or self-inspection observation",
  icon: Search,
  href: "/gap-assessment",
  requiresModules: ["gap"],
  guard: (a) => a.can("gap").canCreate,
};

export const QA_APPROVE_INVESTIGATIONS: QuickAction = {
  key: "approve-investigations",
  label: "Approve investigations",
  description: "Close out root-cause analyses awaiting QA",
  icon: ClipboardList,
  href: "/deviation",
  requiresModules: ["deviation"],
  guard: (a) => a.can("deviation").canApprove,
};

export const ADMIN_MANAGE_USERS: QuickAction = {
  key: "manage-users",
  label: "Manage users",
  description: "Add seats, assign roles and site access",
  icon: Users,
  href: "/settings",
  requiresModules: ["settings"],
  guard: allOf(tenantAdminGuard, (a) => a.can("settings").canEdit),
};

export const ADMIN_SYSTEM_SETTINGS: QuickAction = {
  key: "system-settings",
  label: "System settings",
  description: "Org profile, sites, frameworks and permissions",
  icon: Settings,
  href: "/settings",
  requiresModules: ["settings"],
  guard: (a) => a.can("settings").canEdit,
};

export const ADMIN_ORG_REPORTS: QuickAction = {
  key: "org-reports",
  label: "Organisation reports",
  description: "Tenant-wide KPI scorecards and exports",
  icon: BarChart3,
  href: "/governance?tab=kpis",
  guard: governanceGuard,
};

export const ADMIN_AGI_POLICY: QuickAction = {
  key: "agi-policy",
  label: "AGI policy",
  description: "Tune which AI agents run autonomously",
  icon: Bot,
  href: "/ai-policy",
  guard: tenantAdminGuard,
};

export const REG_CREATE_SUBMISSION: QuickAction = {
  key: "log-483",
  label: "Log an inspection event",
  description: "Record a 483 / inspection outcome and its observations",
  icon: FileWarning,
  href: "/fda-483",
  requiresModules: ["fda483"],
  guard: (a) => a.can("fda483").canCreate,
};

export const REG_REVIEW_SUBMISSIONS: QuickAction = {
  key: "review-483",
  label: "Review 483 responses",
  description: "Draft, sign and submit the agency response",
  icon: FileText,
  href: "/fda-483",
  requiresModules: ["fda483"],
  guard: (a) => a.can("fda483").canApprove,
};

export const REG_INSPECTION_CHECKLIST: QuickAction = {
  key: "inspection-checklist",
  label: "Inspection checklist",
  description: "Work the readiness actions and training plan",
  icon: ListChecks,
  href: "/readiness",
};

export const REG_REVIEW_REGULATIONS: QuickAction = {
  key: "review-regulations",
  label: "Review regulations",
  description: "FDA / EMA guidance monitoring and framework scope",
  icon: Building2,
  href: "/regulatory-intelligence",
};

export const CSV_CREATE_VALIDATION: QuickAction = {
  key: "register-system",
  label: "Register a system",
  description: "Add a GxP system and start its validation lifecycle",
  icon: Database,
  href: "/csv-csa",
  requiresModules: ["csv"],
  guard: (a) => a.can("csv").canCreate,
};

export const CSV_RISK_ASSESSMENT: QuickAction = {
  key: "risk-assessment",
  label: "Risk assessment",
  description: "Classify GAMP 5 category, DI and patient-safety risk",
  icon: ShieldAlert,
  href: "/csv-csa",
  requiresModules: ["csv"],
  guard: (a) => a.can("csv").canEdit,
};

export const CSV_VALIDATION_REPORTS: QuickAction = {
  key: "validation-reports",
  label: "Validation reports",
  description: "Stage packages, RTM coverage and sign-off evidence",
  icon: FileText,
  href: "/csv-csa",
  requiresModules: ["csv"],
};

export const LAB_LOG_INVESTIGATION: QuickAction = {
  key: "log-lab-investigation",
  label: "Log a lab investigation",
  description: "Report a QC Lab deviation for investigation",
  icon: AlertTriangle,
  href: "/deviation",
  requiresModules: ["deviation"],
  guard: (a) => a.can("deviation").canCreate,
};

export const OPS_CHANGE_CONTROL: QuickAction = {
  key: "raise-change-control",
  label: "Raise a change control",
  description: "Start a controlled change with impact assessment",
  icon: GitCompareArrows,
  href: "/change-control",
  guard: allOf(changeControlGuard, writeGuard),
};

export const SHARED_UPLOAD_EVIDENCE: QuickAction = {
  key: "upload-evidence",
  label: "Upload evidence",
  description: "Attach controlled documents to a record",
  icon: FileText,
  href: "/evidence",
  requiresModules: ["evidence"],
  guard: (a) => a.can("evidence").canCreate,
};

export const SHARED_MY_WORKLIST: QuickAction = {
  key: "my-worklist",
  label: "Open my worklist",
  description: "Everything assigned to you across modules",
  icon: ListChecks,
  href: "/worklist",
};

export const SHARED_RAISE_RISK: QuickAction = {
  key: "raise-risk",
  label: "Raise a risk",
  description: "Add an entry to the governance risk register",
  icon: ShieldAlert,
  href: "/governance?tab=risks",
  guard: allOf(governanceGuard, (a) => a.can("governance").canCreate),
};

/* ══════════════════════════════════════════════════════════════════════════
 * NAVIGATION SHORTCUTS (the rail's badge list)
 * ══════════════════════════════════════════════════════════════════════════
 * Replaces the old hardcoded "Quick links" block, which linked EVERY role to
 * /capa, /csv-csa, /fda-483 and /gap-assessment with live counts regardless of
 * permission. Each shortcut now declares its gate, so the badge disappears
 * together with the link.
 */

export const NAV_GAP: NavShortcut = {
  key: "nav-gap",
  label: "Gap Assessment",
  icon: Search,
  href: "/gap-assessment",
  requiresModules: ["gap"],
  badge: (d) => d.quality.openFindings,
  badgeColor: READINESS_COLORS.risk,
};

export const NAV_DEVIATION: NavShortcut = {
  key: "nav-deviation",
  label: "Deviation Management",
  icon: AlertTriangle,
  href: "/deviation",
  requiresModules: ["deviation"],
  badge: (d) => d.quality.openDeviations,
  badgeColor: READINESS_COLORS.risk,
};

export const NAV_CAPA: NavShortcut = {
  key: "nav-capa",
  label: "CAPA Tracker",
  icon: ClipboardCheck,
  href: "/capa",
  guard: capaModuleGuard,
  badge: (d) => d.quality.openCAPAs,
  badgeColor: READINESS_COLORS.watch,
};

export const NAV_CSV: NavShortcut = {
  key: "nav-csv",
  label: "CSV/CSA Validation",
  icon: Database,
  href: "/csv-csa",
  requiresModules: ["csv"],
  badge: (d) => d.validation.highRisk,
  badgeColor: READINESS_COLORS.watch,
};

export const NAV_FDA483: NavShortcut = {
  key: "nav-fda483",
  label: "Inspections & Regulatory",
  icon: FileWarning,
  href: "/fda-483",
  requiresModules: ["fda483"],
  badge: (d) => d.regulatory.openEvents,
  badgeColor: READINESS_COLORS.risk,
};

export const NAV_EVIDENCE: NavShortcut = {
  key: "nav-evidence",
  label: "Evidence & Documents",
  icon: FileText,
  href: "/evidence",
  requiresModules: ["evidence"],
};

export const NAV_WORKLIST: NavShortcut = {
  key: "nav-worklist",
  label: "My Worklist",
  icon: ListChecks,
  href: "/worklist",
  badge: (d) => d.pendingTasks.length,
  badgeColor: READINESS_COLORS.watch,
};

export const NAV_READINESS: NavShortcut = {
  key: "nav-readiness",
  label: "Training & Awareness",
  icon: GraduationCap,
  href: "/readiness",
};

export const NAV_GOVERNANCE: NavShortcut = {
  key: "nav-governance",
  label: "Governance & KPIs",
  icon: BarChart3,
  href: "/governance",
  guard: governanceGuard,
};

export const NAV_NOTIFICATIONS: NavShortcut = {
  key: "nav-notifications",
  label: "Notifications",
  icon: Bell,
  href: "/notifications",
};

export const NAV_SETTINGS: NavShortcut = {
  key: "nav-settings",
  label: "Settings",
  icon: SlidersHorizontal,
  href: "/settings",
  requiresModules: ["settings"],
};

export const NAV_AUDIT_TRAIL: NavShortcut = {
  key: "nav-audit-trail",
  label: "Audit Trail",
  icon: ClipboardList,
  href: "/audit-trail",
  guard: auditTrailGuard,
};
