import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Re-exported for backwards compatibility — canonical source is auth.slice.ts
export type { TenantSiteConfig as SiteConfig } from "./auth.slice";
export type { TenantUserConfig as UserConfig } from "./auth.slice";

export interface FrameworkSettings {
  p210: boolean;
  p11: boolean;
  annex11: boolean;
  annex15: boolean;
  ichq9: boolean;
  ichq10: boolean;
  gamp5: boolean;
  who: boolean;
  mhra: boolean;
}

export interface AGISettings {
  mode: "autonomous" | "assisted" | "manual";
  confidence: number;
  agents: {
    capa: boolean;
    deviation: boolean;
    fda483: boolean;
    batch: boolean;
    drift: boolean;
    regulatory: boolean;
    supplier: boolean;
  };
}

interface SettingsState {
  frameworks: FrameworkSettings;
  agi: AGISettings;
}

const initialState: SettingsState = {
  frameworks: {
    p210: true,
    p11: true,
    annex11: true,
    annex15: true,
    ichq9: true,
    ichq10: true,
    gamp5: true,
    who: true,
    mhra: true,
  },
  agi: {
    mode: "autonomous",
    confidence: 72,
    agents: {
      capa: true,
      deviation: true,
      fda483: true,
      batch: true,
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
    toggleFramework(
      state,
      { payload }: PayloadAction<keyof FrameworkSettings>,
    ) {
      state.frameworks[payload] = !state.frameworks[payload];
    },
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
  toggleFramework,
  updateAGI,
  toggleAgent,
} = settingsSlice.actions;
export default settingsSlice.reducer;
