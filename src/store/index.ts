import { configureStore, combineReducers } from "@reduxjs/toolkit";
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
import readinessReducer from "./readiness.slice";
import { loadPersistedState, persistMiddleware } from "./persistence";

const rootReducer = combineReducers({
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
  readiness: readinessReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: loadPersistedState() as ReturnType<typeof rootReducer> | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  middleware: ((gDM: any) => gDM({ serializableCheck: false }).concat(persistMiddleware)) as any,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
