import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type DriftSeverity = "Critical" | "Major" | "Minor";
export type DriftStatus = "Open" | "Investigating" | "Resolved";
export type DriftType = "Configuration Change" | "Access Creep" | "Audit Trail Anomaly" | "Validation Drift" | "Model Performance" | "Data Quality";

export interface DriftAlert {
  id: string;
  tenantId: string;
  type: DriftType;
  severity: DriftSeverity;
  description: string;
  agent: string;
  detectedAt: string;
  owner: string;
  action?: string;
  status: DriftStatus;
  resolvedAt?: string;
}

export interface DriftMetric {
  month: string;
  accuracy: number;
  confidence: number;
  falsePos: number;
  alerts: number;
}

interface AGIDriftState {
  alerts: DriftAlert[];
  metrics: DriftMetric[];
}

const initialState: AGIDriftState = {
  alerts: [],
  metrics: [
    { month: "Oct", accuracy: 94, confidence: 88, falsePos: 3, alerts: 1 },
    { month: "Nov", accuracy: 93, confidence: 87, falsePos: 4, alerts: 2 },
    { month: "Dec", accuracy: 95, confidence: 90, falsePos: 2, alerts: 1 },
    { month: "Jan", accuracy: 92, confidence: 86, falsePos: 5, alerts: 3 },
    { month: "Feb", accuracy: 91, confidence: 85, falsePos: 6, alerts: 4 },
    { month: "Mar", accuracy: 94, confidence: 89, falsePos: 3, alerts: 2 },
  ],
};

const agiDriftSlice = createSlice({
  name: "agiDrift",
  initialState,
  reducers: {
    addAlert(state, { payload }: PayloadAction<DriftAlert>) {
      state.alerts.push(payload);
    },
    updateAlert(state, { payload }: PayloadAction<{ id: string; patch: Partial<DriftAlert> }>) {
      const item = state.alerts.find((a) => a.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    resolveAlert(state, { payload }: PayloadAction<{ id: string; action: string }>) {
      const item = state.alerts.find((a) => a.id === payload.id);
      if (item) {
        item.status = "Resolved";
        item.action = payload.action;
        item.resolvedAt = "";
      }
    },
  },
});

export const { addAlert, updateAlert, resolveAlert } = agiDriftSlice.actions;
export default agiDriftSlice.reducer;
