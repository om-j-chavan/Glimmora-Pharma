import type { Ticket, TicketMessage, TicketActivity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import {
  ticketScopeWhere,
  canViewTicket,
  canHandleTicket,
  handlerTierForRole,
} from "@/lib/support/permissions";

export interface TicketListFilters {
  status?: string;
  priority?: string;
  category?: string;
  /** Super-admin only; ignored for tenant-scoped roles (their scope already pins tenant). */
  tenantId?: string;
  /** Phase B routing filter — narrow to tickets currently routed to the CALLER's
   *  tier: CA → own-tenant `currentHandler="customer_admin"`; SA → cross-tenant
   *  `currentHandler="super_admin"` (the escalated queue). No-op for a requester
   *  (no tier). Composes ON TOP of ticketScopeWhere — never widens scope. */
  routedToMe?: boolean;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  search?: string;
}

export interface TicketListResult {
  rows: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Server-side paginated ticket list. Tenant isolation is enforced by
 * ticketScopeWhere (super_admin = all tenants; everyone else pinned). Filters
 * compose on top of the scope; the tenant filter is honored ONLY for cross-
 * tenant roles so a tenant user can never widen their own scope.
 */
export async function getTickets(
  session: AuthSession,
  opts: { page?: number; pageSize?: number; filters?: TicketListFilters } = {},
): Promise<TicketListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const f = opts.filters ?? {};

  const where: Prisma.TicketWhereInput = { ...ticketScopeWhere(session) };
  if (f.status) where.status = f.status;
  if (f.priority) where.priority = f.priority;
  if (f.category) where.category = f.category;
  // Tenant filter only meaningful (and only allowed to narrow) for super_admin.
  if (f.tenantId && session.user.role === "super_admin") where.tenantId = f.tenantId;
  // "Routed to my tier" — narrows to the caller's own tier on top of the base
  // scope (never widens). No-op for a requester (handlerTierForRole → null).
  if (f.routedToMe) {
    const tier = handlerTierForRole(session.user.role);
    if (tier) where.currentHandler = tier;
  }
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {};
    if (f.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(`${f.dateFrom}T00:00:00.000Z`);
    if (f.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${f.dateTo}T23:59:59.999Z`);
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { subject: { contains: q } },
      { reference: { contains: q } },
      { requesterName: { contains: q } },
      { relatedRecordRef: { contains: q } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

/** Role-scoped ticket counts for the Support header cards. */
export interface TicketStats {
  /** Awaiting first action — status New + Open. */
  open: number;
  /** Actively being worked — status In Progress + Awaiting User. */
  inProgress: number;
  /** Currently escalated to the platform tier (currentHandler = super_admin),
   *  excluding terminal tickets. Escalation is a routing axis, not a status. */
  escalated: number;
  /** Completed — status Resolved + Closed. */
  resolved: number;
}

/**
 * Ticket counts for the Support stats cards. Uses the SAME `ticketScopeWhere`
 * as the queue (super_admin = all tenants; customer_admin = own tenant;
 * requester = own tickets), so the cards always agree with the list the viewer
 * can actually see — no scope widening. One grouped read + one escalated count.
 */
export async function getTicketStats(session: AuthSession): Promise<TicketStats> {
  const where: Prisma.TicketWhereInput = { ...ticketScopeWhere(session) };
  const [byStatus, escalated] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.count({
      where: { ...where, currentHandler: "super_admin", status: { notIn: ["Closed", "Cancelled"] } },
    }),
  ]);
  const n = (status: string) => byStatus.find((g) => g.status === status)?._count._all ?? 0;
  return {
    open: n("New") + n("Open"),
    inProgress: n("In Progress") + n("Awaiting User"),
    escalated,
    resolved: n("Resolved") + n("Closed"),
  };
}

/** Lean row for the queue tables (Phase C) — the fields the <DataTable> needs,
 *  serializable across the server-action boundary. */
export interface TicketQueueRow {
  id: string;
  reference: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  currentHandler: string;
  requesterName: string;
  tenantId: string;
  slaDueAt: Date | null;
  updatedAt: Date;
}

export function toQueueRow(t: Ticket): TicketQueueRow {
  return {
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    currentHandler: t.currentHandler,
    requesterName: t.requesterName,
    tenantId: t.tenantId,
    slaDueAt: t.slaDueAt,
    updatedAt: t.updatedAt,
  };
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
  activities: TicketActivity[];
}

/**
 * One ticket with its thread + activity timeline, authorized for the session.
 * Returns null when the ticket doesn't exist OR the session may not view it
 * (same 404 shape, no existence leak). Internal notes are stripped for
 * non-managers.
 */
export async function getTicket(session: AuthSession, id: string): Promise<TicketDetail | null> {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return null;
  if (!canViewTicket(session, ticket)) return null;

  // AUDIT M-1 FIX: gate internal-note + activity visibility on canHandleTicket
  // (super_admin OR the in-tenant customer_admin handling this ticket) — NOT
  // canManageSupport (super_admin only). A CA first-line handler both WRITES
  // internal notes and handles the ticket, so they must also SEE their own notes
  // and the timeline. Requesters still get neither (canHandleTicket is false).
  const canHandle = canHandleTicket(session, ticket);
  const [allMessages, activities] = await Promise.all([
    prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } }),
    // Activity / audit history is handler-only. Gate it at the DATA layer (same
    // as internal-note stripping below) so a requester's response NEVER contains
    // the activity log — not merely hidden in the UI.
    canHandle
      ? prisma.ticketActivity.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([] as TicketActivity[]),
  ]);

  const messages = canHandle ? allMessages : allMessages.filter((m) => !m.isInternal);

  return { ticket, messages, activities };
}

/** Tenant options for the super-admin tenant filter (cross-tenant only). */
export async function getSupportTenantOptions(
  session: AuthSession,
): Promise<{ id: string; name: string; customerCode: string }[]> {
  if (session.user.role !== "super_admin") return [];
  return prisma.tenant.findMany({
    where: { role: "customer_admin" },
    select: { id: true, name: true, customerCode: true },
    orderBy: { name: "asc" },
  });
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  originalFileName: string | null;
  fileType: string | null;
  hasFile: boolean;
  createdAt: Date;
}

/** Attachments for a ticket — Document rows linked via linkedModule="Support".
 *  Authorized through the ticket (canViewTicket); returns [] if not visible. */
export async function getTicketAttachments(
  session: AuthSession,
  ticketId: string,
): Promise<TicketAttachment[]> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { tenantId: true, requesterId: true, escalatedAt: true },
  });
  if (!ticket || !canViewTicket(session, ticket)) return [];
  const docs = await prisma.document.findMany({
    where: { linkedModule: "Support", linkedRecordId: ticketId, tenantId: ticket.tenantId, deletedAt: null },
    select: { id: true, fileName: true, originalFileName: true, fileType: true, storageKey: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return docs.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    originalFileName: d.originalFileName,
    fileType: d.fileType,
    hasFile: !!d.storageKey,
    createdAt: d.createdAt,
  }));
}
