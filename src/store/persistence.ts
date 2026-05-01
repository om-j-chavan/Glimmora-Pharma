import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "glimmora-state";
const VERSION_KEY = "glimmora-version";
// Bump this whenever PERSIST_SLICES or shape of any persisted slice changes —
// older clients will discard their cached state on the next load.
const CURRENT_VERSION = "45";

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
  "notifications",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPersistedState(): Record<string, any> | undefined {
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
    return undefined;
  }
}

/** Debounced save — avoids thrashing localStorage on rapid dispatch bursts. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const persistMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const state = store.getState();
      const toPersist: Record<string, unknown> = {};
      for (const key of PERSIST_SLICES) {
        toPersist[key] = state[key];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
      // quota exceeded or private browsing — ignore
    }
  }, 500);

  return result;
};
