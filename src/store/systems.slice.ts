import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SystemType = "QMS" | "LIMS" | "ERP" | "CDS" | "SCADA" | "MES" | "CMMS" | "Other";
export type GxPRelevance = "Critical" | "Major" | "Minor";
export type ValidationStatus = "Validated" | "In Progress" | "Overdue" | "Not Started";
export type ComplianceStatus = "Compliant" | "Non-Compliant" | "In Progress" | "N/A";
export type GAMP5Category = "1" | "3" | "4" | "5";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValidationStageKey = "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR";
export type ValidationStageStatus = "complete" | "in-progress" | "skipped" | "pending";

export interface ValidationStage {
  key: ValidationStageKey;
  status: ValidationStageStatus;
  date?: string;
  targetDate?: string;
  documentName?: string;
}

export const VALIDATION_STAGE_LABELS: Record<ValidationStageKey, string> = {
  URS: "User Requirement Spec",
  FS: "Functional Specification",
  DS: "Design Specification",
  IQ: "Installation Qualification",
  OQ: "Operational Qualification",
  PQ: "Performance Qualification",
  RTR: "Release to Production",
};

export const VALIDATION_STAGE_KEYS: ValidationStageKey[] = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"];

export interface GxPSystem {
  id: string;
  tenantId: string;
  name: string;
  type: SystemType;
  vendor: string;
  version: string;
  gxpRelevance: GxPRelevance;
  part11Status: ComplianceStatus;
  annex11Status: ComplianceStatus;
  gamp5Category: GAMP5Category;
  validationStatus: ValidationStatus;
  riskLevel: RiskLevel;
  siteId: string;
  intendedUse: string;
  gxpScope: string;
  criticalFunctions: string;
  riskFactors: string;
  plannedActions: string;
  owner: string;
  lastValidated?: string;
  nextReview?: string;
  validationStages?: ValidationStage[];
  patientSafetyRisk?: RiskLevel;
  productQualityImpact?: RiskLevel;
  regulatoryExposure?: RiskLevel;
  diImpact?: RiskLevel;
  remediationCapaId?: string;
  remediationTargetDate?: string;
  remediationNotes?: string;
  createdAt: string;
}

export interface RoadmapActivity {
  id: string;
  tenantId: string;
  systemId: string;
  title: string;
  type: "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR" | "Risk Assessment" | "Periodic Review";
  status: "Planned" | "In Progress" | "Complete" | "Overdue";
  startDate: string;
  endDate: string;
  owner: string;
}

interface SystemsState {
  items: GxPSystem[];
  roadmap: RoadmapActivity[];
}

import { MOCK_SYSTEMS, MOCK_ROADMAP } from "@/mock";

const initialState: SystemsState = { items: MOCK_SYSTEMS, roadmap: MOCK_ROADMAP };

const systemsSlice = createSlice({
  name: "systems",
  initialState,
  reducers: {
    addSystem(state, { payload }: PayloadAction<GxPSystem>) {
      state.items.push(payload);
    },
    updateSystem(state, { payload }: PayloadAction<{ id: string; patch: Partial<GxPSystem> }>) {
      const item = state.items.find((s) => s.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    removeSystem(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter((s) => s.id !== payload);
    },
    addActivity(state, { payload }: PayloadAction<RoadmapActivity>) {
      state.roadmap.push(payload);
    },
    updateActivity(state, { payload }: PayloadAction<{ id: string; patch: Partial<RoadmapActivity> }>) {
      const item = state.roadmap.find((a) => a.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
  },
});

export const { addSystem, updateSystem, removeSystem, addActivity, updateActivity } = systemsSlice.actions;
export default systemsSlice.reducer;
