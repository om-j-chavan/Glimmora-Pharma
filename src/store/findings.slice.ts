import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type FindingSeverity = "Critical" | "Major" | "Minor";
export type FindingStatus = "Open" | "In Progress" | "Closed";

export interface EditHistoryEntry {
  editedBy: string;
  editedAt: string;
  changes: { field: string; oldValue: unknown; newValue: unknown }[];
  reason?: string;
}

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
  editHistory?: EditHistoryEntry[];
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
    editFinding(state, { payload }: PayloadAction<{
      id: string;
      patch: Partial<Finding>;
      editedBy: string;
      editedAt: string;
      editReason?: string;
    }>) {
      const item = state.items.find((f) => f.id === payload.id);
      if (!item) return;
      const changes: EditHistoryEntry["changes"] = [];
      const { severity: _s, area: _a, framework: _fw, id: _id, ...safePatch } = payload.patch as Record<string, unknown>;
      for (const [field, newValue] of Object.entries(safePatch)) {
        if (newValue === undefined) continue;
        const oldValue = (item as Record<string, unknown>)[field];
        if (oldValue !== newValue) {
          changes.push({ field, oldValue, newValue });
          (item as Record<string, unknown>)[field] = newValue;
        }
      }
      if (changes.length > 0) {
        if (!item.editHistory) item.editHistory = [];
        item.editHistory.push({
          editedBy: payload.editedBy,
          editedAt: payload.editedAt,
          changes,
          reason: payload.editReason,
        });
      }
    },
  },
});

export const { addFinding, updateFinding, closeFinding, linkCapa, editFinding } = findingsSlice.actions;
export default findingsSlice.reducer;
