import { useAppSelector } from "./useAppSelector";
import type { TenantOrgConfig, TenantSiteConfig, TenantUserConfig, PlanConfig } from "@/store/auth.slice";
import dayjs from "@/lib/dayjs";

const DEFAULT_ORG: TenantOrgConfig = {
  companyName: "Pharma Glimmora",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  // No regions until the tenant loads — an invented default would show a
  // customer a region the Super Admin never assigned them.
  regulatoryRegions: [],
};

export function useTenantConfig() {
  const currentTenantId = useAppSelector((s) => s.auth.currentTenant);
  const currentUser = useAppSelector((s) => s.auth.user);
  const tenants = useAppSelector((s) => s.auth.tenants);
  const tenant = tenants.find((t) => t.id === currentTenantId);
  const config = tenant?.config;

  const rawSites = (config?.sites ?? []) as TenantSiteConfig[];
  const users = (config?.users ?? []) as TenantUserConfig[];

  // Inactive sites are hidden from every consumer EXCEPT Settings → Sites
  // (which uses allSitesIncludingInactive to still show and re-enable them).
  const allSites = rawSites.filter((s) => s.status === "Active");
  const allSitesIncludingInactive = rawSites;

  const userConfig = users.find((u) => u.id === currentUser?.id);

  const accessibleSites = (() => {
    if (!userConfig) return allSites;
    if (userConfig.allSites) return allSites;
    if (currentUser?.role === "super_admin") return allSites;
    if (currentUser?.role === "customer_admin") return allSites;
    if (currentUser?.role === "qa_head") return allSites;
    return allSites.filter((s) => userConfig.assignedSites.includes(s.id));
  })();

  // ── Plan helpers (Subscription Phase A) ──
  // Exactly one optional plan per tenant. Caps are frozen on the plan row.
  const plan: PlanConfig | null = tenant?.plan ?? null;

  const planExpiry = plan?.expiryDate ?? null;

  const daysRemaining = planExpiry
    ? Math.max(0, dayjs.utc(planExpiry).diff(dayjs(), "day"))
    : null;

  // "Expired" is an expiry/no-plan concept — distinct from lifecycle
  // (Active/Suspended = tenant.active). A missing plan reads as expired for
  // the gate, exactly as before.
  const isExpired = planExpiry
    ? dayjs().isAfter(dayjs.utc(planExpiry))
    : !plan;

  const isNearExpiry = daysRemaining !== null && daysRemaining <= 14 && daysRemaining > 0;

  const maxUsers = plan?.maxUsers ?? 0;
  const maxSites = plan?.maxSites ?? 0;
  // Seats consumed = ALL site users (active + inactive). Mirrors the
  // authoritative server cap (assertCanAddUser → prisma.user.count where
  // tenantId, no isActive filter). One exclusion, deliberate:
  //   • super_admin / customer_admin are Tenant rows, not User seats — the
  //     synthetic customer_admin entry in config.users must NOT count (this is
  //     why a fresh tenant showed "1 of N accounts used" with zero users made).
  // Inactive users STILL count — they retain data / occupy storage. Keeping this
  // in lockstep with planCaps.ts makes the meter hit 100% exactly when the
  // server starts blocking — no off-by-one early block.
  const usedAccounts = users.filter(
    (u) => u.role !== "super_admin" && u.role !== "customer_admin",
  ).length;
  const usedSites = allSitesIncludingInactive.length;

  const accountsRemaining = Math.max(0, maxUsers - usedAccounts);
  const sitesRemaining = Math.max(0, maxSites - usedSites);
  const isAtAccountLimit = !!plan && usedAccounts >= maxUsers;
  const isAtSiteLimit = !!plan && usedSites >= maxSites;

  return {
    tenantId: currentTenantId ?? "",
    tenantName: tenant?.name ?? "Pharma Glimmora",
    // Server-authoritative Tenant.createdAt (ISO). Undefined until a getTenants()
    // reload supplies it (optimistic inserts don't carry it).
    orgCreatedAt: tenant?.createdAt ?? null,
    org: config?.org ?? DEFAULT_ORG,
    sites: accessibleSites,
    allSites,
    allSitesIncludingInactive,
    users,
    userConfig,
    // plan (Subscription Phase A)
    plan,
    planTier: plan?.tier ?? null,
    daysRemaining,
    isExpired,
    isNearExpiry,
    // `maxAccounts` kept as an alias for maxUsers so existing consumers
    // (UsersTab usage bars) read the user cap without renaming.
    maxAccounts: maxUsers,
    maxUsers,
    maxSites,
    usedAccounts,
    usedSites,
    accountsRemaining,
    sitesRemaining,
    isAtAccountLimit,
    isAtSiteLimit,
  };
}
