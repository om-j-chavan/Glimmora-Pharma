/**
 * AGI module types — extracted from the deprecated `agiDrift.slice.ts`
 * so components can import without coupling to the slice file.
 *
 * No Prisma model exists for `DriftAlert` yet — alerts are derived from
 * the AuditLog table (filtered by AGI-related actions) at the page level.
 * Resolution workflow (the slice's `resolveAlert` reducer) has no
 * persistent backing; the UI's resolve UX was stripped when the slice
 * was deleted, so these types are read-only descriptions of activity.
 */

export type DriftSeverity = "Critical" | "Major" | "Minor";
export type DriftStatus = "Open" | "Investigating" | "Resolved";
export type DriftType =
  | "Configuration Change"
  | "Access Creep"
  | "Audit Trail Anomaly"
  | "Validation Drift"
  | "Model Performance"
  | "Data Quality";

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
