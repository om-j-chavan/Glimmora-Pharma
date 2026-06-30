/**
 * Subscription Phase A — single source of truth for plan tiers.
 *
 * The four tiers and their caps live here. ESSENTIALS / PROFESSIONAL /
 * ENTERPRISE have fixed caps; on assignment those caps are COPIED (frozen)
 * onto the Plan row so editing these constants later never silently re-caps
 * a live tenant. TAILORED lets a super_admin set each cap, bounded by
 * TAILORED_CEILINGS, with an optional display name.
 *
 * minRetentionYears is a retention PROMISE only — there is no purge logic in
 * Phase 1.
 *
 * This module depends only on the shared dayjs util, so it can be imported
 * from the server (actions, seed), the client (admin UI), and shared hooks
 * alike. (Relative import so the seed's tsx runtime resolves it.)
 */

import dayjs from "./dayjs";

export type PlanTier = "ESSENTIALS" | "PROFESSIONAL" | "ENTERPRISE" | "TAILORED";

export interface PlanCaps {
  maxUsers: number;
  maxSites: number;
  minRetentionYears: number;
  /** Subscription term in months. expiryDate = startDate + durationMonths. */
  durationMonths: number;
}

/** Fixed-tier defaults. TAILORED is intentionally absent — it has no preset. */
export const PLAN_TIERS = {
  ESSENTIALS: { maxUsers: 10, maxSites: 2, minRetentionYears: 1, durationMonths: 12 },
  PROFESSIONAL: { maxUsers: 30, maxSites: 5, minRetentionYears: 3, durationMonths: 12 },
  ENTERPRISE: { maxUsers: 100, maxSites: 10, minRetentionYears: 7, durationMonths: 12 },
} as const satisfies Record<Exclude<PlanTier, "TAILORED">, PlanCaps>;

/** Upper bounds a TAILORED plan's custom caps may not exceed. */
export const TAILORED_CEILINGS: PlanCaps = {
  maxUsers: 1000,
  maxSites: 50,
  minRetentionYears: 10,
  durationMonths: 120, // 10 years
};

/**
 * Compliance FLOOR for a TAILORED plan's retention promise. A tenant must not
 * promise LESS retention than the data layer already enforces: every evidence
 * file / document / stage-doc is kept for a hard 7-year "Part 11 retention
 * floor" (retainUntil = upload + 7y — see src/actions/evidence.ts, documents.ts,
 * systems.ts). Distinct from the >=1 floor and the ceiling; gates TAILORED only
 * (fixed tiers use their presets). NOT coupled to duration or usage counts.
 */
export const MIN_TAILORED_RETENTION_YEARS = 7;

export const PLAN_TIER_VALUES: readonly PlanTier[] = [
  "ESSENTIALS",
  "PROFESSIONAL",
  "ENTERPRISE",
  "TAILORED",
];

/** True for the three tiers whose caps are preset (i.e. not TAILORED). */
export function isFixedTier(tier: PlanTier): tier is Exclude<PlanTier, "TAILORED"> {
  return tier !== "TAILORED";
}

/**
 * Resolve the caps to freeze onto a Plan row at assignment time.
 * Fixed tiers copy from PLAN_TIERS (custom is ignored). TAILORED uses the
 * supplied custom caps, each clamped to its ceiling and floored at 1.
 */
export function resolvePlanCaps(tier: PlanTier, custom?: Partial<PlanCaps>): PlanCaps {
  if (isFixedTier(tier)) {
    return { ...PLAN_TIERS[tier] };
  }
  const clamp = (v: number | undefined, ceiling: number) =>
    Math.max(1, Math.min(v ?? ceiling, ceiling));
  return {
    maxUsers: clamp(custom?.maxUsers, TAILORED_CEILINGS.maxUsers),
    maxSites: clamp(custom?.maxSites, TAILORED_CEILINGS.maxSites),
    minRetentionYears: clamp(custom?.minRetentionYears, TAILORED_CEILINGS.minRetentionYears),
    durationMonths: clamp(custom?.durationMonths, TAILORED_CEILINGS.durationMonths),
  };
}

/**
 * Validate proposed TAILORED caps against the ceilings. Returns a human
 * message on the first violation, or null when all caps are in range.
 * (Fixed tiers never need validation — they ignore custom caps.)
 */
export function validateTailoredCaps(custom: Partial<PlanCaps>): string | null {
  const checks: Array<[keyof PlanCaps, string, number]> = [
    ["maxUsers", "Max users", TAILORED_CEILINGS.maxUsers],
    ["maxSites", "Max sites", TAILORED_CEILINGS.maxSites],
    ["minRetentionYears", "Min retention (years)", TAILORED_CEILINGS.minRetentionYears],
    ["durationMonths", "Duration (months)", TAILORED_CEILINGS.durationMonths],
  ];
  for (const [key, label, ceiling] of checks) {
    const v = custom[key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || v < 1) return `${label} must be a whole number of at least 1.`;
    if (v > ceiling) return `${label} cannot exceed ${ceiling} for a Tailored plan.`;
  }
  return null;
}

/**
 * Derive a subscription expiry from a start date + a term in months, using
 * calendar-month math (dayjs adds whole months and clamps end-of-month:
 * Jan 31 + 1mo → Feb 28 — NOT start + N*30 days). Returns an ISO string.
 * Single source of truth for the derived expiry, used by both the server write
 * (assignPlan) and the optimistic client (draftToPlanConfig / form preview).
 */
export function resolveExpiry(startISO: string, months: number): string {
  return dayjs.utc(startISO).add(months, "month").toISOString();
}

/** Display label for a plan: the tier name, or the TAILORED display name. */
export function planLabel(tier: PlanTier, displayName?: string | null): string {
  if (tier === "TAILORED") return displayName?.trim() || "TAILORED";
  return tier;
}
