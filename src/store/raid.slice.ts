import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type RAIDType = "Risk" | "Action" | "Issue" | "Decision";
export type RAIDStatus = "Open" | "In Progress" | "Closed" | "Escalated";
export type RAIDPriority = "Critical" | "High" | "Medium" | "Low";

export interface RAIDItem {
  id: string;
  tenantId: string;
  siteId: string;
  type: RAIDType;
  title: string;
  description: string;
  priority: RAIDPriority;
  status: RAIDStatus;
  owner: string;
  dueDate: string;
  impact?: string;
  mitigation?: string;
  resolution?: string;
  raisedBy: string;
  createdAt: string;
  closedAt?: string;
}

interface RAIDState {
  items: RAIDItem[];
}

import { MOCK_RAID_ITEMS } from "@/mock";

const initialState: RAIDState = { items: MOCK_RAID_ITEMS };

const raidSlice = createSlice({
  name: "raid",
  initialState,
  reducers: {
    addItem(state, { payload }: PayloadAction<RAIDItem>) {
      state.items.push(payload);
    },
    updateItem(state, { payload }: PayloadAction<{ id: string; patch: Partial<RAIDItem> }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeItem(state, { payload }: PayloadAction<{ id: string; resolution: string }>) {
      const item = state.items.find((r) => r.id === payload.id);
      if (item) {
        item.status = "Closed";
        item.resolution = payload.resolution;
        item.closedAt = "";
      }
    },
    removeItem(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((r) => r.id !== payload);
    },
  },
});

export const { addItem, updateItem, closeItem, removeItem } = raidSlice.actions;
export default raidSlice.reducer;
