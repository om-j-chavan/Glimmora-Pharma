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
    tenants: [
      {
        id: "tenant-glimmora", name: "Pharma Glimmora International", plan: "enterprise",
        adminEmail: "admin@pharmaglimmora.com", createdAt: "2026-01-01T00:00:00Z", active: true,
        config: {
          org: { companyName: "Pharma Glimmora International", timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", regulatoryRegion: "India" },
          sites: [
            { id: "site-gl-1", name: "Mumbai API Plant", location: "India", gmpScope: "API Manufacturing", risk: "HIGH", status: "Active" },
            { id: "site-gl-2", name: "Bangalore R&D Centre", location: "India", gmpScope: "R&D", risk: "MEDIUM", status: "Active" },
            { id: "site-gl-3", name: "Chennai QC Laboratory", location: "India", gmpScope: "QC Testing", risk: "MEDIUM", status: "Active" },
            { id: "site-gl-4", name: "Hyderabad Formulation", location: "India", gmpScope: "Formulation", risk: "HIGH", status: "Active" },
          ],
          users: [
            { id: "u-001", name: "System Administrator", email: "admin@pharmaglimmora.com", role: "super_admin", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
            { id: "u-009", name: "Customer Administrator", email: "custadmin@pharmaglimmora.com", role: "customer_admin", gxpSignatory: false, status: "Active", assignedSites: [], allSites: true },
            { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", role: "qa_head", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
            { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", role: "regulatory_affairs", gxpSignatory: true, status: "Active", assignedSites: ["site-gl-1", "site-gl-2"], allSites: false },
            { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", role: "csv_val_lead", gxpSignatory: true, status: "Active", assignedSites: ["site-gl-1", "site-gl-3"], allSites: false },
            { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", role: "qc_lab_director", gxpSignatory: true, status: "Active", assignedSites: ["site-gl-3"], allSites: false },
            { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", role: "it_cdo", gxpSignatory: false, status: "Active", assignedSites: [], allSites: true },
            { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", role: "operations_head", gxpSignatory: false, status: "Active", assignedSites: ["site-gl-1", "site-gl-4"], allSites: false },
            { id: "u-008", name: "View Only User", email: "viewer@pharmaglimmora.com", role: "viewer", gxpSignatory: false, status: "Active", assignedSites: ["site-gl-1"], allSites: false },
          ],
        },
        subscriptionPlans: [
          { id: "sub-gl-001", startDate: "2026-01-01T00:00:00Z", endDate: "2026-12-31T00:00:00Z", maxAccounts: 15, status: "Active", createdAt: "2026-01-01T00:00:00Z" },
        ],
      },
      {
        id: "tenant-abc", name: "ABC Pharma Ltd", plan: "professional",
        adminEmail: "admin@abcpharma.com", createdAt: "2026-01-01T00:00:00Z", active: true,
        config: {
          org: { companyName: "ABC Pharma Ltd", timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", regulatoryRegion: "India" },
          sites: [
            { id: "site-abc-1", name: "Hyderabad Manufacturing", location: "India", gmpScope: "API Manufacturing", risk: "HIGH", status: "Active" },
            { id: "site-abc-2", name: "Pune QC Facility", location: "India", gmpScope: "QC Testing", risk: "MEDIUM", status: "Active" },
            { id: "site-abc-3", name: "Ahmedabad Packaging", location: "India", gmpScope: "Packaging", risk: "LOW", status: "Active" },
          ],
          users: [
            { id: "u-abc-001", name: "ABC Admin", email: "admin@abcpharma.com", role: "super_admin", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
            { id: "u-cust-abc", name: "ABC Customer Admin", email: "custadmin@abcpharma.com", role: "customer_admin", gxpSignatory: false, status: "Active", assignedSites: [], allSites: true },
            { id: "u-abc-002", name: "Dr. Sunita Rao", email: "qa@abcpharma.com", role: "qa_head", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
            { id: "u-abc-003", name: "Kiran Mehta", email: "csv@abcpharma.com", role: "csv_val_lead", gxpSignatory: false, status: "Active", assignedSites: ["site-abc-1"], allSites: false },
          ],
        },
        subscriptionPlans: [
          { id: "sub-abc-001", startDate: "2026-02-01T00:00:00Z", endDate: "2026-04-30T00:00:00Z", maxAccounts: 10, status: "Active", createdAt: "2026-02-01T00:00:00Z" },
        ],
      },
      {
        id: "tenant-xyz", name: "XYZ Biotech", plan: "trial",
        adminEmail: "admin@xyzbiotech.com", createdAt: "2026-02-01T00:00:00Z", active: true,
        config: {
          org: { companyName: "XYZ Biotech", timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", regulatoryRegion: "India" },
          sites: [
            { id: "site-xyz-1", name: "Delhi Research Center", location: "India", gmpScope: "R&D / Biotech", risk: "LOW", status: "Active" },
            { id: "site-xyz-2", name: "Noida Biotech Lab", location: "India", gmpScope: "Biotech", risk: "MEDIUM", status: "Active" },
          ],
          users: [
            { id: "u-xyz-001", name: "XYZ Admin", email: "admin@xyzbiotech.com", role: "super_admin", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
            { id: "u-cust-xyz", name: "XYZ Customer Admin", email: "custadmin@xyzbiotech.com", role: "customer_admin", gxpSignatory: false, status: "Active", assignedSites: [], allSites: true },
            { id: "u-xyz-002", name: "Dr. Arjun Das", email: "qa@xyzbiotech.com", role: "qa_head", gxpSignatory: true, status: "Active", assignedSites: [], allSites: true },
          ],
        },
        subscriptionPlans: [
          { id: "sub-xyz-001", startDate: "2026-03-01T00:00:00Z", endDate: "2026-03-15T00:00:00Z", maxAccounts: 3, status: "Active", createdAt: "2026-03-01T00:00:00Z" },
        ],
      },
    ],
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
  addTenant, updateTenant,
  updateTenantOrg, addTenantSite, updateTenantSite, removeTenantSite,
  addTenantUser, updateTenantUser,
  addSubscriptionPlan, updateSubscriptionPlan,
  logout,
} = authSlice.actions;
export default authSlice.reducer;
