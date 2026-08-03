import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { mapTenantFromPrisma } from "@/lib/mappers/tenantMapper";
import { PLATFORM_ADMIN_ROLES } from "@/lib/permissions/roleSets";
import type { Tenant } from "@/store/auth.slice";

export const getTenants = cache(async (): Promise<Tenant[]> => {
  const rows = await prisma.tenant.findMany({
    // The platform Super Admin is a Tenant row (role="super_admin") but is NOT
    // a customer account and is not managed through the Tenant module — exclude
    // it from the Customer Accounts list at the source (server-side). Uses the
    // shared roleSets helper rather than an inline role string.
    where: { role: { notIn: [...PLATFORM_ADMIN_ROLES] } },
    include: {
      plan: true,
      sites: true,
      users: true,
      regulatoryRegions: { select: { region: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapTenantFromPrisma);
});

export const getTenant = cache(async (id: string): Promise<Tenant | null> => {
  const row = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: true,
      sites: true,
      users: true,
      regulatoryRegions: { select: { region: true } },
    },
  });
  return row ? mapTenantFromPrisma(row) : null;
});

export const getTenantStats = cache(async () => {
  const [totalTenants, totalUsers, totalSites] = await Promise.all([
    // Exclude the platform Super Admin (not a customer account) from the total,
    // consistent with getTenants — the account count must not include it.
    prisma.tenant.count({ where: { role: { notIn: [...PLATFORM_ADMIN_ROLES] } } }),
    prisma.user.count(),
    prisma.site.count(),
  ]);
  return { totalTenants, totalUsers, totalSites };
});
