import type { Ticket, TicketMessage, TicketActivity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import {
  ticketScopeWhere,
  canViewTicket,
  canManageSupport,
} from "@/lib/support/permissions";

export interface TicketListFilters {
  status?: string;
  priority?: string;
  category?: string;
  assigneeId?: string;
  /** Super-admin only; ignored for tenant-scoped roles (their scope already pins tenant). */
  tenantId?: string;
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
  if (f.assigneeId) where.assigneeId = f.assigneeId;
  // Tenant filter only meaningful (and only allowed to narrow) for super_admin.
  if (f.tenantId && session.user.role === "super_admin") where.tenantId = f.tenantId;
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

  const isManager = canManageSupport(session.user.role);
  const [allMessages, activities] = await Promise.all([
    prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } }),
    // Activity / audit history is support-only. Gate it at the DATA layer (same
    // as internal-note stripping below) so a regular user's response NEVER
    // contains the activity log — not merely hidden in the UI.
    isManager
      ? prisma.ticketActivity.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([] as TicketActivity[]),
  ]);

  const messages = isManager ? allMessages : allMessages.filter((m) => !m.isInternal);

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

/** Assignee options for the super-admin assign control — the platform admins
 *  (the only management role today; add support_agent users here later). */
export async function getSupportAssigneeOptions(
  session: AuthSession,
): Promise<{ id: string; name: string }[]> {
  if (!canManageSupport(session.user.role)) return [];
  return prisma.tenant.findMany({
    where: { role: "super_admin" },
    select: { id: true, name: true },
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
    select: { tenantId: true, requesterId: true },
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
