import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "glimmora-state";
const VERSION_KEY = "glimmora-version";
// Bump this whenever PERSIST_SLICES or shape of any persisted slice changes —
// older clients will discard their cached state on the next load.
// v46: framework enablement removed from the settings slice (Phase 1, Item 4) —
// forces existing clients to drop any cached settings.frameworks so no stale
// per-browser framework toggle can survive (the cross-tenant leak fix).
// v47: the dead client notification engine + its persisted slice were removed
// (Notification Center consolidation). Bumping evicts the orphaned
// `notifications` blob — which held finding IDs + requirement text — from every
// existing browser (audit finding NTF-015).
// 48 — purges any persisted `aiAccessToken`. The AI service bearer token used
// to live in the auth slice, so it was written into this localStorage blob and
// survived sign-out. Nothing reads it any more (the server mints a token per
// request), but a stale credential must not be left sitting in browser storage,
// so this bump clears the blob for every existing session on next load.
// 49 — purges the persisted `settings.agi` blob. The AI agent policy used to
// live here, so every browser held its own copy of a control that governs what
// AI may do to regulated records — unaudited, unenforced, and diverging between
// colleagues. It is now tenant-scoped server state (TenantAgiPolicy), so the
// cached copy must not linger and be mistaken for the live policy.
const CURRENT_VERSION = "49";

/**
 * Slices to persist to localStorage.
 *
 * Only UI / session slices are persisted — data slices (findings, capa,
 * deviation, systems, evidence, raid, readiness)
 * are loaded fresh from the database on every visit, so caching them
 * just risks stale data and bloated storage.
 */
const PERSIST_SLICES = [
  "auth",
  "settings",
  "theme",
  "permissions",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPersistedState(): Record<string, any> | undefined {
  // Never preload at store-creation time. The store module is imported on
  // both the server and the client, and reading localStorage here would
  // give the server (no localStorage → defaults) and client (localStorage
  // → previous session) different first-render output, causing a hydration
  // mismatch. Use readPersistedStateFromStorage() inside a post-mount
  // useEffect to rehydrate after React has hydrated the tree.
  return undefined;
}

/**
 * Read the persisted Redux state from localStorage. Safe to call only on the
 * client. Returns undefined on the server, when nothing is stored, when the
 * stored version is stale, or when JSON parsing fails.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readPersistedStateFromStorage(): Record<string, any> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const ver = localStorage.getItem(VERSION_KEY);
    if (ver !== CURRENT_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      return undefined;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);

    // Defensive: even if older code wrote data slices into the cache, only
    // hand back the UI keys so data slices always start from `[]`.
    const out: Record<string, unknown> = {};
    for (const key of PERSIST_SLICES) {
      if (parsed[key] !== undefined) out[key] = parsed[key];
    }
    return out;
  } catch {
    // localStorage throw (private browsing) OR JSON.parse failure
    // (corrupt cached state from a manual edit or crashed write). Either
    // way, returning undefined makes the caller fall back to slice
    // defaults — the same end state as a fresh visitor. Symmetric with
    // the persistMiddleware catch below.
    return undefined;
  }
}

/** Debounced save — avoids thrashing localStorage on rapid dispatch bursts. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastStore: { getState: () => any } | null = null;

function persistNow() {
  if (!lastStore) return;
  try {
    const state = lastStore.getState();
    const toPersist: Record<string, unknown> = {};
    for (const key of PERSIST_SLICES) {
      toPersist[key] = state[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

/**
 * Forces an immediate persist of the current Redux state to localStorage.
 * Use before a full-page navigation that would otherwise cause the in-flight
 * debounced save to be dropped (e.g. window.location.assign right after a
 * dispatch).
 */
export function flushPersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistNow();
}

export const persistMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  lastStore = store;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNow();
  }, 500);

  return result;
};
