"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, MailOpen, Mail, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Badge } from "@/components/ui/Badge";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type DataFilter } from "@/components/table/DataTable";
import { notificationVisual } from "@/components/notifications/visuals";
import {
  notificationTypeLabel, notificationModuleLabel, NOTIFICATION_MODULES,
  notificationPriorityLabel,
} from "@/lib/labels/notifications";
import {
  loadNotifications, markAllRead, markManyRead, markManyUnread, markRead,
  archiveMany, restoreMany, deleteMany,
} from "@/actions/notifications";
import type { NotificationRow, NotificationFilterOptions, NotificationStats } from "@/lib/queries/notifications";

// MUST match the route's getNotificationsPage pageSize — the route seeds page 1
// as initialData and "Show more" requests page 2 at this size.
const PAGE_SIZE = 25;

/** Priority → accent colour for the row indicator (matches the app's hex convention). */
const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#0ea5e9",
  low: "#64748b",
  info: "#94a3b8",
};

interface Props {
  initialData: { rows: NotificationRow[]; total: number };
  /**
   * Per-user facet values. Still supplied by the route but no longer read here:
   * its only consumer was the Type dropdown (`options.types`), removed with the
   * other trimmed facets. Kept on the props so the route — which is server
   * data-fetching, out of scope for this display-only trim — is unchanged.
   */
  options: NotificationFilterOptions;
  /** Unread across the whole (unfiltered) scope — the header count. */
  initialUnread: number;
  stats: NotificationStats;
}

export function NotificationsPage({ initialData, initialUnread, stats }: Props) {
  const router = useRouter();
  const { org } = useTenantConfig();
  const tz = org.timezone;
  const dateFormat = org.dateFormat;

  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState(false);
  // Remount token. The shared DataTable owns its own search / filter / sort /
  // page state in server mode and exposes no imperative refetch, so a mutation
  // that changes rows is reflected by re-seeding initialData (router.refresh)
  // and remounting. Trade-off: a bulk action returns the table to page 1 with
  // facets cleared. Row-click doesn't hit this path (it navigates away).
  const [tableKey, setTableKey] = useState(0);

  const reload = useCallback(() => {
    router.refresh();
    setTableKey((k) => k + 1);
  }, [router]);

  /** Open the record behind a notification, marking it read on the way out. */
  const openNotification = useCallback(async (n: NotificationRow) => {
    if (!n.isRead) {
      setUnread((c) => Math.max(0, c - 1));
      try { await markRead(n.id); } catch { /* reconciles on next load */ }
    }
    // Internal paths only — every emit site writes a literal template, and this
    // guard keeps a future one from turning a stored string into an off-site
    // navigation (audit finding NTF-028).
    if (n.linkPath && n.linkPath.startsWith("/") && !n.linkPath.startsWith("//")) {
      router.push(n.linkPath);
      return;
    }
    reload();
  }, [router, reload]);

  const handleMarkAll = useCallback(async () => {
    setBusy(true);
    try {
      await markAllRead();
      setUnread(0);
      reload();
    } finally {
      setBusy(false);
    }
  }, [reload]);

  /** Run a bulk action over a filtered id set, then reconcile + reload. */
  const runBulk = useCallback(
    async (rows: NotificationRow[], fn: (ids: string[]) => Promise<{ updated: number }>, unreadDelta = 0) => {
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return;
      setBusy(true);
      try {
        const res = await fn(ids);
        if (unreadDelta !== 0) setUnread((c) => Math.max(0, c + unreadDelta * res.updated));
        reload();
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const handleMarkSelected = useCallback((rows: NotificationRow[]) => {
    const target = rows.filter((r) => !r.isRead);
    return runBulk(target, markManyRead, -1);
  }, [runBulk]);

  const handleMarkUnread = useCallback((rows: NotificationRow[]) => {
    const target = rows.filter((r) => r.isRead);
    return runBulk(target, markManyUnread, +1);
  }, [runBulk]);

  const handleArchive = useCallback((rows: NotificationRow[]) => {
    const target = rows.filter((r) => !r.isArchived);
    // Archiving an unread item also removes it from the unread inbox count.
    const unreadHit = target.filter((r) => !r.isRead).length;
    return runBulk(target, archiveMany).then(() => {
      if (unreadHit) setUnread((c) => Math.max(0, c - unreadHit));
    });
  }, [runBulk]);

  const handleRestore = useCallback((rows: NotificationRow[]) => {
    const target = rows.filter((r) => r.isArchived);
    return runBulk(target, restoreMany);
  }, [runBulk]);

  const handleDelete = useCallback((rows: NotificationRow[]) => {
    const unreadHit = rows.filter((r) => !r.isRead && !r.isArchived).length;
    return runBulk(rows, deleteMany).then(() => {
      if (unreadHit) setUnread((c) => Math.max(0, c - unreadHit));
    });
  }, [runBulk]);

  const columns: DataColumn<NotificationRow>[] = [
    {
      key: "status",
      label: "Status",
      sortable: true,
      width: "90px",
      exportValue: (n) => (n.isArchived ? "Archived" : n.isRead ? "Read" : "Unread"),
      render: (n) =>
        n.isArchived
          ? <Badge variant="gray">Archived</Badge>
          : n.isRead
            ? <Badge variant="gray">Read</Badge>
            : <Badge variant="blue">Unread</Badge>,
    },
    {
      key: "priority",
      label: "Priority",
      width: "120px",
      exportValue: (n) => notificationPriorityLabel(n.priority),
      render: (n) => {
        const color = PRIORITY_COLOR[n.priority] ?? PRIORITY_COLOR.info;
        return (
          <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} aria-hidden="true" />
            {notificationPriorityLabel(n.priority)}
          </span>
        );
      },
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      width: "180px",
      exportValue: (n) => notificationTypeLabel(n.type),
      render: (n) => {
        const v = notificationVisual(n.type);
        const Icon = v.icon;
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-lg flex-shrink-0 inline-flex items-center justify-center"
              style={{ background: v.color + "18" }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: v.color }} aria-hidden="true" />
            </span>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {notificationTypeLabel(n.type)}
            </span>
          </span>
        );
      },
    },
    {
      key: "notification",
      label: "Notification",
      exportValue: (n) => (n.body ? `${n.title} — ${n.body}` : n.title),
      render: (n) => (
        <div className="min-w-0">
          <p
            className="text-[12px] truncate"
            style={{ color: "var(--text-primary)", fontWeight: n.isRead ? 400 : 600 }}
          >
            {n.title}
          </p>
          {n.body && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
              {n.body}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "module",
      label: "Module",
      width: "150px",
      exportValue: (n) => notificationModuleLabel(n.entityType),
      render: (n) => (
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {notificationModuleLabel(n.entityType)}
        </span>
      ),
    },
    {
      key: "received",
      label: "Received",
      sortable: true,
      width: "170px",
      exportValue: (n) => dayjs.utc(n.createdAt).tz(tz).format("YYYY-MM-DD HH:mm:ss"),
      render: (n) => (
        <time
          dateTime={dayjs(n.createdAt).toISOString()}
          title={dayjs.utc(n.createdAt).tz(tz).format("DD MMM YYYY HH:mm:ss")}
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {dayjs.utc(n.createdAt).tz(tz).format(`${dateFormat}, HH:mm`)}
        </time>
      ),
    },
  ];

  /**
   * Two facets, down from seven. Priority, Severity, Type, Source and Period
   * were removed as UI — seven dropdowns over an inbox most users scan by
   * reading rather than by faceting.
   *
   * Only the DROPDOWNS are gone. `loadNotifications` still accepts every one of
   * those params and the query layer still implements them; nothing was removed
   * server-side, so restoring a facet is re-adding its entry here. The columns
   * that display the same fields (Priority, Type) are untouched, and the table
   * still sorts on Status/Type/Received exactly as before.
   */
  const filters: DataFilter<NotificationRow>[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "unread", label: "Unread" },
        { value: "read", label: "Read" },
        { value: "archived", label: "Archived" },
      ],
    },
    {
      key: "module",
      label: "Module",
      options: NOTIFICATION_MODULES.map((m) => ({ value: m.value, label: m.label })),
    },
  ];

  const actions: PageAction[] = [
    {
      label: unread > 0 ? `Mark all as read (${unread})` : "Mark all as read",
      variant: "secondary",
      icon: CheckCheck,
      disabled: unread === 0 || busy,
      onClick: () => { void handleMarkAll(); },
    },
  ];

  /**
   * Two cards, down from eight. Read, Archived, Today, Critical, High and
   * Overdue were removed — an eight-card strip above a table that already shows
   * status and priority per row restated what the rows said.
   *
   * The COUNTS behind the removed cards are still computed: `stats` arrives
   * whole from `getNotificationStats` (lib/queries/notifications.ts:186), and
   * trimming it would mean editing the query layer, which this display-only
   * change deliberately leaves alone. Restoring a card is one line here.
   */
  const summaryCards: { label: string; value: number; accent?: string }[] = [
    { label: "Total", value: stats.total },
    { label: "Unread", value: stats.unread, accent: "#0ea5e9" },
  ];

  return (
    <PageLayout
      title="Notification Center"
      titleIcon={Bell}
      /* One line. PageLayout renders this into a wrapping `max-w-3xl` <p>
         (PageLayout.tsx:181) and takes no class override, so the copy itself is
         shortened rather than truncated. The per-user scoping statement is kept
         — it is the compliance-relevant half; the feature list it replaced was
         describing controls already visible on the page. */
      description="Every notification addressed to you — only your own are ever shown."
      actions={actions}
      /* "All caught up" removed. The readout now renders ONLY when there is
         something to report; at zero unread the slot is empty. */
      headerRight={
        unread > 0 ? (
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {unread} unread
          </span>
        ) : undefined
      }
    >
      {/* ── Summary cards ── */}
      {/* Full width: two equal columns spanning the container, matching the table
          below. The earlier `sm:max-w-md` cap left them stranded in the left half
          of the page — the grid now stretches, and `p-4` gives the roomier cards
          interior space to match. */}
      <div
        className="grid gap-3 mb-4 grid-cols-2 w-full"
        role="list"
        aria-label="Notification summary"
      >
        {summaryCards.map((c) => (
          <div
            key={c.label}
            role="listitem"
            className="rounded-xl border p-4 w-full"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {c.label}
            </p>
            <p className="text-[20px] font-bold mt-0.5" style={{ color: c.accent ?? "var(--text-primary)" }}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <DataTable<NotificationRow>
        key={tableKey}
        mode="server"
        fetcher={loadNotifications}
        initialData={initialData}
        rowKey={(n) => n.id}
        ariaLabel="Notifications"
        caption="Your notifications, newest first — status, priority, type, message, originating module and received time"
        columns={columns}
        pageSize={PAGE_SIZE}
        defaultSort={{ key: "received", dir: "desc" }}
        search={{ placeholder: "Search notifications…" }}
        filters={filters}
        exportOptions={{ filename: `notifications-${dayjs().format("YYYY-MM-DD")}`, title: "Notifications" }}
        bulk={{
          actions: [
            {
              label: "Mark as read", icon: MailOpen, onClick: handleMarkSelected,
              guard: (rows) => ({ ok: rows.some((r) => !r.isRead), reason: "No unread items selected." }),
            },
            {
              label: "Mark as unread", icon: Mail, onClick: handleMarkUnread,
              guard: (rows) => ({ ok: rows.some((r) => r.isRead), reason: "No read items selected." }),
            },
            {
              label: "Archive", icon: Archive, onClick: handleArchive,
              guard: (rows) => ({ ok: rows.some((r) => !r.isArchived), reason: "Selected items are already archived." }),
            },
            {
              label: "Restore", icon: ArchiveRestore, onClick: handleRestore,
              guard: (rows) => ({ ok: rows.some((r) => r.isArchived), reason: "Only archived items can be restored." }),
            },
            { label: "Delete", icon: Trash2, variant: "danger", onClick: handleDelete },
          ],
          enabled: () => true,
        }}
        onRowClick={(n) => { void openNotification(n); }}
        rowClassName={(n) => (n.isRead ? "" : "font-medium")}
        emptyState={({ isFiltered, hasSearch }) =>
          isFiltered || hasSearch
            ? "No notifications match the current filters."
            : "You have no notifications yet. They appear here when work is assigned to you, or when a record you own is approved, rejected, or returned for rework."
        }
      />
    </PageLayout>
  );
}
