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
 * Cached query: all users for a tenant. Excludes passwordHash. Also excludes any
 * super_admin row — super_admin is a platform identity, not a tenant user, so it
 * must never surface in a tenant's user list / user-management UI (H1 hardening).
 */
export const getUsers = cache(async (tenantId: string) => {
  return prisma.user.findMany({
    where: { tenantId, role: { not: "super_admin" } },
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
