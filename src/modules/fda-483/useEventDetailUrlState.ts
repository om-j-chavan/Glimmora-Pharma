"use client";

/**
 * useEventDetailUrlState — URL-driven state for the FDA 483 detail view.
 *
 * Encodes the currently-selected event, the active detail tab, and the
 * focused observation index into ?event= ?tab= ?obs= search params.
 * This makes the detail view deep-linkable (a URL like
 * /fda-483?event=EV123&tab=investigation&obs=2 lands directly on the
 * Investigation tab focused on the third observation) and replaces the
 * previous in-memory `currentStep` / `selectedEvent` state on FDA483Page.
 *
 * The hook uses router.replace() (not router.push) so each tab click
 * does NOT pile up a new entry in browser history — the user's Back
 * button still leaves the FDA 483 module after one click. Multi-param
 * updates flow through navigate() which writes all params in a single
 * router call so React-batched re-renders stay coherent.
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export type DetailTab =
  | "overview"
  | "observations"
  | "investigation"
  | "response"
  | "audit";

const VALID_TABS: readonly DetailTab[] = [
  "overview",
  "observations",
  "investigation",
  "response",
  "audit",
] as const;

function isDetailTab(v: string | null): v is DetailTab {
  return !!v && (VALID_TABS as readonly string[]).includes(v);
}

export interface UseEventDetailUrlState {
  /** Currently selected event id, or null when on the list view. */
  eventId: string | null;
  /** Active detail tab. Defaults to "overview" when no ?tab= present. */
  tab: DetailTab;
  /** Currently focused observation index (0-based), or null. */
  obsIndex: number | null;
  /** Open / close the detail view by setting / clearing ?event=. Clears
   *  tab and obs params on close so re-opening another event starts
   *  fresh on Overview. */
  setEvent: (id: string | null) => void;
  /** Switch the active tab. Preserves ?event= and ?obs=. */
  setTab: (tab: DetailTab) => void;
  /** Set the focused observation index. Pass null to clear. */
  setObsIndex: (index: number | null) => void;
  /** Atomic multi-param update — use when changing both tab and obs in
   *  one click (e.g. "Continue here" deep-link from a readiness row). */
  navigate: (params: { tab?: DetailTab; obsIndex?: number | null }) => void;
}

export function useEventDetailUrlState(): UseEventDetailUrlState {
  const router = useRouter();
  // pathname may be null during the very first render in some Next.js
  // contexts (e.g. error/not-found routes). Fall back to "" so the
  // writer can still produce a query-string-only URL.
  const pathname = usePathname() ?? "";
  // useSearchParams returns a ReadonlyURLSearchParams | null. Coerce
  // to an empty params object so the rest of the hook can read
  // synchronously without null checks on every access.
  const searchParams = useSearchParams();
  const eventId = searchParams?.get("event") ?? null;
  const tabRaw = searchParams?.get("tab") ?? null;
  const tab: DetailTab = isDetailTab(tabRaw) ? tabRaw : "overview";

  const obsRaw = searchParams?.get("obs") ?? null;
  const obsIndex = useMemo(() => {
    if (obsRaw === null || obsRaw === "") return null;
    const n = Number.parseInt(obsRaw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [obsRaw]);

  const writeParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      mutate(params);
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setEvent = useCallback(
    (id: string | null) => {
      writeParams((p) => {
        if (id) {
          p.set("event", id);
        } else {
          // Closing the detail view → drop all detail-only params so a
          // subsequent open starts fresh.
          p.delete("event");
          p.delete("tab");
          p.delete("obs");
        }
      });
    },
    [writeParams],
  );

  const setTab = useCallback(
    (next: DetailTab) => {
      writeParams((p) => {
        if (next === "overview") {
          p.delete("tab");
        } else {
          p.set("tab", next);
        }
      });
    },
    [writeParams],
  );

  const setObsIndex = useCallback(
    (index: number | null) => {
      writeParams((p) => {
        if (index === null || index < 0) {
          p.delete("obs");
        } else {
          p.set("obs", String(index));
        }
      });
    },
    [writeParams],
  );

  const navigate = useCallback(
    (next: { tab?: DetailTab; obsIndex?: number | null }) => {
      writeParams((p) => {
        if (next.tab !== undefined) {
          if (next.tab === "overview") p.delete("tab");
          else p.set("tab", next.tab);
        }
        if (next.obsIndex !== undefined) {
          if (next.obsIndex === null || next.obsIndex < 0) p.delete("obs");
          else p.set("obs", String(next.obsIndex));
        }
      });
    },
    [writeParams],
  );

  return { eventId, tab, obsIndex, setEvent, setTab, setObsIndex, navigate };
}
