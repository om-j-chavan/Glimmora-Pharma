import type { Tenant, TenantSiteConfig, TenantUserConfig, PlanConfig, PlanTier } from "@/store/auth.slice";

type PrismaTenantRow = {
  id: string;
  customerCode: string;
  name: string;
  username: string;
  email: string;
  role: string;
  language: string;
  timezone: string;
  isActive: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
  plan?: {
    id: string;
    tier: string;
    displayName: string | null;
    maxUsers: number;
    maxSites: number;
    minRetentionYears: number;
    durationMonths: number;
    startDate: Date;
    expiryDate: Date;
    createdAt: Date;
  } | null;
  sites?: Array<{
    id: string;
    name: string;
    location: string | null;
    gmpScope: string | null;
    risk: string;
    isActive: boolean;
  }>;
  users?: Array<{
    id: string;
    name: string;
    email: string;
    username: string;
    role: string;
    gxpSignatory: boolean;
    isActive: boolean;
    siteId: string | null;
  }>;
};

function mapSite(site: NonNullable<PrismaTenantRow["sites"]>[number]): TenantSiteConfig {
  return {
    id: site.id,
    name: site.name,
    location: site.location ?? "",
    gmpScope: site.gmpScope ?? "",
    risk: (site.risk === "HIGH" || site.risk === "MEDIUM" || site.risk === "LOW") ? site.risk : "MEDIUM",
    status: site.isActive ? "Active" : "Inactive",
  };
}

function mapUser(user: NonNullable<PrismaTenantRow["users"]>[number]): TenantUserConfig {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    gxpSignatory: user.gxpSignatory,
    status: user.isActive ? "Active" : "Inactive",
    assignedSites: user.siteId ? [user.siteId] : [],
    allSites: user.role === "qa_head" || user.role === "customer_admin" || user.role === "super_admin",
  };
}

function mapPlan(plan: NonNullable<PrismaTenantRow["plan"]>): PlanConfig {
  return {
    id: plan.id,
    tier: plan.tier as PlanTier,
    displayName: plan.displayName,
    maxUsers: plan.maxUsers,
    maxSites: plan.maxSites,
    minRetentionYears: plan.minRetentionYears,
    durationMonths: plan.durationMonths,
    startDate: plan.startDate.toISOString(),
    expiryDate: plan.expiryDate.toISOString(),
    createdAt: plan.createdAt.toISOString(),
  };
}

export function mapTenantFromPrisma(row: PrismaTenantRow): Tenant {
  // The tenant row itself represents the primary admin account; surface it
  // as a user in the config.users list so the admin UI can show/edit it.
  const adminAsUser: TenantUserConfig = {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role,
    gxpSignatory: true,
    status: row.isActive ? "Active" : "Inactive",
    assignedSites: [],
    allSites: true,
  };

  const extraUsers = (row.users ?? []).map(mapUser);
  const allUsers = [adminAsUser, ...extraUsers];

  return {
    id: row.id,
    name: row.name,
    customerCode: row.customerCode,
    adminEmail: row.email,
    createdAt: row.createdAt.toISOString(),
    active: row.isActive,
    mfaEnabled: row.mfaEnabled,
    config: {
      org: {
        companyName: row.name,
        timezone: row.timezone,
        dateFormat: "DD/MM/YYYY",
        regulatoryRegion: "",
      },
      sites: (row.sites ?? []).map(mapSite),
      users: allUsers,
    },
    plan: row.plan ? mapPlan(row.plan) : null,
  };
}
