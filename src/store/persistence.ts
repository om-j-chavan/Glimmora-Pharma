import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "glimmora-state";
const VERSION_KEY = "glimmora-version";
const CURRENT_VERSION = "44";

/** Slices to persist. Excludes large/transient slices (auditTrail, notifications) for performance. */
const PERSIST_SLICES = [
  "auth",
  "settings",
  "theme",
  "findings",
  "capa",
  "systems",
  "fda483",
  "evidence",
  "agiDrift",
  "raid",
  "permissions",
  "readiness",
  "deviation",
  "rtm",
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
    return JSON.parse(raw);
  } catch {
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
