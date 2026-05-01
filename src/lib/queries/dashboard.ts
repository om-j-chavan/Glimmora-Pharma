import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Compound dashboard query — fetches all the slices needed for the
 * landing page in one round-trip and computes derived stats server-side.
 *
 * Status casing matches actual stored values (mixed across tables):
 *   - CAPA.status:        "Open" / "Closed" / "rejected" / "pending_qa_review"
 *   - Deviation.status:   "open" / "closed" / "rejected" (lowercase)
 *   - Finding.status:     "Open" / "Closed" / "In Progress"
 *   - FDA483Event.status: "Open" / "Response Submitted" / "Closed" (PascalCase with spaces)
 *   - ReadinessAction.status: "Complete" / "Not Started"
 */
export const getDashboardStats = cache(async (tenantId: string) => {
  const now = new Date();

  const [findings, capas, deviations, events, inspections, recentLogs] = await Promise.all([
    prisma.finding.findMany({
      where: { tenantId },
      select: { id: true, severity: true, status: true, area: true, requirement: true, createdAt: true },
    }),
    prisma.cAPA.findMany({
      where: { tenantId },
      select: { id: true, status: true, dueDate: true, risk: true, description: true },
    }),
    prisma.deviation.findMany({
      where: { tenantId },
      select: { id: true, status: true, severity: true, title: true },
    }),
    prisma.fDA483Event.findMany({
      where: { tenantId },
      // Schema uses `siteId`, not `site`.
      select: { id: true, status: true, responseDeadline: true, referenceNumber: true, siteId: true },
    }),
    prisma.inspection.findMany({
      where: { tenantId, status: { not: "completed" } },
      include: { actions: { select: { status: true } } },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Treat anything other than "Closed"/"closed" as open.
  const isOpen = (status: string) => status !== "Closed" && status !== "closed";
  const isRejected = (status: string) => status === "rejected" || status === "Rejected";

  const criticalFindings = findings.filter((f) => f.severity === "Critical" && f.status !== "Closed").length;
  const openFindings = findings.filter((f) => f.status !== "Closed").length;

  const overdueCAPAs = capas.filter(
    (c) => isOpen(c.status) && !isRejected(c.status) && c.dueDate && new Date(c.dueDate) < now,
  ).length;
  const openCAPAs = capas.filter((c) => isOpen(c.status) && !isRejected(c.status)).length;

  const openDeviations = deviations.filter((d) => isOpen(d.status)).length;
  const criticalDeviations = deviations.filter((d) => d.severity === "critical" && isOpen(d.status)).length;

  const overdueEvents = events.filter(
    (e) =>
      e.status !== "Response Submitted" &&
      e.status !== "Closed" &&
      e.responseDeadline &&
      new Date(e.responseDeadline) < now,
  ).length;

  // Per-inspection readiness % from completed/total ReadinessActions.
  const readinessScores = inspections.map((insp) => {
    const total = insp.actions.length;
    const done = insp.actions.filter((a) => a.status === "Complete").length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  });
  const lowestReadiness = readinessScores.length > 0 ? Math.min(...readinessScores) : 0;

  // Coarse compliance score — penalty stack, floored at 0.
  const penalty = criticalFindings * 15 + overdueCAPAs * 10 + criticalDeviations * 10 + overdueEvents * 5;
  const complianceScore = Math.max(0, 100 - penalty);

  return {
    complianceScore,
    criticalFindings,
    openFindings,
    overdueCAPAs,
    openCAPAs,
    openDeviations,
    criticalDeviations,
    overdueEvents,
    lowestReadiness,
    recentFindings: findings
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
    recentCAPAs: capas.filter((c) => isOpen(c.status)).slice(0, 5),
    recentLogs,
    totalFindings: findings.length,
    totalCAPAs: capas.length,
    totalDeviations: deviations.length,
    totalEvents: events.length,
  };
});
