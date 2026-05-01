import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UserRole = "super_admin" | "customer_admin" | "qa_head" | "qc_lab_director" | "regulatory_affairs" | "csv_val_lead" | "it_cdo" | "operations_head" | "viewer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  gxpSignatory: boolean;
  orgId: string;
  tenantId: string;
}

export interface TenantOrgConfig {
  companyName: string;
  timezone: string;
  dateFormat: string;
  regulatoryRegion: string;
}

export interface TenantSiteConfig {
  id: string;
  name: string;
  location: string;
  gmpScope: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
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
}

export interface TenantConfig {
  org: TenantOrgConfig;
  sites: TenantSiteConfig[];
  users: TenantUserConfig[];
}

export interface SubscriptionPlan {
  id: string;
  startDate: string;
  endDate: string;
  maxAccounts: number;
  status: "Active" | "Inactive";
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  plan: "trial" | "professional" | "enterprise";
  adminEmail: string;
  createdAt: string;
  active: boolean;
  mfaEnabled?: boolean;
  config: TenantConfig;
  subscriptionPlans: SubscriptionPlan[];
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

    // Subscription plans
    addSubscriptionPlan(state, { payload }: PayloadAction<{ tenantId: string; plan: SubscriptionPlan }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (!t) return;
      if (!t.subscriptionPlans) t.subscriptionPlans = [];
      // If new plan is Active, deactivate previous active plans
      if (payload.plan.status === "Active") {
        t.subscriptionPlans.forEach((p) => { if (p.status === "Active") p.status = "Inactive"; });
      }
      t.subscriptionPlans.push(payload.plan);
    },
    updateSubscriptionPlan(state, { payload }: PayloadAction<{ tenantId: string; planId: string; patch: Partial<SubscriptionPlan> }>) {
      const t = state.tenants.find((t) => t.id === payload.tenantId);
      if (!t || !t.subscriptionPlans) return;
      const plan = t.subscriptionPlans.find((p) => p.id === payload.planId);
      if (!plan) return;
      Object.assign(plan, payload.patch);
      // If we just activated this plan, deactivate the others
      if (payload.patch.status === "Active") {
        t.subscriptionPlans.forEach((p) => { if (p.id !== plan.id && p.status === "Active") p.status = "Inactive"; });
      }
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
  addTenantUser, updateTenantUser,
  addSubscriptionPlan, updateSubscriptionPlan,
  logout,
} = authSlice.actions;
export default authSlice.reducer;
