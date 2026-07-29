"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { unreadCount } from "@/actions/notifications";

/**
 * ONE authoritative unread count, shared by every surface that shows the badge
 * (the topbar bell AND the sidebar entry). Consolidating here fixes three audit
 * findings at once:
 *
 *  - NTF-008: the badge is always the server truth (`unreadCount()`), never
 *    derived from the 30-row dropdown page, so it can't undercount past 30.
 *  - NTF-010: the poll is gated on `document.visibilityState` — it pauses in a
 *    hidden/backgrounded tab and refreshes immediately on re-focus, instead of
 *    running forever.
 *  - duplicate pollers: the bell no longer runs its own interval; both surfaces
 *    read this single source.
 *
 * This is also the seam the SSE upgrade slots into later: swap the interval for
 * an EventSource subscription and every consumer updates for free.
 */

const POLL_MS = 60_000;

interface NotificationCountValue {
  /** Authoritative unread count for the signed-in user (own tenant). */
  unread: number;
  /** Force an immediate re-fetch from the server. */
  refresh: () => void;
  /** Optimistic local adjustment (reconciled by the next refresh). */
  setUnread: (updater: number | ((prev: number) => number)) => void;
}

const NotificationCountContext = createContext<NotificationCountValue | null>(null);

export function NotificationCountProvider({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const [unread, setUnreadState] = useState(0);
  // Ref mirror so the interval/visibility handlers never capture a stale count.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    try {
      setUnreadState(await unreadCount());
    } catch {
      /* best-effort badge — keep the last known value on transient failure */
    } finally {
      inFlight.current = false;
    }
  }, [user]);

  const setUnread = useCallback((updater: number | ((prev: number) => number)) => {
    setUnreadState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  useEffect(() => {
    if (!user) { setUnreadState(0); return; }

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void refresh();
      timer = setInterval(() => { void refresh(); }, POLL_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    // Only poll while the tab is actually visible (NTF-010).
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [user, refresh]);

  const value = useMemo<NotificationCountValue>(
    () => ({ unread, refresh, setUnread }),
    [unread, refresh, setUnread],
  );

  return (
    <NotificationCountContext.Provider value={value}>
      {children}
    </NotificationCountContext.Provider>
  );
}

/**
 * Read the shared unread count. Returns a safe no-op fallback when used outside
 * the provider (e.g. the admin shell mounts it separately) so a consumer never
 * throws — it simply shows 0 until a provider is present.
 */
export function useNotificationCount(): NotificationCountValue {
  const ctx = useContext(NotificationCountContext);
  if (ctx) return ctx;
  return { unread: 0, refresh: () => {}, setUnread: () => {} };
}
