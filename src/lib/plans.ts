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
import { CAP_ELIGIBLE_ROLES } from "./labels/roles";

export type PlanTier = "ESSENTIALS" | "PROFESSIONAL" | "ENTERPRISE" | "TAILORED";

export interface PlanCaps {
  maxUsers: number;
  maxSites: number;
  minRetentionYears: number;
  /** Subscription term in months. expiryDate = startDate + durationMonths. */
  durationMonths: number;
}

/**
 * Fixed-tier defaults — enterprise-QMS-realistic, with a clear step-up per tier:
 *   Users 25 → 75 → 250, Sites 3 → 10 → 30, Retention 6 → 8 → 10 yr.
 * TAILORED is intentionally absent — it has no preset.
 */
export const PLAN_TIERS = {
  ESSENTIALS: { maxUsers: 25, maxSites: 3, minRetentionYears: 6, durationMonths: 12 },
  PROFESSIONAL: { maxUsers: 75, maxSites: 10, minRetentionYears: 8, durationMonths: 12 },
  ENTERPRISE: { maxUsers: 250, maxSites: 30, minRetentionYears: 10, durationMonths: 12 },
} as const satisfies Record<Exclude<PlanTier, "TAILORED">, PlanCaps>;

/**
 * PRE-rebalance fixed-tier maxUsers — retained ONLY so the role-cap seed can tell
 * an untouched (old-default) PlanRoleLimit row from an admin-edited one during the
 * one-time migration to the new defaults. Not used at runtime otherwise.
 */
export const LEGACY_TIER_MAXUSERS: Record<Exclude<PlanTier, "TAILORED">, number> = {
  ESSENTIALS: 10,
  PROFESSIONAL: 30,
  ENTERPRISE: 100,
};

/** Upper bounds a TAILORED plan's custom caps may not exceed. */
export const TAILORED_CEILINGS: PlanCaps = {
  maxUsers: 1000,
  maxSites: 500,
  minRetentionYears: 30,
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

/**
 * Min/max bounds for the configurable plan fields (Create/Edit Tenant). Enforced
 * BOTH in the steppers (clamp) AND server-side (assignPlan / setTenantRoleLimits).
 *   • Max Sites: [1, 500]      — realistic multi-site GxP, no runaway.
 *   • Retention: [7, 30] yr    — 7 = Part 11 floor; 30 = a sane upper promise.
 *   • Duration:  [1, 120] mo   — 1 month … 10 years.
 *   • Role cap:  [0, 500]      — per-role ceiling (0 disables a role); for TAILORED
 *                                this keeps the computed Total (Σ caps) from running
 *                                away, and the Total itself is capped at
 *                                TAILORED_CEILINGS.maxUsers server-side.
 */
export const PLAN_FIELD_BOUNDS = {
  maxSites: { min: 1, max: 500 },
  retentionYears: { min: MIN_TAILORED_RETENTION_YEARS, max: 30 },
  durationMonths: { min: 1, max: 120 },
  roleCap: { min: 0, max: 500 },
} as const;

/** Starter Total for a fresh TAILORED plan at creation (role caps are seeded to
 *  sum to this; the SA then adjusts each role and the Total recomputes live). */
export const TAILORED_START_USERS = 50;

/* ── Per-role default caps — allocate EVERY user slot to a role (sum == total) ──
 * Relative SHARE of a plan's maxUsers per seat role. Weights are proportions
 * (they need not sum to 1 — distributeExact normalizes them). Derived (not a
 * per-tier literal) so it also covers TAILORED / any maxUsers.
 */
export const ROLE_DEFAULT_WEIGHTS: Record<string, number> = {
  qa: 0.2,
  viewer: 0.18,
  qa_head: 0.12,
  operations_head: 0.1,
  qc_lab_director: 0.08,
  regulatory_affairs: 0.08,
  csv_val_lead: 0.06,
  it_cdo: 0.06,
};

/**
 * Split `budget` whole users across `roles` proportional to their weights, summing
 * EXACTLY to `budget` (largest-remainder method distributes the rounding leftover).
 * Non-negative integers. budget ≤ 0 → all zero.
 */
export function distributeExact(budget: number, roles: readonly string[], weights: Record<string, number>): Record<string, number> {
  if (budget <= 0 || roles.length === 0) return Object.fromEntries(roles.map((r) => [r, 0]));
  const totalW = roles.reduce((s, r) => s + (weights[r] ?? 0), 0) || roles.length;
  const parts = roles.map((role) => {
    const exact = budget * ((weights[role] ?? 0) / totalW);
    const floor = Math.floor(exact);
    return { role, cap: floor, frac: exact - floor };
  });
  let remainder = budget - parts.reduce((s, p) => s + p.cap, 0);
  // Give the leftover slots to the largest fractional parts, one each.
  parts.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < parts.length && remainder > 0; i++) { parts[i].cap += 1; remainder -= 1; }
  return Object.fromEntries(parts.map((p) => [p.role, p.cap]));
}

/**
 * Default per-role caps for a plan, summing EXACTLY to maxUsers (every user slot
 * allocated to a role — no ∞, no unallocated slack).
 *
 * Standard-tier results (sum == maxUsers):
 *   ESSENTIALS (25):  qa 6, viewer 5, qa_head 3, operations_head 3, qc_lab_director 2,
 *                     regulatory_affairs 2, csv_val_lead 2, it_cdo 2  = 25
 *   PROFESSIONAL (75): qa 17, viewer 15, qa_head 10, operations_head 9, qc_lab_director 7,
 *                     regulatory_affairs 7, csv_val_lead 5, it_cdo 5  = 75
 *   ENTERPRISE (250): qa 57, viewer 51, qa_head 34, operations_head 28, qc_lab_director 23,
 *                     regulatory_affairs 23, csv_val_lead 17, it_cdo 17  = 250
 */
export function defaultRoleCapsForPlan(maxUsers: number): Record<string, number> {
  return distributeExact(maxUsers, CAP_ELIGIBLE_ROLES, ROLE_DEFAULT_WEIGHTS);
}

/**
 * PRE-rebalance default caps (the old `max(1, floor(weight·maxUsers))` + trim,
 * summing to ≤ maxUsers with slack). Retained ONLY for the seed's edit-detection:
 * a PlanRoleLimit row still equal to this legacy value was never admin-edited and
 * is safe to migrate to the new default. Not used at runtime otherwise.
 */
export function legacyDefaultRoleCapsForPlan(maxUsers: number): Record<string, number> {
  const caps: Record<string, number> = {};
  let sum = 0;
  for (const role of CAP_ELIGIBLE_ROLES) {
    const c = Math.max(1, Math.floor((ROLE_DEFAULT_WEIGHTS[role] ?? 0) * maxUsers));
    caps[role] = c;
    sum += c;
  }
  if (sum > maxUsers) {
    const byWeightAsc = [...CAP_ELIGIBLE_ROLES].sort((a, b) => (ROLE_DEFAULT_WEIGHTS[a] ?? 0) - (ROLE_DEFAULT_WEIGHTS[b] ?? 0));
    let over = sum - maxUsers;
    for (const role of byWeightAsc) {
      while (over > 0 && caps[role] > 0) { caps[role] -= 1; over -= 1; }
      if (over === 0) break;
    }
  }
  return caps;
}

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
