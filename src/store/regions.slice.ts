import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { REGULATORY_REGIONS } from "@/constants/regulatoryRegions";

export interface RegionOption {
  value: string;
  label: string;
}

/**
 * Regulatory regions for the CURRENT session — the DB-backed replacement for
 * reading the REGULATORY_REGIONS constant directly (Item #3, Stage 2).
 *
 * INITIAL STATE IS THE CONSTANT. That is deliberate: dropdowns and label lookups
 * work correctly on the very first render (and if hydration never runs), so the
 * migration can never produce an empty/short dropdown — parity by construction.
 * The server then hydrates `active` (archivedAt=null) + `labelMap` (all regions,
 * incl. archived) from the DB. INTENTIONALLY NOT persisted.
 */
interface RegionsState {
  /** Active regions → dropdown options. */
  active: RegionOption[];
  /** value → label for ALL regions incl. archived → historical label resolution. */
  labelMap: Record<string, string>;
  loaded: boolean;
}

const CONSTANT_ACTIVE: RegionOption[] = REGULATORY_REGIONS.map((r) => ({ value: r.value, label: r.label }));
const CONSTANT_MAP: Record<string, string> = Object.fromEntries(REGULATORY_REGIONS.map((r) => [r.value, r.label]));

const initialState: RegionsState = { active: CONSTANT_ACTIVE, labelMap: CONSTANT_MAP, loaded: false };

const regionsSlice = createSlice({
  name: "regions",
  initialState,
  reducers: {
    setRegions(state, { payload }: PayloadAction<{ active: RegionOption[]; labelMap: Record<string, string> }>) {
      // Guard against an empty payload clobbering the constant fallback.
      state.active = payload.active.length ? payload.active : CONSTANT_ACTIVE;
      state.labelMap = Object.keys(payload.labelMap).length ? payload.labelMap : CONSTANT_MAP;
      state.loaded = true;
    },
  },
});

export const { setRegions } = regionsSlice.actions;
export default regionsSlice.reducer;
