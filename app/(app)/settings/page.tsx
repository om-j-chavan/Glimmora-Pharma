import { SettingsPage } from "@/modules/settings/SettingsPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import {
  getSites,
  getUsers,
  getNotificationsPage,
  getNotificationFilterOptions,
  getNotificationStats,
} from "@/lib/queries";

// MUST match NotificationsPage's DataTable pageSize (this seeds page 1) — same
// value the former /notifications route used.
const NOTIF_PAGE_SIZE = 25;

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireAuth();
  const { tab } = await searchParams;

  // UTC start-of-day boundary for the notifications "Today" card — deterministic,
  // independent of the server clock (matches the former /notifications route).
  const now = new Date();
  const todayStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  const [sites, users, notifFirst, notifOptions, notifStats] = await Promise.all([
    getSites(session.user.tenantId),
    getUsers(session.user.tenantId),
    getNotificationsPage(session.user.id, session.user.tenantId, { page: 1, pageSize: NOTIF_PAGE_SIZE }),
    getNotificationFilterOptions(session.user.id, session.user.tenantId),
    getNotificationStats(session.user.id, session.user.tenantId, todayStartIso),
  ]);

  return (
    <ErrorBoundary moduleName="Settings">
      <SettingsPage
        sites={sites}
        users={users}
        initialTab={tab}
        notifications={{
          initialData: { rows: notifFirst.rows, total: notifFirst.total },
          options: notifOptions,
          initialUnread: notifFirst.unread,
          stats: notifStats,
        }}
      />
    </ErrorBoundary>
  );
}
