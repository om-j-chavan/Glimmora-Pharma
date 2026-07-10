import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { visibilityWhere } from "@/lib/permissions/recordVisibility";

/**
 * FDA483 (FDA483Event) record-visibility fragment — FLAT (creator + owner).
 * Both the creator (`createdById`, Phase 5.5) AND the assignee/owner
 * (`internalOwnerId`) are FLAT columns on the event, so — like Gap — delegate
 * straight to the shared helper, no compose:
 *   • see-all role → {} ;  • else → { OR: [ { createdById: uid }, { internalOwnerId: uid } ] }.
 * Net: a non-see-all user sees only FDA483 events they CREATED or internally OWN.
 */
export function fda483VisibilityWhere(session: AuthSession): Prisma.FDA483EventWhereInput {
  return visibilityWhere(session, { creatorField: "createdById", assigneeField: "internalOwnerId" }) as Prisma.FDA483EventWhereInput;
}

/**
 * Audit-trail rows scoped to a single FDA 483 event (and its child
 * observations + commitments + documents). Used by the AuditTab on the
 * event detail page.
 *
 * Filter strategy: `recordId` is set to the event id for event-level
 * actions but to the child id for OBSERVATION_UPDATED / DELETED,
 * COMMITMENT_UPDATED / DELETED, RESPONSE_DOCUMENT_* etc. We expand the
 * filter to cover every child id we already know about so the tab
 * surfaces the full timeline.
 */
export const getFDA483EventAuditLogs = cache(
  async (session: AuthSession, eventId: string, limit = 50) => {
    const tenantId = session.user.tenantId;
    // Phase 5.5 — re-check PARENT-EVENT visibility so a child (this per-event
    // audit feed) of a hidden event is not readable: a non-see-all user who is
    // neither creator nor internal owner gets [] here. Resolve child ids up-front
    // so the AuditLog query can union them into the recordId filter.
    const event = await prisma.fDA483Event.findFirst({
      where: { id: eventId, tenantId, ...fda483VisibilityWhere(session) },
      select: {
        id: true,
        observations: { select: { id: true } },
        commitments: { select: { id: true } },
        documents: { select: { id: true } },
      },
    });
    if (!event) return [];
    const ids = [
      event.id,
      ...event.observations.map((o) => o.id),
      ...event.commitments.map((c) => c.id),
      ...event.documents.map((d) => d.id),
    ];
    return prisma.auditLog.findMany({
      where: {
        tenantId,
        module: "FDA 483",
        recordId: { in: ids },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },
);

export const getFDA483Events = cache(async (tenantId: string, visibility: Prisma.FDA483EventWhereInput = {}) => {
  return prisma.fDA483Event.findMany({
    // Visibility is an ADDITIONAL AND; default {} keeps the aggregate caller
    // (getFDA483Stats) + dashboard tenant-wide until Phase 6.
    where: { tenantId, ...visibility },
    orderBy: { createdAt: "desc" },
    include: {
      observations: { orderBy: { number: "asc" } },
      // First-class commitments — surface source linkage (observation/CAPA),
      // who completed it, and evidence docs for the upgraded card.
      commitments: {
        orderBy: { createdAt: "asc" },
        include: {
          observation: { select: { id: true, number: true, reference: true } },
          capa: { select: { id: true, reference: true } },
          completedByUser: { select: { id: true, name: true } },
          documents: { orderBy: { uploadedAt: "asc" } },
        },
      },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });
});

export const getFDA483Event = cache(async (id: string, session: AuthSession) => {
  // Visibility enforced in the query (no IDOR): a non-see-all/non-creator/
  // non-owner gets null even with a valid id.
  return prisma.fDA483Event.findFirst({
    where: { id, tenantId: session.user.tenantId, ...fda483VisibilityWhere(session) },
    include: {
      observations: { orderBy: { number: "asc" } },
      // First-class commitments — surface source linkage (observation/CAPA),
      // who completed it, and evidence docs for the upgraded card.
      commitments: {
        orderBy: { createdAt: "asc" },
        include: {
          observation: { select: { id: true, number: true, reference: true } },
          capa: { select: { id: true, reference: true } },
          completedByUser: { select: { id: true, name: true } },
          documents: { orderBy: { uploadedAt: "asc" } },
        },
      },
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
