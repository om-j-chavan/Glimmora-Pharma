"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Bell, X } from "lucide-react";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Button } from "@/components/ui/Button";
import { useAppSelector } from "@/hooks/useAppSelector";
import { notificationVisual } from "@/components/notifications/visuals";
import { useNotificationCount } from "@/components/notifications/NotificationCountProvider";
import {
  getNotifications, markRead, markAllRead,
  type NotificationView,
} from "@/actions/notifications";

/** Only navigate to internal, single-slash paths (NTF-028) — a stored linkPath
 *  can never become an off-site or protocol-relative redirect. */
function isSafeInternalPath(p: string | null | undefined): p is string {
  return !!p && p.startsWith("/") && !p.startsWith("//");
}

export function NotificationBell() {
  const router = useRouter();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  // Single authoritative badge count, shared with the sidebar entry. Polling +
  // visibility gating live in the provider (NTF-008, NTF-010).
  const { unread, setUnread, refresh } = useNotificationCount();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loading, setLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Full list — fetched when the dropdown opens. The badge count is NEVER
  // derived from this 30-row window (that was the NTF-008 undercount); the
  // provider owns the authoritative count.
  const refreshList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await getNotifications(30));
    } catch {
      /* ignore — keep whatever we last had */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Escape closes the dropdown (dialog contract, NTF-007).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleOpenItem = async (n: NotificationView) => {
    setOpen(false);
    if (!n.isRead) {
      // Optimistic — flip locally first, then persist (fault-tolerant).
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      setUnread((c) => Math.max(0, c - 1));
      try { await markRead(n.id); } catch { /* will reconcile on next refresh */ }
    }
    if (isSafeInternalPath(n.linkPath)) router.push(n.linkPath);
  };

  const handleMarkAll = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    setUnread(0);
    try { await markAllRead(); } catch { /* reconcile on next refresh */ }
    finally { refresh(); }
  };

  if (!user) return null;

  return (
    <div ref={bellRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
          background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)",
        }}
      >
        <Bell size={15} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ef4444] text-white text-[9px] font-bold flex items-center justify-center" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={clsx("absolute right-0 top-11 w-[calc(100vw-24px)] sm:w-80 max-w-80 rounded-2xl border shadow-lg z-50 overflow-hidden", "bg-(--bg-elevated) border-(--bg-border)")}
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className={clsx("flex items-center justify-between px-4 py-3 border-b", "border-(--bg-border)")}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <Button type="button" variant="ghost" size="xs" onClick={handleMarkAll} className="!h-auto !p-0 text-[10px] text-[#0ea5e9] hover:underline">Mark all read</Button>
              )}
              <Button type="button" variant="ghost" size="xs" icon={X} onClick={() => setOpen(false)} className="opacity-40 hover:opacity-100" style={{ color: "var(--text-primary)" }} aria-label="Close" />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-6 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: "#334155" }} aria-hidden="true" />
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No notifications</p>
              </div>
            )}
            {items.map((notif) => {
              const cfg = notificationVisual(notif.type);
              const NotifIcon = cfg.icon;
              return (
                <button
                  key={notif.id}
                  type="button"
                  className={clsx(
                    "w-full text-left flex items-start gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors duration-150 bg-transparent",
                    !notif.isRead && (isDark ? "bg-(--brand-muted)" : "bg-[#fafbff]"),
                    isDark ? "border-(--bg-border) hover:bg-(--bg-surface)" : "border-[#f1f5f9] hover:bg-[#f8fafc]",
                  )}
                  onClick={() => handleOpenItem(notif)}
                  aria-label={`${notif.isRead ? "" : "Unread. "}${notif.title}`}
                >
                  <span className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: cfg.color + "18" }}>
                    <NotifIcon className="w-3.5 h-3.5" style={{ color: cfg.color }} aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0 block">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{notif.title}</span>
                      {!notif.isRead && <span className="w-2 h-2 rounded-full bg-[#0ea5e9] flex-shrink-0 mt-1" aria-hidden="true" />}
                    </span>
                    {notif.body && (
                      <span className="text-[11px] mt-0.5 block" style={{ color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{notif.body}</span>
                    )}
                    <RelativeTime value={notif.createdAt} className="block text-[10px] mt-1" style={{ color: "var(--text-muted)" }} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer — the dropdown only ever shows the newest 30; the full
              searchable/filterable history lives on /notifications. */}
          <div className="px-4 py-2.5 border-t text-center border-(--bg-border)">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => { setOpen(false); router.push("/notifications"); }}
              className="!h-auto !p-0 text-[11px] text-[#0ea5e9] hover:underline"
            >
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
