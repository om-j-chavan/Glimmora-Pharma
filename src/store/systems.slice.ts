import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SystemType = "QMS" | "LIMS" | "ERP" | "CDS" | "SCADA" | "MES" | "CMMS" | "Other";
export type GxPRelevance = "Critical" | "Major" | "Minor";
export type ValidationStatus = "Validated" | "In Progress" | "Overdue" | "Not Started";
export type ComplianceStatus = "Compliant" | "Non-Compliant" | "In Progress" | "N/A";
export type GAMP5Category = "1" | "3" | "4" | "5";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type ValidationStageKey = "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR";
export type ValidationStageStatus = "not_started" | "draft" | "in_review" | "approved" | "rejected" | "skipped" | "complete" | "in-progress" | "pending";

export interface StageDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  version: string;
  status: "draft" | "in_review" | "approved";
  uploadedBy: string;
  uploadedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ValidationStage {
  key: ValidationStageKey;
  status: ValidationStageStatus;
  date?: string;
  targetDate?: string;
  documentName?: string;
  documents?: StageDocument[];
  notes?: string;
  submittedBy?: string;
  submittedDate?: string;
  reviewedBy?: string;
  reviewedDate?: string;
  approvedBy?: string;
  approvedDate?: string;
  rejectedBy?: string;
  rejectedDate?: string;
  rejectionReason?: string;
  completionDate?: string;
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

export type CompletionType = "execution" | "approval";

export interface RoadmapActivity {
  id: string;
  tenantId: string;
  systemId: string;
  title: string;
  type: "URS" | "FS" | "DS" | "IQ" | "OQ" | "PQ" | "RTR" | "Risk Assessment" | "Periodic Review";
  status: "Planned" | "In Progress" | "Complete" | "Overdue";
  startDate: string;
  endDate: string;
  completionType?: CompletionType;
  completionCriteria?: string;
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
    submitStageForReview(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; submittedBy: string }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      if (!sys) return;
      if (!sys.validationStages) sys.validationStages = [];
      const stage = sys.validationStages.find((s) => s.key === payload.stageKey);
      if (stage) { stage.status = "in_review"; stage.submittedBy = payload.submittedBy; stage.submittedDate = new Date().toISOString(); }
      else sys.validationStages.push({ key: payload.stageKey, status: "in_review", submittedBy: payload.submittedBy, submittedDate: new Date().toISOString() });
    },
    approveStage(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; approvedBy: string }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      const stage = sys?.validationStages?.find((s) => s.key === payload.stageKey);
      if (stage) {
        stage.status = "approved";
        stage.approvedBy = payload.approvedBy;
        stage.approvedDate = new Date().toISOString();
        stage.completionDate = new Date().toISOString();
        stage.rejectedBy = undefined;
        stage.rejectedDate = undefined;
        stage.rejectionReason = undefined;
      }
    },
    rejectStage(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; rejectedBy: string; reason: string }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      const stage = sys?.validationStages?.find((s) => s.key === payload.stageKey);
      if (stage) {
        stage.status = "rejected";
        stage.rejectedBy = payload.rejectedBy;
        stage.rejectedDate = new Date().toISOString();
        stage.rejectionReason = payload.reason;
        stage.approvedBy = undefined;
        stage.approvedDate = undefined;
      }
    },
    skipStage(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; approvedBy: string; reason: string }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      if (!sys) return;
      if (!sys.validationStages) sys.validationStages = [];
      const stage = sys.validationStages.find((s) => s.key === payload.stageKey);
      if (stage) { stage.status = "skipped"; stage.approvedBy = payload.approvedBy; stage.approvedDate = new Date().toISOString(); stage.rejectionReason = payload.reason; }
      else sys.validationStages.push({ key: payload.stageKey, status: "skipped", approvedBy: payload.approvedBy, approvedDate: new Date().toISOString(), rejectionReason: payload.reason });
    },
    addStageDocument(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; doc: StageDocument }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      if (!sys) return;
      if (!sys.validationStages) sys.validationStages = [];
      let stage = sys.validationStages.find((s) => s.key === payload.stageKey);
      if (!stage) { stage = { key: payload.stageKey, status: "draft" }; sys.validationStages.push(stage); }
      if (!stage.documents) stage.documents = [];
      stage.documents.push(payload.doc);
      if (stage.status === "not_started" || stage.status === "pending") stage.status = "draft";
    },
    updateStageNotes(state, { payload }: PayloadAction<{ systemId: string; stageKey: ValidationStageKey; notes: string }>) {
      const sys = state.items.find((s) => s.id === payload.systemId);
      const stage = sys?.validationStages?.find((s) => s.key === payload.stageKey);
      if (stage) stage.notes = payload.notes;
    },
  },
});

export const {
  addSystem, updateSystem, removeSystem, addActivity, updateActivity,
  submitStageForReview, approveStage, rejectStage, skipStage,
  addStageDocument, updateStageNotes,
} = systemsSlice.actions;
export default systemsSlice.reducer;
