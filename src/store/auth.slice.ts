import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// "qa" = execution-level Quality Assurance user. NOT qa_head: no approval,
// sign-off, closure, or delete authority (see roleSets.ts — qa is in none of
// the privileged sets). Keep in sync with RoleKey in permissions.slice.ts.
export type UserRole = "super_admin" | "customer_admin" | "qa_head" | "qa" | "qc_lab_director" | "regulatory_affairs" | "csv_val_lead" | "it_cdo" | "operations_head" | "viewer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  gxpSignatory: boolean;
  orgId: string;
  tenantId: string;
  /** customer_id used by the AI backend for this user. Defaults to the
   *  customer admin's aiUserId; set to the user's own AI user_id for the
   *  platform super admin / customer admin. */
  aiCustomerId?: string;
}

export interface TenantOrgConfig {
  companyName: string;
  timezone: string;
  dateFormat: string;
  /**
   * Every regulatory region this tenant operates under (RegulatoryRegion.value
   * codes, e.g. ["EMA", "FDA", "MHRA"]). Super-admin owned — a customer_admin
   * reads it and cannot change it. Always an array, possibly empty for a legacy
   * tenant that was never assigned one.
   */
  regulatoryRegions: string[];
}

export interface TenantSiteConfig {
  id: string;
  name: string;
  location: string;
  gmpScope: string;
  status: "Active" | "Inactive";
}

export interface TenantUserConfig {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  status: "Active" | "Inactive";
  assignedSites: string[];
  allSites: boolean;
  password?: string;
  username?: string;
  /** user_id sent to the AI backend's signup. Set once after successful
   *  signup and never re-sent on subsequent edits. Use as the "already
   *  signed up" sentinel — if present, skip /auth/signup. */
  aiUserId?: string;
}

export interface TenantConfig {
  org: TenantOrgConfig;
  sites: TenantSiteConfig[];
  users: TenantUserConfig[];
}

export type PlanTier = "ESSENTIALS" | "PROFESSIONAL" | "ENTERPRISE" | "TAILORED";

/**
 * Subscription Phase A — the single plan assigned to a tenant. Caps are the
 * values FROZEN onto the Plan row at assignment (see src/lib/plans.ts), not
 * live tier defaults. Replaces the old SubscriptionPlan (maxAccounts + status).
 */
export interface PlanConfig {
  id: string;
  tier: PlanTier;
  displayName: string | null; // TAILORED only; null => UI shows "TAILORED"
  maxUsers: number;
  maxSites: number;
  minRetentionYears: number;
  durationMonths: number; // subscription term; expiryDate = startDate + durationMonths
  startDate: string; // ISO
  expiryDate: string; // ISO (derived from startDate + durationMonths)
  // Server-authoritative (Plan.createdAt @default(now())). Optional because
  // optimistic client-side inserts don't carry it — the next getTenants()
  // reload supplies the real value.
  createdAt?: string;
}

export interface Tenant {
  id: string;
  name: string;
  // Human-readable per-tenant code (Tenant.customerCode, e.g. "PGI_001").
  // Display-only here. Optional because optimistic client-side inserts don't
  // carry it — the next getTenants() reload supplies the real value.
  customerCode?: string;
  adminEmail: string;
  // Tenant logo, stored as a data URL (Tenant.logoUrl). Null/undefined => the
  // detail view falls back to the building icon. Set via the logo crop modal.
  logoUrl?: string | null;
  // Server-authoritative (Tenant.createdAt @default(now())). Optional
  // because optimistic client-side inserts don't carry it — the next
  // getTenants() reload supplies the real value.
  createdAt?: string;
  active: boolean;
  // Soft-delete timestamp (ISO). Present => tenant is in the DELETED state
  // (recoverable via Restore). null/undefined => not soft-deleted. Combined
  // with `active`: ACTIVE (active=true, deletedAt null), SUSPENDED (active=false,
  // deletedAt null), DELETED (deletedAt set). See src/actions/tenants.ts.
  deletedAt?: string | null;
  mfaEnabled?: boolean;
  /** Single-QA SoD override (org attests one QA) — super_admin-set; default OFF. */
  sodSingleQAOverride?: boolean;
  config: TenantConfig;
  // Subscription Phase A — exactly one optional plan per tenant (null until a
  // super_admin assigns one). Replaces the old subscriptionPlans[] array and
  // the vestigial `plan` tier-label string.
  plan: PlanConfig | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  activeSiteId: string | null;
  selectedSiteId: string | null;
  currentTenant: string | null;
  tenants: Tenant[];
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token: null, user: null, activeSiteId: null, selectedSiteId: null, currentTenant: null,
    // Tenants are loaded from the database on every visit to /admin via
    // getTenants() and dispatched through setTenants(). The previous hardcoded
    // demo array bled fake "ABC Pharma" / "XYZ Biotech" rows into the UI even
    // when no real DB tenant existed and could mask drift between Redux and
    // the database.
    tenants: [],
  } as AuthState,
  reducers: {
    setCredentials(state, { payload }: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = payload.token;
      state.user = payload.user;
      state.currentTenant = payload.user.tenantId;
    },
    /* REMOVED — the `aiAccessToken` fields and the setAiCredentials reducer.
     *
     * This slice is persisted to localStorage ("glimmora-state"), so holding
     * the AI service's bearer token here put a second service's credential in
     * browser storage, readable by any script on the page and surviving past
     * sign-out. Nothing in the browser needs it: /api/ai-proxy mints a
     * short-lived token per request from the caller's NextAuth session.
     *
     * `aiUserId` / `aiCustomerId` stay — they are identifiers, not credentials.
     */
    /* setAiCredentials was removed with the rest of the client-side AI token
     * plumbing: it was never dispatched, and the only value it still carried
     * (aiCustomerId) is no longer read — the AI service scopes every tenant
     * query from the `customer_id` claim in the server-minted token, which is
     * always the NextAuth tenantId. */
    setActiveSite(state, { payload }: PayloadAction<string>) { state.activeSiteId = payload; },
    setSelectedSite(state, { payload }: PayloadAction<string | null>) { state.selectedSiteId = payload; },
    setCurrentTenant(state, { payload }: PayloadAction<string>) { state.currentTenant = payload; },
    addTenant(state, { payload }: PayloadAction<Tenant>) { state.tenants.push(payload); },
    updateTenant(state, { payload }: PayloadAction<{ id: string; patch: Partial<Tenant> }>) { const t = state.tenants.find((t) => t.id === payload.id); if (t) Object.assign(t, payload.patch); },
    removeTenant(state, { payload }: PayloadAction<string>) {
      state.tenants = state.tenants.filter((t) => t.id !== payload);
    },
    setTenants(state, { payload }: PayloadAction<Tenant[]>) {
      // Replace the entire tenants array (used when syncing from backend).
      // Preserves any seed tenant entries that the backend doesn't know about by merging by id.
      const incomingIds = new Set(payload.map((t) => t.id));
      const localOnly = state.tenants.filter((t) => !incomingIds.has(t.id));
      state.tenants = [...payload, ...localOnly];
    },

    // Per-tenant org
    updateTenantOrg(state, { payload }: PayloadAction<{ tenantId: string; patch: Partial<TenantOrgConfig> }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) Object.assign(t.config.org, payload.patch);
    },
    // Per-tenant sites
    addTenantSite(state, { payload }: PayloadAction<{ tenantId: string; site: TenantSiteConfig }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) t.config.sites.push(payload.site);
    },
    updateTenantSite(state, { payload }: PayloadAction<{ tenantId: string; siteId: string; patch: Partial<TenantSiteConfig> }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) { const s = t.config.sites.find((s) => s.id === payload.siteId); if (s) Object.assign(s, payload.patch); }
    },
    removeTenantSite(state, { payload }: PayloadAction<{ tenantId: string; siteId: string }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) t.config.sites = t.config.sites.filter((s) => s.id !== payload.siteId);
    },
    // Per-tenant users
    addTenantUser(state, { payload }: PayloadAction<{ tenantId: string; user: TenantUserConfig }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) t.config.users.push(payload.user);
    },
    updateTenantUser(state, { payload }: PayloadAction<{ tenantId: string; userId: string; patch: Partial<TenantUserConfig> }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) { const u = t.config.users.find((u) => u.id === payload.userId); if (u) Object.assign(u, payload.patch); }
    },
    removeTenantUser(state, { payload }: PayloadAction<{ tenantId: string; userId: string }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) t.config.users = t.config.users.filter((u) => u.id !== payload.userId);
    },

    // Subscription Phase A — set (or clear with null) the tenant's single plan.
    setTenantPlan(state, { payload }: PayloadAction<{ tenantId: string; plan: PlanConfig | null }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (t) t.plan = payload.plan;
    },

    logout(state) {
      state.token = null; state.user = null; state.activeSiteId = null; state.selectedSiteId = null; state.currentTenant = null;
      try { localStorage.removeItem("glimmora-state"); } catch { /* ignore */ }
    },
  },
});

export const {
  setCredentials, setActiveSite, setSelectedSite, setCurrentTenant,
  addTenant, updateTenant, removeTenant, setTenants,
  updateTenantOrg, addTenantSite, updateTenantSite, removeTenantSite,
  addTenantUser, updateTenantUser, removeTenantUser,
  setTenantPlan,
  logout,
} = authSlice.actions;
export default authSlice.reducer;
