import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getSystems = cache(async (tenantId: string) => {
  return prisma.gxPSystem.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      validationStages: { orderBy: { stageName: "asc" } },
      rtmEntries: { orderBy: { ursId: "asc" } },
      roadmapActivities: { orderBy: { startDate: "asc" } },
    },
  });
});

export const getSystem = cache(async (id: string, tenantId: string) => {
  return prisma.gxPSystem.findFirst({
    where: { id, tenantId },
    include: {
      validationStages: { orderBy: { stageName: "asc" } },
      rtmEntries: { orderBy: { ursId: "asc" } },
      roadmapActivities: { orderBy: { startDate: "asc" } },
    },
  });
});

/**
 * Headline stats for the CSV/CSA module.
 *
 * Schema fields: GxPSystem.`validationStatus` (not `status`),
 * `siteId` (not `site`). Values are PascalCase per the slice's
 * ValidationStatus enum + seeded data ("Not Started", "In Progress",
 * "Validated", "Overdue"). There is no `auditTrailEnabled` column —
 * we proxy via `part11Status === "Compliant"` (same pattern Governance
 * already uses for "audit trail coverage").
 */
export const getSystemsStats = cache(async (tenantId: string) => {
  const systems = await getSystems(tenantId);
  return {
    total: systems.length,
    validated: systems.filter((s) => s.validationStatus === "Validated").length,
    inProgress: systems.filter((s) => s.validationStatus === "In Progress").length,
    notStarted: systems.filter((s) => s.validationStatus === "Not Started").length,
    overdue: systems.filter((s) => s.validationStatus === "Overdue").length,
    auditTrailEnabled: systems.filter(
      (s) => s.part11Status === "Compliant" || s.part11Status === "N/A",
    ).length,
  };
});

export const getRTMStats = cache(async (tenantId: string) => {
  const systems = await getSystems(tenantId);
  const allRTM = systems.flatMap((s) => s.rtmEntries);
  return {
    total: allRTM.length,
    complete: allRTM.filter((r) => r.traceabilityStatus === "complete").length,
    partial: allRTM.filter((r) => r.traceabilityStatus === "partial").length,
    broken: allRTM.filter((r) => r.traceabilityStatus === "broken").length,
  };
});
