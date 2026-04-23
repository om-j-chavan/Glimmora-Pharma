import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { mapTenantFromPrisma } from "@/lib/mappers/tenantMapper";
import type { Tenant } from "@/store/auth.slice";

export const getTenants = cache(async (): Promise<Tenant[]> => {
  const rows = await prisma.tenant.findMany({
    include: {
      subscription: true,
      sites: true,
      users: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapTenantFromPrisma);
});

export const getTenant = cache(async (id: string): Promise<Tenant | null> => {
  const row = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscription: true,
      sites: true,
      users: true,
    },
  });
  return row ? mapTenantFromPrisma(row) : null;
});

export const getTenantStats = cache(async () => {
  const [totalTenants, totalUsers, totalSites] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.site.count(),
  ]);
  return { totalTenants, totalUsers, totalSites };
});
