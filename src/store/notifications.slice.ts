import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type NotificationType =
  | "finding_critical" | "finding_overdue" | "finding_assigned"
  | "capa_overdue" | "capa_pending_review" | "capa_assigned" | "capa_closed" | "capa_di_gate"
  | "validation_overdue" | "system_non_compliant" | "system_added"
  | "fda483_deadline" | "fda483_deadline_critical" | "commitment_overdue" | "observation_added"
  | "evidence_missing" | "pack_exported"
  | "raid_critical" | "raid_overdue" | "kpi_below_threshold"
  | "drift_critical" | "drift_new"
  | "plan_limit_near" | "plan_limit_reached"
  | "user_added" | "site_added";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  linkState?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationsState {
  items: AppNotification[];
}

const MAX_ITEMS = 50;

const notificationsSlice = createSlice({
  name: "notifications",
  initialState: { items: [] } as NotificationsState,
  reducers: {
    addNotification(state, { payload }: PayloadAction<AppNotification>) {
      if (state.items.some((n) => n.id === payload.id)) return;
      state.items.unshift(payload);
      if (state.items.length > MAX_ITEMS) state.items = state.items.slice(0, MAX_ITEMS);
    },
    markRead(state, { payload }: PayloadAction<string>) {
      const n = state.items.find((i) => i.id === payload);
      if (n) n.read = true;
    },
    markAllRead(state) {
      state.items.forEach((n) => { n.read = true; });
    },
    removeNotification(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((n) => n.id !== payload);
    },
    clearAll(state) {
      state.items = [];
    },
  },
});

export const { addNotification, markRead, markAllRead, removeNotification, clearAll } = notificationsSlice.actions;
export default notificationsSlice.reducer;
