import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Re-exported for backwards compatibility — canonical source is auth.slice.ts
export type { TenantSiteConfig as SiteConfig } from "./auth.slice";
export type { TenantUserConfig as UserConfig } from "./auth.slice";

// Framework enablement is NO LONGER stored here (Phase 1, Item 4). It moved to
// the server (Framework / TenantFramework tables) and hydrates into the
// NON-persisted `frameworks` slice per tenant — so it can never leak across
// tenants via localStorage. This slice keeps only the AGI UI prefs.

export interface AGISettings {
  mode: "autonomous" | "assisted" | "manual";
  confidence: number;
  agents: {
    capa: boolean;
    deviation: boolean;
    fda483: boolean;
    drift: boolean;
    regulatory: boolean;
    supplier: boolean;
  };
}

interface SettingsState {
  agi: AGISettings;
}

const initialState: SettingsState = {
  agi: {
    mode: "autonomous",
    confidence: 72,
    agents: {
      capa: true,
      deviation: true,
      fda483: true,
      drift: true,
      regulatory: true,
      supplier: true,
    },
  },
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateAGI(
      state,
      { payload }: PayloadAction<Partial<Omit<AGISettings, "agents">>>,
    ) {
      Object.assign(state.agi, payload);
    },
    toggleAgent(
      state,
      { payload }: PayloadAction<keyof AGISettings["agents"]>,
    ) {
      state.agi.agents[payload] = !state.agi.agents[payload];
    },
  },
});

export const {
  updateAGI,
  toggleAgent,
} = settingsSlice.actions;
export default settingsSlice.reducer;
