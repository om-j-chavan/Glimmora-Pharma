import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { entityTypesForModule } from "@/lib/labels/notifications";

/**
 * Paged reads for the /notifications page.
 *
 * SCOPE PIN: every query here is keyed on BOTH `recipientUserId` and
 * `tenantId`, exactly like the bell's actions in src/actions/notifications.ts.
 * Filters only ever NARROW that pin — no filter path can widen it, so a caller
 * can never read another user's or another tenant's notifications.
 *
 * The bell reads at most 30 rows and has no filters; this module exists because
 * the page needs whole-set search / filter / sort / paging in the DATABASE (a
 * user's history is unbounded — nothing prunes the table today, see the
 * retention finding in docs/NOTIFICATIONS-AUDIT.md). Mirrors the shape of
 * getAuditTrailPage in ./governance.ts, which solves the same problem.
 */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  isArchived: boolean;
  priority: string;
  severity: string;
  source: string;
  /** ISO — serialised for the client boundary. */
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
}

export interface NotificationFilters {
  /** NOTIFICATION_MODULES value, e.g. "capa". */
  module?: string;
  /** Exact Notification.type. */
  type?: string;
  /** "unread" | "read" | "archived" | "all" */
  status?: string;
  /** critical|high|medium|low|info */
  priority?: string;
  /** critical|warning|success|info */
  severity?: string;
  /** user|system|ai */
  source?: string;
  /** Inclusive lower bound, YYYY-MM-DD. */
  dateFrom?: string;
  /** Matched against title + body. */
  search?: string;
}

export type NotificationSortKey = "createdAt" | "type" | "isRead";
const SORT_KEYS = new Set<NotificationSortKey>(["createdAt", "type", "isRead"]);

export interface NotificationPageResult {
  rows: NotificationRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Unread across the WHOLE scope, ignoring filters — drives the page header. */
  unread: number;
}

function toRow(n: {
  id: string; type: string; title: string; body: string | null; linkPath: string | null;
  entityType: string | null; entityId: string | null; isRead: boolean; isArchived: boolean;
  priority: string; severity: string; source: string;
  createdAt: Date; readAt: Date | null; archivedAt: Date | null;
}): NotificationRow {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    entityType: n.entityType,
    entityId: n.entityId,
    isRead: n.isRead,
    isArchived: n.isArchived,
    priority: n.priority,
    severity: n.severity,
    source: n.source,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    archivedAt: n.archivedAt ? n.archivedAt.toISOString() : null,
  };
}

/** Build the scoped where-clause. `base` is the immutable pin. */
function buildWhere(
  recipientUserId: string,
  tenantId: string,
  f: NotificationFilters,
): Prisma.NotificationWhereInput {
  // Soft-deleted rows are hidden everywhere (never widens the pin).
  const where: Prisma.NotificationWhereInput = { recipientUserId, tenantId, deletedAt: null };

  // Archive is a separate axis from read/unread. "archived" shows the archive;
  // every other status shows the live inbox (non-archived) only.
  if (f.status === "archived") {
    where.isArchived = true;
  } else {
    where.isArchived = false;
    if (f.status === "unread") where.isRead = false;
    else if (f.status === "read") where.isRead = true;
    // "all" / undefined → both read states, still non-archived.
  }

  if (f.module) {
    // Unknown facet value → [] → matches nothing. Never widens.
    where.entityType = { in: entityTypesForModule(f.module) };
  }
  if (f.type) where.type = f.type;
  if (f.priority) where.priority = f.priority;
  if (f.severity) where.severity = f.severity;
  if (f.source) where.source = f.source;
  if (f.dateFrom) where.createdAt = { gte: new Date(`${f.dateFrom}T00:00:00.000Z`) };
  if (f.search?.trim()) {
    const q = f.search.trim();
    // Plain `contains` (no mode: "insensitive") to match getAuditTrailPage —
    // the app targets both SQLite (dev) and PostgreSQL (prod) and the mode
    // argument is Postgres-only.
    where.OR = [{ title: { contains: q } }, { body: { contains: q } }];
  }
  return where;
}

export const getNotificationsPage = cache(async (
  recipientUserId: string,
  tenantId: string,
  opts: {
    page?: number;
    pageSize?: number;
    filters?: NotificationFilters;
    sort?: { key: NotificationSortKey; dir: "asc" | "desc" };
  } = {},
): Promise<NotificationPageResult> => {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = buildWhere(recipientUserId, tenantId, opts.filters ?? {});

  const orderBy: Prisma.NotificationOrderByWithRelationInput =
    opts.sort && SORT_KEYS.has(opts.sort.key)
      ? { [opts.sort.key]: opts.sort.dir }
      : { createdAt: "desc" };

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    // Unfiltered unread — the header count must not move when the user filters.
    // Excludes archived + soft-deleted so it matches the live inbox.
    prisma.notification.count({
      where: { recipientUserId, tenantId, isRead: false, isArchived: false, deletedAt: null },
    }),
  ]);

  return { rows: rows.map(toRow), total, page, pageSize, unread };
});

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  today: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  overdue: number;
}

/**
 * Summary-card counts for the Notification Center header. Same (recipient,
 * tenant) pin as every other query here; all counts run in the DB in one
 * round-trip. `today`/`overdue` are computed from a caller-supplied UTC day
 * boundary so the server never depends on its own clock for a tenant's "today".
 */
export const getNotificationStats = cache(async (
  recipientUserId: string,
  tenantId: string,
  todayStartIso: string,
): Promise<NotificationStats> => {
  const live = { recipientUserId, tenantId, deletedAt: null, isArchived: false };
  const todayStart = new Date(todayStartIso);

  const [total, unread, archived, today, critical, high, medium, low, overdue] = await Promise.all([
    prisma.notification.count({ where: live }),
    prisma.notification.count({ where: { ...live, isRead: false } }),
    prisma.notification.count({ where: { recipientUserId, tenantId, deletedAt: null, isArchived: true } }),
    prisma.notification.count({ where: { ...live, createdAt: { gte: todayStart } } }),
    prisma.notification.count({ where: { ...live, priority: "critical" } }),
    prisma.notification.count({ where: { ...live, priority: "high" } }),
    prisma.notification.count({ where: { ...live, priority: "medium" } }),
    prisma.notification.count({ where: { ...live, priority: "low" } }),
    prisma.notification.count({ where: { ...live, type: "OVERDUE" } }),
  ]);

  return { total, unread, read: total - unread, archived, today, critical, high, medium, low, overdue };
});

export interface NotificationFilterOptions {
  /** Distinct types present in THIS user's own history. */
  types: string[];
}

/** Powers the Type dropdown — only types the user actually has, so the facet
 *  never offers a value that returns nothing. Same scope pin. */
export const getNotificationFilterOptions = cache(async (
  recipientUserId: string,
  tenantId: string,
): Promise<NotificationFilterOptions> => {
  const types = await prisma.notification.findMany({
    where: { recipientUserId, tenantId, deletedAt: null },
    distinct: ["type"],
    select: { type: true },
    orderBy: { type: "asc" },
  });
  return { types: types.map((t) => t.type) };
});
