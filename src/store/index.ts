import { configureStore, combineReducers, createAction, type AnyAction } from "@reduxjs/toolkit";
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
import auditTrailReducer from "./auditTrail.slice";
import deviationReducer from "./deviation.slice";
import rtmReducer from "./rtm.slice";
import { loadPersistedState, persistMiddleware } from "./persistence";

const combinedReducer = combineReducers({
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
  auditTrail: auditTrailReducer,
  deviation: deviationReducer,
  rtm: rtmReducer,
});

type RootStateInternal = ReturnType<typeof combinedReducer>;

/**
 * Replaces the persisted slices in one shot. Dispatched from a client-side
 * useEffect after React has hydrated, so the first render uses the same
 * default state on server and client (avoiding a hydration mismatch on any
 * Redux-derived value), and the localStorage state is layered on after.
 */
export const rehydrateState = createAction<Partial<RootStateInternal>>(
  "store/rehydrate",
);

const rootReducer = (state: RootStateInternal | undefined, action: AnyAction): RootStateInternal => {
  if (rehydrateState.match(action)) {
    return { ...(state as RootStateInternal), ...action.payload };
  }
  return combinedReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: loadPersistedState() as RootStateInternal | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  middleware: ((gDM: any) => gDM({ serializableCheck: false }).concat(persistMiddleware)) as any,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
