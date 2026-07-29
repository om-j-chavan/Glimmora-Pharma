import { NotificationsPage } from "@/modules/notifications/NotificationsPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getNotificationsPage, getNotificationFilterOptions, getNotificationStats } from "@/lib/queries";

export const metadata = {
  title: "Notifications — Pharma Glimmora",
};

// MUST match NotificationsPage's DataTable pageSize (this seeds page 1).
const PAGE_SIZE = 25;

/**
 * /notifications — the full notification history for the SIGNED-IN USER.
 *
 * Gating is deliberately role-independent, exactly like /worklist: a
 * notification is addressed to one specific user, so the (recipientUserId,
 * tenantId) pin inside the queries IS the authorization — there is no role that
 * should see another user's notifications, and none that should be denied their
 * own. super_admin is already walled to /admin by the (app) layout.
 */
export default async function Page() {
  const session = await requireAuth();

  // UTC start-of-day boundary for the "Today" summary card — deterministic and
  // independent of the server's local clock (the query takes it as an argument).
  const now = new Date();
  const todayStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  const [first, options, stats] = await Promise.all([
    getNotificationsPage(session.user.id, session.user.tenantId, { page: 1, pageSize: PAGE_SIZE }),
    getNotificationFilterOptions(session.user.id, session.user.tenantId),
    getNotificationStats(session.user.id, session.user.tenantId, todayStartIso),
  ]);

  return (
    <ErrorBoundary moduleName="Notifications">
      <NotificationsPage
        initialData={{ rows: first.rows, total: first.total }}
        options={options}
        initialUnread={first.unread}
        stats={stats}
      />
    </ErrorBoundary>
  );
}
