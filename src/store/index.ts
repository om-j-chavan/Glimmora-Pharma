import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./auth.slice";
import settingsReducer from "./settings.slice";
import themeReducer from "./theme.slice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    settings: settingsReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
