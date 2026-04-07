import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./auth.slice";
import settingsReducer from "./settings.slice";
import themeReducer from "./theme.slice";
import findingsReducer from "./findings.slice";
import capaReducer from "./capa.slice";
import systemsReducer from "./systems.slice";
import fda483Reducer from "./fda483.slice";
import evidenceReducer from "./evidence.slice";
import agiDriftReducer from "./agiDrift.slice";
import raidReducer from "./raid.slice";
import permissionsReducer from "./permissions.slice";
import notificationsReducer from "./notifications.slice";
import { loadPersistedState, persistMiddleware } from "./persistence";

const persisted = loadPersistedState();

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    theme: themeReducer,
    findings: findingsReducer,
    capa: capaReducer,
    systems: systemsReducer,
    fda483: fda483Reducer,
    evidence: evidenceReducer,
    agiDrift: agiDriftReducer,
    raid: raidReducer,
    permissions: permissionsReducer,
    notifications: notificationsReducer,
  },
  preloadedState: persisted,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(persistMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
