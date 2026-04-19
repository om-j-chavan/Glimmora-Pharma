import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { MOCK_RTM_ENTRIES } from "@/mock";

export type RTMPriority = "critical" | "high" | "medium";
export type LinkStatus = "linked" | "missing" | "na" | "skipped";
export type TestResult = "pass" | "fail" | "pending" | "na";
export type EvidenceStatus = "complete" | "partial" | "missing";
export type TraceabilityStatus = "complete" | "partial" | "broken";

export interface RTMEntry {
  id: string;
  tenantId: string;
  systemId: string;
  systemName: string;
  ursId: string;
  ursRequirement: string;
  ursRegulation: string;
  ursPriority: RTMPriority;
  fsReference?: string;
  fsDescription?: string;
  fsStatus: LinkStatus;
  dsReference?: string;
  dsDescription?: string;
  dsStatus: LinkStatus;
  iqTestId?: string;
  iqTestDescription?: string;
  iqResult?: TestResult;
  iqDocument?: string;
  oqTestId?: string;
  oqTestDescription?: string;
  oqResult?: TestResult;
  oqDocument?: string;
  pqTestId?: string;
  pqTestDescription?: string;
  pqResult?: TestResult;
  pqDocument?: string;
  evidenceDocId?: string;
  evidenceStatus: EvidenceStatus;
  traceabilityStatus: TraceabilityStatus;
  linkedFindingId?: string;
  linkedCAPAId?: string;
}

interface RTMState {
  items: RTMEntry[];
}

const initialState: RTMState = { items: MOCK_RTM_ENTRIES };

const rtmSlice = createSlice({
  name: "rtm",
  initialState,
  reducers: {
    addRTMEntry(state, { payload }: PayloadAction<RTMEntry>) {
      state.items.push(payload);
    },
    updateRTMEntry(state, { payload }: PayloadAction<{ id: string; patch: Partial<RTMEntry> }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    removeRTMEntry(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((r) => r.id !== payload);
    },
  },
});

export const { addRTMEntry, updateRTMEntry, removeRTMEntry } = rtmSlice.actions;
export default rtmSlice.reducer;
