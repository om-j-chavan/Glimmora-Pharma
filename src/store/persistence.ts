import type { Middleware } from "@reduxjs/toolkit";
import type { AuthState } from "./auth.slice";
import type { SettingsState } from "./settings.slice";

// Standalone type — avoids circular import with index.ts
type PersistedState = {
  auth?: Partial<AuthState>;
  settings?: Partial<SettingsState>;
};

const STORAGE_KEY = "glimmora-state";

export function loadPersistedState(): PersistedState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return undefined;
  }
}

export const persistMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  try {
    const state = store.getState();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        auth: state.auth,
        settings: state.settings,
      }),
    );
  } catch {
    // quota exceeded or private browsing — ignore
  }
  return result;
};
