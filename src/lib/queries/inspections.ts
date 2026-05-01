import { cache } from "react";
import type { ReadinessAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Pure helper — % of ReadinessActions in "Complete" state.
 * Used by getReadinessStats and getOverallReadiness.
 */
export function computeReadinessScore(actions: ReadinessAction[]): number {
  if (actions.length === 0) return 0;
  const completed = actions.filter((a) => a.status === "Complete").length;
  return Math.round((completed / actions.length) * 100);
}

/**
 * Lowest readiness % across all active inspections — the headline number
 * shown on the Dashboard and Governance KPI cards. "Lowest" = most urgent.
 */
export const getOverallReadiness = cache(async (tenantId: string) => {
  const inspections = await prisma.inspection.findMany({
    where: { tenantId, status: { not: "completed" } },
    include: { actions: true },
  });
  if (inspections.length === 0) return 0;
  const scores = inspections.map((i) => computeReadinessScore(i.actions));
  return Math.min(...scores);
});

export const getInspections = cache(async (tenantId: string) => {
  return prisma.inspection.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      actions: { orderBy: { createdAt: "asc" } },
      simulations: { orderBy: { scheduledAt: "asc" } },
      trainingRecords: { orderBy: { createdAt: "asc" } },
    },
  });
});

export const getInspection = cache(async (id: string, tenantId: string) => {
  return prisma.inspection.findFirst({
    where: { id, tenantId },
    include: {
      actions: { orderBy: { createdAt: "asc" } },
      simulations: { orderBy: { scheduledAt: "asc" } },
      trainingRecords: { orderBy: { createdAt: "asc" } },
    },
  });
});

/** All active playbooks for a tenant (newest last for stable display order). */
export const getPlaybooks = cache(async (tenantId: string) => {
  return prisma.playbook.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
});

/**
 * Aggregate readiness stats: counts plus per-inspection % score
 * derived from completed/total ReadinessActions.
 */
export const getReadinessStats = cache(async (tenantId: string) => {
  const inspections = await getInspections(tenantId);

  const active = inspections.filter(
    (i) => i.status !== "completed" && i.status !== "cancelled",
  );

  const withReadiness = active.map((insp) => {
    const total = insp.actions.length;
    const completed = insp.actions.filter((a) => a.status === "Complete").length;
    const score = total > 0 ? Math.round((completed / total) * 100) : 0;
    const overdue = insp.actions.filter(
      (a) =>
        a.status !== "Complete" &&
        a.dueDate !== null &&
        new Date(a.dueDate) < new Date(),
    ).length;
    return {
      ...insp,
      readinessScore: score,
      completedActions: completed,
      totalActions: total,
      overdueActions: overdue,
    };
  });

  const lowestScore =
    withReadiness.length > 0
      ? Math.min(...withReadiness.map((i) => i.readinessScore))
      : 0;

  return {
    totalInspections: inspections.length,
    activeInspections: active.length,
    completedInspections: inspections.filter((i) => i.status === "completed").length,
    lowestReadiness: lowestScore,
    inspectionsWithReadiness: withReadiness,
  };
});
