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
  logoUrl: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  mfaEnabled: boolean;
  sodSingleQAOverride: boolean;
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
  /** Region link rows (TenantRegion relation). Absent when not included. */
  regions?: Array<{ region: string }>;
};

function mapSite(site: NonNullable<PrismaTenantRow["sites"]>[number]): TenantSiteConfig {
  return {
    id: site.id,
    name: site.name,
    location: site.location ?? "",
    gmpScope: site.gmpScope ?? "",
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
    logoUrl: row.logoUrl,
    createdAt: row.createdAt.toISOString(),
    active: row.isActive,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    mfaEnabled: row.mfaEnabled,
    sodSingleQAOverride: row.sodSingleQAOverride,
    config: {
      org: {
        companyName: row.name,
        timezone: row.timezone,
        dateFormat: "DD/MM/YYYY",
        // A tenant may operate under several regions; the TenantRegion link rows
        // are the whole set. Read the AAA relation `row.regions` but keep the
        // domain field name `regulatoryRegions` the UI already uses (Path Z).
        // Sorted so the chips render in a stable order rather than in
        // row-insertion order, which changes every time the set is edited.
        regulatoryRegions: (row.regions ?? [])
          .map((r) => r.region)
          .sort((a, b) => a.localeCompare(b)),
      },
      sites: (row.sites ?? []).map(mapSite),
      users: allUsers,
    },
    plan: row.plan ? mapPlan(row.plan) : null,
  };
}
