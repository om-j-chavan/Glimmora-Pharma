import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type FindingSeverity = "Critical" | "Major" | "Minor";
export type FindingStatus = "Open" | "In Progress" | "Closed";

export interface Finding {
  id: string;
  tenantId: string;
  siteId: string;
  area: string;
  requirement: string;
  framework: string;
  severity: FindingSeverity;
  status: FindingStatus;
  owner: string;
  targetDate: string;
  evidenceLink: string;
  agiSummary?: string;
  capaId?: string;
  createdAt: string;
}

interface FindingsState {
  items: Finding[];
}

import { MOCK_FINDINGS } from "@/mock";

const initialState: FindingsState = { items: MOCK_FINDINGS };

const findingsSlice = createSlice({
  name: "findings",
  initialState,
  reducers: {
    addFinding(state, { payload }: PayloadAction<Finding>) {
      state.items.push(payload);
    },
    updateFinding(state, { payload }: PayloadAction<{ id: string; patch: Partial<Finding> }>) {
      const item = state.items.find((f) => f.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeFinding(state, { payload }: PayloadAction<string>) {
      const item = state.items.find((f) => f.id === payload);
      if (item) item.status = "Closed";
    },
    linkCapa(state, { payload }: PayloadAction<{ findingId: string; capaId: string }>) {
      const item = state.items.find((f) => f.id === payload.findingId);
      if (item) item.capaId = payload.capaId;
    },
  },
});

export const { addFinding, updateFinding, closeFinding, linkCapa } = findingsSlice.actions;
export default findingsSlice.reducer;
