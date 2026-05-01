import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Cached query: all sites for a tenant, oldest first (creation order).
 */
export const getSites = cache(async (tenantId: string) => {
  return prisma.site.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
});

/**
 * Cached query: all users for a tenant. Excludes passwordHash.
 */
export const getUsers = cache(async (tenantId: string) => {
  return prisma.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      siteId: true,
      isActive: true,
      lastLogin: true,
      gxpSignatory: true,
      createdAt: true,
    },
  });
});
