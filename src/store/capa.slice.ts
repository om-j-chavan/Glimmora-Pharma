import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type CAPARisk = "Critical" | "Major" | "Minor";
export type CAPAStatus = "Open" | "In Progress" | "Pending QA Review" | "Closed";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Other";
export type CAPASource = "483" | "Internal Audit" | "Deviation" | "Complaint" | "OOS" | "Change Control" | "Gap Assessment";

export interface CAPA {
  id: string;
  tenantId: string;
  siteId: string;
  findingId?: string;
  source: CAPASource;
  risk: CAPARisk;
  owner: string;
  dueDate: string;
  status: CAPAStatus;
  description: string;
  rca?: string;
  rcaMethod?: RCAMethod;
  correctiveActions?: string;
  effectivenessCheck: boolean;
  effectivenessDate?: string;
  evidenceLinks: string[];
  diGate: boolean;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
}

interface CAPAState {
  items: CAPA[];
}

import { MOCK_CAPAS } from "@/mock";

const initialState: CAPAState = { items: MOCK_CAPAS };

const capaSlice = createSlice({
  name: "capa",
  initialState,
  reducers: {
    addCAPA(state, { payload }: PayloadAction<CAPA>) {
      state.items.push(payload);
    },
    updateCAPA(state, { payload }: PayloadAction<{ id: string; patch: Partial<CAPA> }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeCAPA(state, { payload }: PayloadAction<{ id: string; closedBy: string; closedAt: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) {
        item.status = "Closed";
        item.closedBy = payload.closedBy;
        item.closedAt = payload.closedAt;
      }
    },
    addEvidence(state, { payload }: PayloadAction<{ id: string; link: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) item.evidenceLinks.push(payload.link);
    },
  },
});

export const { addCAPA, updateCAPA, closeCAPA, addEvidence } = capaSlice.actions;
export default capaSlice.reducer;
