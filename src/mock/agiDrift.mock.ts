import type { DriftAlert, DriftMetric } from "@/store/agiDrift.slice";

export const MOCK_DRIFT_ALERTS: DriftAlert[] = [];

export const MOCK_DRIFT_METRICS: DriftMetric[] = [
  { month: "Oct", accuracy: 94, confidence: 88, falsePos: 3, alerts: 1 },
  { month: "Nov", accuracy: 93, confidence: 87, falsePos: 4, alerts: 2 },
  { month: "Dec", accuracy: 95, confidence: 90, falsePos: 2, alerts: 1 },
  { month: "Jan", accuracy: 92, confidence: 86, falsePos: 5, alerts: 3 },
  { month: "Feb", accuracy: 91, confidence: 85, falsePos: 6, alerts: 4 },
  { month: "Mar", accuracy: 94, confidence: 89, falsePos: 3, alerts: 2 },
];
