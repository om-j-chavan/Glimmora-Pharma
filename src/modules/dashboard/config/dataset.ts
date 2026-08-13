/**
 * ROLE-BASED DASHBOARD — the assembled data model (Phase 3).
 *
 * ONE object, built once per render by `useDashboardData()`, that every KPI
 * selector and widget reads. Two properties make the role dashboards safe:
 *
 *   • TWO SCOPES, NEVER MIXED.
 *       `*` arrays (findings/capas/…)      → TENANT-WIDE. Counted, never listed.
 *       `visible*` arrays                  → VISIBILITY-SCOPED. Listed as rows.
 *     This preserves the existing dashboard's decision #5 exactly: a manager sees
 *     honest totals, but no widget can render a record row the viewer is not
 *     allowed to open on its module page.
 *
 *   • EVERY FIELD IS REAL. Each value traces to a persisted column via the pure
 *     `src/lib/kpi` formulas. Nothing here is seeded, sampled or placeholder.
 *
 * Framework-agnostic types only, so config modules can import this without
 * pulling React in.
 */

import type {
  AreaKPIs, DashboardKPIs, DeviationTrendPoint, KPIChangeControl, KPICapa,
  KPIDeviation, KPIFinding, KPIInspectionReadiness, OperationsKPIs, QualityKPIs,
  RegulatoryFDA483, RegulatoryKPIs, SeverityTrendPoint, TenantKPIs,
  ValidationKPIs, ValidationSystem,
} from "@/lib/kpi";
import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { Finding } from "@/store/findings.slice";
import type { GxPSystem } from "@/types/csv-csa";

/* ══════════════════════════════════════════════════════════════════════════
 * Derived, presentation-ready entries
 * ══════════════════════════════════════════════════════════════════════════ */

/** One row in the "Alerts" widget — a signal that needs a decision. */
export interface AlertEntry {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string | null;
  /** Module that owns `href` — the resolver strips links the role can't follow. */
  module?: string;
}

/** One row in the "Pending tasks" widget — work addressed to THIS user. */
export interface PendingTaskEntry {
  id: string;
  title: string;
  context: string;
  /** ISO date, or null when the task carries no due date. */
  dueDate: string | null;
  overdue: boolean;
  status: string;
  href: string;
}

/** A compliance-status line — a named posture check with a pass/watch/fail state. */
export interface ComplianceLine {
  key: string;
  label: string;
  /** Formatted value, "—" when not measurable from the tenant's records. */
  value: string;
  state: "ok" | "watch" | "risk" | "none";
  detail: string;
}

/* ══════════════════════════════════════════════════════════════════════════
 * The dataset
 * ══════════════════════════════════════════════════════════════════════════ */

export interface DashboardDataset {
  /* ── Scope A: TENANT-WIDE aggregates (counts only, never rendered as rows) ── */
  findings: Finding[];
  capas: CAPA[];
  systems: GxPSystem[];
  deviations: KPIDeviation[];
  fda483: RegulatoryFDA483[];
  changeControls: KPIChangeControl[];
  inspections: KPIInspectionReadiness[];

  /* ── Scope B: VISIBILITY-SCOPED content (the only source of record rows) ── */
  visibleFindings: Finding[];
  visibleCAPAs: CAPA[];
  visibleDeviations: Deviation[];
  visibleSystems: GxPSystem[];

  /* ── Metric groups (pure, from src/lib/kpi) ── */
  core: DashboardKPIs;
  quality: QualityKPIs;
  regulatory: RegulatoryKPIs;
  validation: ValidationKPIs;
  operations: OperationsKPIs;
  tenant: TenantKPIs;
  /** Area metrics for the role's focus area; null for tenant-wide roles. */
  area: AreaKPIs | null;

  /* ── Headline readiness (server-computed inspection-action completion) ── */
  readinessScore: number;
  readinessLabel: { label: string; color: string };

  /* ── Chart series ── */
  findingTrend: SeverityTrendPoint[];
  findingTrendEmpty: boolean;
  deviationTrend: DeviationTrendPoint[];
  deviationTrendEmpty: boolean;

  /* ── Derived lists ── */
  alerts: AlertEntry[];
  pendingTasks: PendingTaskEntry[];
  compliance: ComplianceLine[];

  /* ── Context ── */
  /** Sites the viewer may see, already narrowed by selection. */
  sites: { id: string; name: string }[];
  /** Epoch ms "now", captured once per render so every metric agrees. */
  now: number;
  /** Tenant display name. */
  tenantName: string;
  /** Org date-formatting preferences. */
  timezone: string;
  dateFormat: string;
  /** Systems adapted for validation maths (stages included). */
  validationSystems: ValidationSystem[];
  /** Narrowed CAPA/finding/deviation input the area metrics were built from. */
  capaAreaOf: (c: KPICapa) => string;
  /** Tenant-wide finding array in KPI shape (for area/heatmap recomputation). */
  kpiFindings: KPIFinding[];
  kpiCapas: KPICapa[];
  /**
   * The SEVERITY-INDEPENDENT findings the readiness/risk model and the area
   * heatmap score. Distinct from `kpiFindings`, which answers the severity
   * dropdown: a posture must not improve because the reader filtered out the
   * severities that were dragging it down.
   */
  kpiScoredFindings: KPIFinding[];
  /**
   * The active period filter ("7" | "30" | "60" | "90" | "all"). Exposed ONLY so a
   * period-scoped surface can label its own window. No current-state metric may
   * read it — see the scope comments in `useDashboardData`.
   */
  period: string;
}
