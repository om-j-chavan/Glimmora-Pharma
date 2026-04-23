import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Cached query: all findings for a tenant, newest first.
 * React cache() deduplicates within a single request.
 */
export const getFindings = cache(async (tenantId: string) => {
  return prisma.finding.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

/**
 * Cached query: single finding by ID (with tenant guard).
 */
export const getFinding = cache(async (id: string, tenantId: string) => {
  return prisma.finding.findFirst({
    where: { id, tenantId },
  });
});

/**
 * Computed stats for the Gap Assessment page header.
 */
export const getFindingStats = cache(async (tenantId: string) => {
  const findings = await getFindings(tenantId);
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "Critical").length,
    open: findings.filter((f) => f.status !== "Closed").length,
    closed: findings.filter((f) => f.status === "Closed").length,
  };
});
