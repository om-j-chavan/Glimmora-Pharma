"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

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
    where: { recipientUserId: session.user.id, tenantId: session.user.tenantId },
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
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Unread badge count for the current user (own tenant only). */
export async function unreadCount(): Promise<number> {
  const session = await requireAuth();
  return prisma.notification.count({
    where: { recipientUserId: session.user.id, tenantId: session.user.tenantId, isRead: false },
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
