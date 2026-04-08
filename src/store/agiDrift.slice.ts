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

import { MOCK_DRIFT_ALERTS, MOCK_DRIFT_METRICS } from "@/mock";

const initialState: AGIDriftState = { alerts: MOCK_DRIFT_ALERTS, metrics: MOCK_DRIFT_METRICS };

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
