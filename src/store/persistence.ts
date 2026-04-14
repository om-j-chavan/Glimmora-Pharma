import type { Middleware } from "@reduxjs/toolkit";

const STORAGE_KEY = "glimmora-state";
const VERSION_KEY = "glimmora-version";
<<<<<<< HEAD
const CURRENT_VERSION = "29";
=======
const CURRENT_VERSION = "21";
>>>>>>> 9a7d4075e3c69e02adb8fe56b026deb16b12065c

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
    return JSON.parse(raw);
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
        findings: state.findings,
        capa: state.capa,
        systems: state.systems,
        fda483: state.fda483,
        evidence: state.evidence,
        agiDrift: state.agiDrift,
        raid: state.raid,
        permissions: state.permissions,
        notifications: state.notifications,
        readiness: state.readiness,
      }),
    );
  } catch {
    // quota exceeded or private browsing — ignore
  }
  return result;
};
