import { type PlanConfig, type Tenant } from "@/store/auth.slice";
import { resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import { TenantApiError } from "@/lib/tenantApi";
import { friendlyAiError } from "@/lib/friendlyError";
import dayjs from "@/lib/dayjs";

/* ── Actionable stat-card filters ── */

export type AccountCardFilter = "expiring" | "nearcap" | "noplan" | "suspended";

/**
 * Plan users USED = the tenant's own users (User-table rows), NOT the tenant
 * admin identity. The mapper injects the tenant row itself into config.users as
 * the admin login (its id === tenant.id), but that account does not consume a
 * plan seat (the server cap in assertCanAddUser counts User rows only). So a
 * freshly created tenant — which has no User rows yet — reads 0 used.
 */
export function planUsersUsed(t: Tenant): number {
  return t.config.users.filter((u) => u.id !== t.id).length;
}

/** Fraction (0..1) of the higher of the two caps a tenant is using. */
export function planUtilisation(t: Tenant): { userPct: number; sitePct: number } {
  const p = t.plan;
  if (!p) return { userPct: 0, sitePct: 0 };
  return {
    userPct: p.maxUsers > 0 ? planUsersUsed(t) / p.maxUsers : 0,
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
  // Regulatory regions — super_admin owned. A tenant may operate under several;
  // empty array = unset (rejected on create).
  regulatoryRegions: string[];
  active: boolean;
  mfaEnabled: boolean;
  sodSingleQAOverride: boolean;
  newPassword: string;
  confirmPassword: string;
  plan: PlanDraft | null;
  /** Cropped logo as a 256px-square JPEG data URL, produced by the shared
   *  LogoCropModal (return-mode). Persisted via updateTenantLogo on submit
   *  (Create: after the tenant row exists; Edit: alongside the account save).
   *  null = no change / removed. */
  logoDataUrl: string | null;
  /** Tailored-at-creation per-role caps (role → cap, or null = unlimited). Set by
   *  the Create Tenant modal for TAILORED plans; persisted via setTenantRoleLimits
   *  AFTER the tenant + plan are created. Undefined for standard plans / edit. */
  initialRoleCaps?: Record<string, number | null>;
}

/** Typed field setter shared by the drawer + its form sections. */
export type AccountFormSetter = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) => void;

/**
 * Result of a save attempt, returned by the accounts hook's handleSave so the
 * modal can keep itself open and surface server-side field errors (e.g. a
 * duplicate username/email) inline instead of only in a toast.
 */
export type SaveResult = { ok: boolean; fieldErrors?: Record<string, string[]> };

export function makeEmptyForm(): AccountFormData {
  return {
    customerName: "",
    username: "",
    email: "",
    language: "English, United States",
    timezone: "Asia/Kolkata",
    regulatoryRegions: [],
    active: true,
    mfaEnabled: false,
    sodSingleQAOverride: false,
    newPassword: "",
    confirmPassword: "",
    plan: null,
    logoDataUrl: null,
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
