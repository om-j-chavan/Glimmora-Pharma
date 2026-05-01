import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getFDA483Events = cache(async (tenantId: string) => {
  return prisma.fDA483Event.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      observations: { orderBy: { number: "asc" } },
      // FDA483Commitment has no createdAt column — order by dueDate (natural).
      commitments: { orderBy: { dueDate: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });
});

export const getFDA483Event = cache(async (id: string, tenantId: string) => {
  return prisma.fDA483Event.findFirst({
    where: { id, tenantId },
    include: {
      observations: { orderBy: { number: "asc" } },
      // FDA483Commitment has no createdAt column — order by dueDate (natural).
      commitments: { orderBy: { dueDate: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });
});

/**
 * Headline stats for the FDA 483 module KPI cards.
 *
 * Status values match the slice + server-action conventions
 * (PascalCase with spaces): "Open", "Under Investigation",
 * "Response Submitted", "Closed", "Warning Letter", etc.
 */
export const getFDA483Stats = cache(async (tenantId: string) => {
  const events = await getFDA483Events(tenantId);
  const now = Date.now();

  const isOpen = (s: string) => s === "Open" || s === "Under Investigation" || s === "Response Due" || s === "Response Drafted" || s === "Pending QA Sign-off";
  const isSubmittedOrClosed = (s: string) => s === "Response Submitted" || s === "FDA Acknowledged" || s === "Closed";

  return {
    total: events.length,
    open: events.filter((e) => isOpen(e.status)).length,
    responseDue: events.filter(
      (e) =>
        !isSubmittedOrClosed(e.status) &&
        new Date(e.responseDeadline).getTime() > now,
    ).length,
    overdue: events.filter(
      (e) =>
        !isSubmittedOrClosed(e.status) &&
        new Date(e.responseDeadline).getTime() < now,
    ).length,
    closed: events.filter((e) => e.status === "Closed").length,
    warningLetter: events.filter((e) => e.status === "Warning Letter").length,
    totalObservations: events.reduce((sum, e) => sum + e.observations.length, 0),
  };
});
