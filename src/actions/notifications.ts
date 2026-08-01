"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getNotificationsPage, type NotificationRow, type NotificationSortKey } from "@/lib/queries/notifications";
import type { ServerQuery, SortDir } from "@/components/table/DataTable";

/** Serialised notification (Dates → ISO) for the client bell. */
export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  priority: string;
  severity: string;
  createdAt: string;
}

const MAX_LIMIT = 50;

/**
 * The current user's notifications, newest first. Scoped to the session user
 * AND tenant — a caller can only ever read their own (cross-tenant rows are
 * filtered out even if a recipientUserId somehow collided across tenants).
 */
export async function getNotifications(limit = 30): Promise<NotificationView[]> {
  const session = await requireAuth();
  const rows = await prisma.notification.findMany({
    // The bell shows the LIVE inbox only — archived + soft-deleted excluded.
    where: {
      recipientUserId: session.user.id,
      tenantId: session.user.tenantId,
      isArchived: false,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), MAX_LIMIT),
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    entityType: n.entityType,
    entityId: n.entityId,
    isRead: n.isRead,
    priority: n.priority,
    severity: n.severity,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Unread badge count for the current user (own tenant only). Live inbox only —
 *  archived + soft-deleted are excluded so the badge matches what the bell shows. */
export async function unreadCount(): Promise<number> {
  const session = await requireAuth();
  return prisma.notification.count({
    where: {
      recipientUserId: session.user.id,
      tenantId: session.user.tenantId,
      isRead: false,
      isArchived: false,
      deletedAt: null,
    },
  });
}

/**
 * Mark ONE of the current user's notifications read. The where-clause is scoped
 * to (id, recipientUserId=self, tenantId) so a user can never mark someone
 * else's notification read — a foreign id simply matches zero rows.
 */
export async function markRead(id: string): Promise<{ success: boolean }> {
  const session = await requireAuth();
  await prisma.notification.updateMany({
    where: { id, recipientUserId: session.user.id, tenantId: session.user.tenantId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { success: true };
}

/** Mark all of the current user's unread notifications read (own tenant only). */
export async function markAllRead(): Promise<{ success: boolean }> {
  const session = await requireAuth();
  await prisma.notification.updateMany({
    where: { recipientUserId: session.user.id, tenantId: session.user.tenantId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { success: true };
}

/* ── /notifications page ─────────────────────────────────────────────────── */

/** Cap on one bulk mark-read call — the page selects at most a page of rows,
 *  so this only bounds a hand-crafted request. */
const MAX_BULK_IDS = 200;

/**
 * Mark a specific set of the caller's notifications read. Same ownership
 * predicate as markRead(): ids the caller does not own simply match zero rows,
 * so a forged id list can neither mutate nor probe another user's notifications.
 */
export async function markManyRead(ids: string[]): Promise<{ success: boolean; updated: number }> {
  const session = await requireAuth();
  const clean = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0))).slice(0, MAX_BULK_IDS);
  if (clean.length === 0) return { success: true, updated: 0 };
  const res = await prisma.notification.updateMany({
    where: {
      id: { in: clean },
      recipientUserId: session.user.id,
      tenantId: session.user.tenantId,
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });
  return { success: true, updated: res.count };
}

/** Sanitise + cap a client-supplied id list (shared by every bulk action). */
function cleanIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0))).slice(0, MAX_BULK_IDS);
}

/**
 * Mark a set of the caller's notifications UNREAD. Same ownership predicate as
 * markManyRead — foreign ids match zero rows.
 */
export async function markManyUnread(ids: string[]): Promise<{ success: boolean; updated: number }> {
  const session = await requireAuth();
  const clean = cleanIds(ids);
  if (clean.length === 0) return { success: true, updated: 0 };
  const res = await prisma.notification.updateMany({
    where: { id: { in: clean }, recipientUserId: session.user.id, tenantId: session.user.tenantId, isRead: true },
    data: { isRead: false, readAt: null },
  });
  return { success: true, updated: res.count };
}

/**
 * Archive a set of the caller's notifications (recoverable — moves them out of
 * the live inbox/bell). Ownership-scoped like every other bulk action.
 */
export async function archiveMany(ids: string[]): Promise<{ success: boolean; updated: number }> {
  const session = await requireAuth();
  const clean = cleanIds(ids);
  if (clean.length === 0) return { success: true, updated: 0 };
  const res = await prisma.notification.updateMany({
    where: { id: { in: clean }, recipientUserId: session.user.id, tenantId: session.user.tenantId, isArchived: false, deletedAt: null },
    data: { isArchived: true, archivedAt: new Date() },
  });
  return { success: true, updated: res.count };
}

/** Restore a set of archived notifications back to the live inbox. */
export async function restoreMany(ids: string[]): Promise<{ success: boolean; updated: number }> {
  const session = await requireAuth();
  const clean = cleanIds(ids);
  if (clean.length === 0) return { success: true, updated: 0 };
  const res = await prisma.notification.updateMany({
    where: { id: { in: clean }, recipientUserId: session.user.id, tenantId: session.user.tenantId, isArchived: true, deletedAt: null },
    data: { isArchived: false, archivedAt: null },
  });
  return { success: true, updated: res.count };
}

/**
 * SOFT-delete a set of the caller's notifications (sets deletedAt — never a hard
 * DELETE, so a GxP record is never destroyed and a retention sweep can decide
 * final disposal). Hidden from every read path once deleted.
 */
export async function deleteMany(ids: string[]): Promise<{ success: boolean; updated: number }> {
  const session = await requireAuth();
  const clean = cleanIds(ids);
  if (clean.length === 0) return { success: true, updated: 0 };
  const res = await prisma.notification.updateMany({
    where: { id: { in: clean }, recipientUserId: session.user.id, tenantId: session.user.tenantId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { success: true, updated: res.count };
}

/** DataTable column key → Notification sort column (whitelist). */
const NOTIFICATION_SORT_COLUMN: Record<string, NotificationSortKey> = {
  received: "createdAt",
  type: "type",
  status: "isRead",
};

function mapSort(s: ServerQuery["sort"]): { key: NotificationSortKey; dir: SortDir } | undefined {
  if (!s) return undefined;
  const key = NOTIFICATION_SORT_COLUMN[s.key];
  return key ? { key, dir: s.dir } : undefined;
}

/** Rolling-window presets → an inclusive dateFrom (YYYY-MM-DD). Mirrors the
 *  audit trail's `period` facet so both log surfaces filter time identically. */
function periodToDateFrom(period: string | undefined): string | undefined {
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 0;
  if (!days) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Server-mode fetcher for the /notifications <DataTable>. Search, filter, sort
 * and paging all run in the DATABASE over the caller's WHOLE history — the
 * bell's 30-row window can only ever show the newest page.
 *
 * No role gate: notifications are addressed to a specific user, so the
 * (recipient, tenant) pin inside getNotificationsPage IS the authorization.
 */
export async function loadNotifications(q: ServerQuery): Promise<{ rows: NotificationRow[]; total: number }> {
  const session = await requireAuth();
  const f = q.filters ?? {};
  const res = await getNotificationsPage(session.user.id, session.user.tenantId, {
    page: q.page,
    pageSize: q.pageSize,
    sort: mapSort(q.sort),
    filters: {
      module: f.module || undefined,
      type: f.type || undefined,
      status: f.status || undefined,
      priority: f.priority || undefined,
      severity: f.severity || undefined,
      source: f.source || undefined,
      dateFrom: periodToDateFrom(f.period),
      search: q.search || undefined,
    },
  });
  return { rows: res.rows, total: res.total };
}
