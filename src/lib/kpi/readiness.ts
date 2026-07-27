/**
 * THE single readiness formula (Phase 3).
 *
 * Before this module, site/area readiness was computed THREE different ways:
 *   • Dashboard area heatmap:  100 − crit*30 − high*15 − capaOverdue*20 − sysRisk*25
 *   • Governance site heatmap:  100 − crit*15 − open*5 − sysRisk*25
 *   • dashboard.ts complianceScore (unused): 100 − crit*15 − overdueCAPA*10 − ...
 * so the same site could score differently on two screens. `calculateReadiness`
 * replaces all of them with ONE weighted-penalty model. Feed it area-scoped
 * counts for the Dashboard heatmap, site-scoped counts for a Governance site,
 * or tenant-wide counts for an org roll-up — same weights, same result.
 *
 * NOTE on the HEADLINE "Overall readiness" number: that stays the server's
 * inspection-action completion score (`getOverallReadiness`) — it is already
 * identical on both screens and is a different, deliberately auditable metric.
 * `readinessStatus()` / `headlineReadinessLabel()` here unify only its
 * label + colour so the presentation is shared too.
 */

/** Penalty weights, one place. Higher = a bigger hit to readiness. */
export const READINESS_WEIGHTS = {
  /** open Critical finding */
  critical: 15,
  /** open non-critical finding (High/Medium/Low) */
  finding: 5,
  /** HIGH-risk system not yet validated */
  highRiskSystem: 10,
  /** CAPA past its due date */
  capaOverdue: 12,
  /** system Overdue or Part11/Annex11 Non-Compliant */
  validationRisk: 8,
  /** open DI-gate CAPA */
  diException: 10,
} as const;

/** How much the training-compliance % pulls the risk score (0–1). */
export const TRAINING_WEIGHT = 0.15;

/** Score thresholds shared by every readiness surface. */
export const READINESS_THRESHOLDS = { ready: 80, watch: 60 } as const;

/** Semantic colours (match the palette used across the app). */
export const READINESS_COLORS = {
  ready: "#10b981",
  watch: "#f59e0b",
  risk: "#ef4444",
  none: "#64748b",
} as const;

export interface ReadinessInputs {
  /** total OPEN findings (Critical + High + Medium + Low) */
  findings?: number;
  /** OPEN Critical findings (subset of `findings`) */
  criticalFindings?: number;
  /** HIGH-risk systems not yet Validated */
  highRiskSystems?: number;
  /** CAPAs past due */
  capaOverdue?: number;
  /** systems Overdue / Part11 / Annex11 non-compliant */
  validationRisk?: number;
  /** training compliance 0–100, or null when unknown (not penalised) */
  trainingCompliance?: number | null;
  /** open DI-gate CAPAs */
  diExceptions?: number;
}

export interface ReadinessResult {
  /** 0–100, or null when there is nothing to score. */
  score: number | null;
  /** "Inspection ready" | "Needs attention" | "Not ready" | "No data" */
  status: string;
  color: string;
  /** e.g. "83%" (or "—" when score is null) — ready for direct render. */
  percentage: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Map a readiness score to its shared status + colour. `null` → "No data".
 * The ONE place thresholds → labels/colours live, so every heatmap cell, KPI
 * card and ranking row reads the same bands.
 */
export function readinessStatus(score: number | null): { status: string; color: string } {
  if (score === null) return { status: "No data", color: READINESS_COLORS.none };
  if (score >= READINESS_THRESHOLDS.ready) return { status: "Inspection ready", color: READINESS_COLORS.ready };
  if (score >= READINESS_THRESHOLDS.watch) return { status: "Needs attention", color: READINESS_COLORS.watch };
  return { status: "Not ready", color: READINESS_COLORS.risk };
}

/** Risk tier derived from a readiness score (inverse of readiness). */
export function readinessRiskLevel(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score < READINESS_THRESHOLDS.watch) return "HIGH";
  if (score < READINESS_THRESHOLDS.ready) return "MEDIUM";
  return "LOW";
}

/**
 * Compute a readiness score + status + colour from weighted risk penalties.
 * Pass `hasData: false` to force a null/"No data" result for an area or site
 * that has never been assessed (so an untouched cell reads "not assessed"
 * rather than a misleading 100%).
 */
export function calculateReadiness(
  input: ReadinessInputs,
  opts: { hasData?: boolean } = {},
): ReadinessResult {
  if (opts.hasData === false) {
    const s = readinessStatus(null);
    return { score: null, status: s.status, color: s.color, percentage: "—" };
  }

  const findings = input.findings ?? 0;
  const criticalFindings = input.criticalFindings ?? 0;
  const nonCritical = Math.max(0, findings - criticalFindings);
  const W = READINESS_WEIGHTS;

  const penalty =
    criticalFindings * W.critical +
    nonCritical * W.finding +
    (input.highRiskSystems ?? 0) * W.highRiskSystem +
    (input.capaOverdue ?? 0) * W.capaOverdue +
    (input.validationRisk ?? 0) * W.validationRisk +
    (input.diExceptions ?? 0) * W.diException;

  let raw = clamp(100 - penalty, 0, 100);

  // Blend in training compliance when available: 85% risk score + 15% training.
  const training = input.trainingCompliance;
  if (training !== null && training !== undefined) {
    raw = raw * (1 - TRAINING_WEIGHT) + training * TRAINING_WEIGHT;
  }

  const score = clamp(Math.round(raw), 0, 100);
  const s = readinessStatus(score);
  return { score, status: s.status, color: s.color, percentage: `${score}%` };
}

/**
 * Headline "Overall readiness" label — used by the Dashboard + Governance KPI
 * cards. Layers the overdue-CAPA override on top of the score bands (an org
 * with overdue CAPAs is never "ready" no matter the completion score). Moved
 * verbatim from DashboardPage.getReadinessLabel so both cards share it.
 */
export function headlineReadinessLabel(
  score: number | null,
  overdueCapaCount: number,
): { label: string; color: string } {
  if (score === null) return { label: "Log findings to calculate", color: READINESS_COLORS.none };
  if (overdueCapaCount >= 2) return { label: "Not ready", color: READINESS_COLORS.risk };
  if (overdueCapaCount >= 1) return { label: "Needs attention", color: READINESS_COLORS.watch };
  if (score >= 95) return { label: "Inspection ready ✓", color: READINESS_COLORS.ready };
  if (score >= READINESS_THRESHOLDS.ready) return { label: "Nearing ready", color: READINESS_COLORS.watch };
  if (score >= READINESS_THRESHOLDS.watch) return { label: "Needs attention", color: READINESS_COLORS.watch };
  return { label: "Not ready", color: READINESS_COLORS.risk };
}
