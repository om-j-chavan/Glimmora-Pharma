import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface FrameworkItem {
  key: string;
  name: string;
}

/**
 * Effective frameworks for the CURRENT tenant (enabled only), resolved
 * server-side via effectiveFrameworksForTenant and hydrated per tenant on
 * login/tenant context. INTENTIONALLY NOT persisted (not in PERSIST_SLICES) so
 * one tenant's enablement can never leak to another in the same browser — the
 * exact bug Item 4 fixes. Replaces the old settings.frameworks booleans.
 */
interface FrameworksState {
  list: FrameworkItem[];
  loaded: boolean;
}

const initialState: FrameworksState = { list: [], loaded: false };

const frameworksSlice = createSlice({
  name: "frameworks",
  initialState,
  reducers: {
    setEffectiveFrameworks(state, { payload }: PayloadAction<FrameworkItem[]>) {
      state.list = payload;
      state.loaded = true;
    },
    resetFrameworks() {
      return initialState;
    },
  },
});

export const { setEffectiveFrameworks, resetFrameworks } = frameworksSlice.actions;
export default frameworksSlice.reducer;
