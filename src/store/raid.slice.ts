import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type RAIDType = "Risk" | "Action" | "Issue" | "Decision";
export type RAIDStatus = "Open" | "In Progress" | "Closed" | "Escalated";
export type RAIDPriority = "Critical" | "High" | "Medium" | "Low";

export interface RAIDItem {
  id: string;
  tenantId: string;
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

const initialState: RAIDState = {
  items: [
    { id: "raid-001", tenantId: "tenant-glimmora", type: "Risk", title: "LIMS validation overdue — FDA inspection risk", description: "LIMS audit trail non-compliant. Active FDA 483 observation. If not remediated before next inspection, Warning Letter risk.", priority: "Critical", status: "In Progress", owner: "u-002", dueDate: "2026-03-31T00:00:00Z", impact: "Warning Letter, import alert, consent decree", mitigation: "CAPA-0042 in progress. Audit trail remediation 80% complete.", raisedBy: "u-002", createdAt: "2026-02-10T09:00:00Z" },
    { id: "raid-002", tenantId: "tenant-glimmora", type: "Action", title: "Complete Part 11 remediation before Q2 inspection window", description: "FDA typically inspects this facility Q2. All Part 11 findings must be closed before April 2026.", priority: "High", status: "In Progress", owner: "u-004", dueDate: "2026-04-01T00:00:00Z", raisedBy: "u-002", createdAt: "2026-02-12T10:00:00Z" },
    { id: "raid-003", tenantId: "tenant-glimmora", type: "Issue", title: "MES validation not started — production risk", description: "Siemens Opcenter MES validation project not yet kicked off. GMP production on unvalidated system.", priority: "High", status: "Open", owner: "u-004", dueDate: "2026-06-30T00:00:00Z", impact: "Batch release delays, regulatory non-compliance", raisedBy: "u-004", createdAt: "2026-02-20T11:00:00Z" },
    { id: "raid-004", tenantId: "tenant-glimmora", type: "Decision", title: "Extend LIMS e-sig deadline to April 2026", description: "QA Head approved extending CAPA-0043 deadline from March to April 2026 due to vendor dependency.", priority: "Medium", status: "Closed", owner: "u-002", dueDate: "2026-03-01T00:00:00Z", resolution: "Deadline extended to 2026-04-15. Vendor Waters confirmed support window.", raisedBy: "u-002", createdAt: "2026-02-25T09:00:00Z", closedAt: "2026-02-26T10:00:00Z" },
  ],
};

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
  },
});

export const { addItem, updateItem, closeItem } = raidSlice.actions;
export default raidSlice.reducer;
