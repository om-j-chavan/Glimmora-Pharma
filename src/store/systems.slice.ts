import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GxPSystem } from "@/types/csv-csa";

// Data slice for GxP systems (CSV/CSA). Re-introduced so the dashboard can
// seed it server-side on mount — the same per-module hydration pattern as
// findings / capa / deviation. NOT persisted (see PERSIST_SLICES in
// persistence.ts): it re-seeds from the server on every load, so it starts
// from [] and never goes stale. Module pages (/csv-csa) still fetch their own
// Prisma data and pass it as props; this slice only backs cross-module readers
// like the dashboard heatmap.
interface SystemsState {
  items: GxPSystem[];
}

const initialState: SystemsState = { items: [] };

const systemsSlice = createSlice({
  name: "systems",
  initialState,
  reducers: {
    setSystems(state, { payload }: PayloadAction<GxPSystem[]>) {
      state.items = payload;
    },
  },
});

export const { setSystems } = systemsSlice.actions;
export default systemsSlice.reducer;
