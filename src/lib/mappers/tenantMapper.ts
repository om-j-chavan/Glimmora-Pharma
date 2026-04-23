import type { Tenant, TenantSiteConfig, TenantUserConfig, SubscriptionPlan } from "@/store/auth.slice";

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
  createdAt: Date;
  subscription?: {
    id: string;
    maxAccounts: number;
    startDate: Date;
    expiryDate: Date;
    status: string;
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

function mapSubscription(sub: NonNullable<PrismaTenantRow["subscription"]>): SubscriptionPlan {
  return {
    id: sub.id,
    startDate: sub.startDate.toISOString(),
    endDate: sub.expiryDate.toISOString(),
    maxAccounts: sub.maxAccounts,
    status: sub.status === "Active" ? "Active" : "Inactive",
    createdAt: sub.createdAt.toISOString(),
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
    plan: "professional",
    adminEmail: row.email,
    createdAt: row.createdAt.toISOString(),
    active: row.isActive,
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
    subscriptionPlans: row.subscription ? [mapSubscription(row.subscription)] : [],
  };
}
