import { type PlanConfig, type Tenant } from "@/store/auth.slice";
import { resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import { TenantApiError } from "@/lib/tenantApi";
import { friendlyAiError } from "@/lib/friendlyError";
import { planState } from "@/lib/tenantStatus";
import dayjs from "@/lib/dayjs";

/* ── Actionable stat-card filters ── */

export type AccountCardFilter = "expiring" | "nearcap" | "noplan" | "suspended";

/** Fraction (0..1) of the higher of the two caps a tenant is using. */
export function planUtilisation(t: Tenant): { userPct: number; sitePct: number } {
  const p = t.plan;
  if (!p) return { userPct: 0, sitePct: 0 };
  return {
    userPct: p.maxUsers > 0 ? t.config.users.length / p.maxUsers : 0,
    sitePct: p.maxSites > 0 ? t.config.sites.length / p.maxSites : 0,
  };
}

/** Plan expires within the next 30 days (and is not already past expiry). */
export function isExpiringSoon(t: Tenant): boolean {
  if (!t.plan) return false;
  const d = dayjs.utc(t.plan.expiryDate).diff(dayjs(), "day");
  return d >= 0 && d <= 30;
}

/** At or above 80% of the user OR site cap. */
export function isNearCap(t: Tenant): boolean {
  if (!t.plan) return false;
  const { userPct, sitePct } = planUtilisation(t);
  return userPct >= 0.8 || sitePct >= 0.8;
}

export function hasNoPlan(t: Tenant): boolean {
  return !t.plan;
}

export function isSuspendedTenant(t: Tenant): boolean {
  return t.active === false;
}

export function matchesCardFilter(t: Tenant, filter: AccountCardFilter): boolean {
  switch (filter) {
    case "expiring": return isExpiringSoon(t);
    case "nearcap": return isNearCap(t);
    case "noplan": return hasNoPlan(t);
    case "suspended": return isSuspendedTenant(t);
  }
}

/* ── Column filters (the five Dropdown controls) ── */

export interface AccountFilters {
  /** Account lifecycle (tenant.active). */
  accountStatus: "all" | "active" | "suspended";
  /** Plan tier ("ESSENTIALS"…/"TAILORED"), or "noplan". */
  plan: string;
  /** Subscription status from planState (active = ok / expired / none). */
  subStatus: "all" | "active" | "expired" | "none";
  /** MFA flag (tenant.mfaEnabled). */
  mfa: "all" | "enabled" | "disabled";
  /** Created within the last N days. */
  created: "all" | "7" | "30" | "90";
}

export const DEFAULT_ACCOUNT_FILTERS: AccountFilters = {
  accountStatus: "all",
  plan: "all",
  subStatus: "all",
  mfa: "all",
  created: "all",
};

/** True when any non-default dropdown filter is selected. */
export function filtersActive(f: AccountFilters): boolean {
  return f.accountStatus !== "all" || f.plan !== "all" || f.subStatus !== "all" || f.mfa !== "all" || f.created !== "all";
}

/**
 * AND-combine all dropdown filters against one tenant. Each filter reads from
 * its REAL source — lifecycle (tenant.active), plan tier, planState
 * (subscription), mfaEnabled, createdAt — never derived from one another.
 */
export function matchesFilters(t: Tenant, f: AccountFilters): boolean {
  // Account status — lifecycle (tenant.active).
  if (f.accountStatus !== "all" && (f.accountStatus === "active") !== (t.active !== false)) return false;

  // Plan tier (or no-plan).
  if (f.plan !== "all") {
    if (f.plan === "noplan") {
      if (t.plan) return false;
    } else if (t.plan?.tier !== f.plan) {
      return false;
    }
  }

  // Subscription status — planState, independent of account status.
  if (f.subStatus !== "all") {
    const st = planState({ plan: t.plan ?? null }); // "ok" | "expired" | "none"
    const want = f.subStatus === "active" ? "ok" : f.subStatus;
    if (st !== want) return false;
  }

  // MFA.
  if (f.mfa !== "all" && (f.mfa === "enabled") !== !!t.mfaEnabled) return false;

  // Created within the last N days.
  if (f.created !== "all") {
    if (!t.createdAt) return false;
    if (dayjs(t.createdAt).isBefore(dayjs().subtract(Number(f.created), "day"))) return false;
  }

  return true;
}

/* ── Plan draft (Subscription Phase A) ── */

export interface PlanDraft {
  tier: PlanTier;
  displayName: string; // TAILORED only
  maxUsers: number;
  maxSites: number;
  minRetentionYears: number;
  durationMonths: number;
  startDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD — DERIVED (start + durationMonths); read-only in the UI
}

/** A fresh plan draft for the given tier, caps resolved from the tier defaults. */
export function makePlanDraft(tier: PlanTier = "PROFESSIONAL"): PlanDraft {
  const caps = resolvePlanCaps(tier);
  const startDate = dayjs().format("YYYY-MM-DD");
  return {
    tier,
    displayName: "",
    maxUsers: caps.maxUsers,
    maxSites: caps.maxSites,
    minRetentionYears: caps.minRetentionYears,
    durationMonths: caps.durationMonths,
    startDate,
    expiryDate: dayjs.utc(resolveExpiry(startDate, caps.durationMonths)).format("YYYY-MM-DD"),
  };
}

/** Map a Redux PlanConfig to the editable draft. */
export function planConfigToDraft(pc: PlanConfig): PlanDraft {
  return {
    tier: pc.tier,
    displayName: pc.displayName ?? "",
    maxUsers: pc.maxUsers,
    maxSites: pc.maxSites,
    minRetentionYears: pc.minRetentionYears,
    durationMonths: pc.durationMonths,
    startDate: dayjs.utc(pc.startDate).format("YYYY-MM-DD"),
    // Stored expiry is already start + durationMonths; surface it for display.
    expiryDate: dayjs.utc(pc.expiryDate).format("YYYY-MM-DD"),
  };
}

/** Map an editable draft to a Redux PlanConfig; caps are frozen via resolvePlanCaps. */
export function draftToPlanConfig(d: PlanDraft, id: string): PlanConfig {
  const caps = resolvePlanCaps(d.tier, { maxUsers: d.maxUsers, maxSites: d.maxSites, minRetentionYears: d.minRetentionYears, durationMonths: d.durationMonths });
  return {
    id,
    tier: d.tier,
    displayName: d.tier === "TAILORED" ? (d.displayName.trim() || null) : null,
    maxUsers: caps.maxUsers,
    maxSites: caps.maxSites,
    minRetentionYears: caps.minRetentionYears,
    durationMonths: caps.durationMonths,
    startDate: dayjs.utc(d.startDate).toISOString(),
    // Expiry is DERIVED from start + the (clamped) duration — never hand-entered.
    expiryDate: resolveExpiry(d.startDate, caps.durationMonths),
  };
}

/* ── Account form data ── */

export interface AccountFormData {
  // Customer code is no longer in the form — the API derives it server-side
  // from the tenant id (pages/api/tenants.ts:76 sets customerCode: body.id).
  // User role is always "customer_admin" for this modal — hardcoded in the
  // parent's create handler payload, not collected here.
  customerName: string;
  username: string;
  email: string;
  language: string;
  timezone: string;
  active: boolean;
  mfaEnabled: boolean;
  newPassword: string;
  confirmPassword: string;
  plan: PlanDraft | null;
  logoFile: File | null;
}

/** Typed field setter shared by the drawer + its form sections. */
export type AccountFormSetter = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) => void;

export function makeEmptyForm(): AccountFormData {
  return {
    customerName: "",
    username: "",
    email: "",
    language: "English, United States",
    timezone: "Asia/Kolkata",
    active: true,
    mfaEnabled: false,
    newPassword: "",
    confirmPassword: "",
    plan: null,
    logoFile: null,
  };
}

/**
 * Maps a save-time failure to a user-facing message for the toast.
 * TenantApiError carries server fieldErrors (Zod failures) — surface
 * them inline so the user knows which field is wrong instead of the
 * generic "Validation failed" sentence.
 */
export function mapCustomerError(err: unknown): string {
  if (err instanceof TenantApiError) {
    if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
      const fieldLabels: Record<string, string> = {
        name: "Customer name",
        email: "Email",
        username: "Username",
        password: "Password",
        customerCode: "Customer code",
      };
      const parts = Object.entries(err.fieldErrors).map(([field, msgs]) => {
        const label = fieldLabels[field] ?? field;
        return `${label}: ${(msgs ?? []).join(", ")}`;
      });
      return parts.join(" · ");
    }
    return err.message;
  }
  return friendlyAiError(err, "Failed to save customer. Please try again.");
}
