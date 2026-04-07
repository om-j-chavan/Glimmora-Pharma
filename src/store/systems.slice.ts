import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type SystemType = "QMS" | "LIMS" | "ERP" | "CDS" | "SCADA" | "MES" | "CMMS" | "Other";
export type GxPRelevance = "Critical" | "Major" | "Minor";
export type ValidationStatus = "Validated" | "In Progress" | "Overdue" | "Not Started";
export type ComplianceStatus = "Compliant" | "Non-Compliant" | "In Progress" | "N/A";
export type GAMP5Category = "1" | "3" | "4" | "5";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

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
  createdAt: string;
}

export interface RoadmapActivity {
  id: string;
  tenantId: string;
  systemId: string;
  title: string;
  type: "IQ" | "OQ" | "PQ" | "PV" | "UAT" | "Risk Assessment" | "Periodic Review";
  status: "Planned" | "In Progress" | "Complete" | "Overdue";
  startDate: string;
  endDate: string;
  owner: string;
}

interface SystemsState {
  items: GxPSystem[];
  roadmap: RoadmapActivity[];
}

const initialState: SystemsState = {
  items: [
    { id: "sys-001", tenantId: "tenant-glimmora", name: "LIMS — LabVantage 8.7", type: "LIMS", vendor: "LabVantage", version: "8.7", gxpRelevance: "Critical", riskLevel: "HIGH", part11Status: "Non-Compliant", annex11Status: "Non-Compliant", gamp5Category: "4", validationStatus: "Overdue", siteId: "site-gl-3", intendedUse: "Lab sample management, test results, OOS handling and batch release decisions", gxpScope: "21 CFR Part 11, EU GMP Annex 11", criticalFunctions: "Audit trail, e-signature, result entry, OOS workflow", riskFactors: "Patient safety: High. DI impact: High. Audit trail gap active — CAPA-0042 in progress.", plannedActions: "Audit trail remediation Q1 2026. E-sig binding fix Q2 2026.", owner: "u-004", lastValidated: "2023-06-15T00:00:00Z", nextReview: "2024-06-15T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    { id: "sys-002", tenantId: "tenant-glimmora", name: "SAP ERP — S/4HANA 2023", type: "ERP", vendor: "SAP", version: "S/4HANA 2023", gxpRelevance: "Major", riskLevel: "MEDIUM", part11Status: "Compliant", annex11Status: "In Progress", gamp5Category: "4", validationStatus: "Validated", siteId: "site-gl-1", intendedUse: "Batch records, inventory management, procurement, financials", gxpScope: "21 CFR Part 11 (partial), EU GMP Annex 11", criticalFunctions: "Batch number assignment, material management, distribution records", riskFactors: "Patient safety: Medium. Product quality: High. Annex 11 gap assessment pending.", plannedActions: "Annex 11 gap assessment Q2 2026.", owner: "u-004", lastValidated: "2025-01-10T00:00:00Z", nextReview: "2026-01-10T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    { id: "sys-003", tenantId: "tenant-glimmora", name: "CDS — Waters Empower 3.6", type: "CDS", vendor: "Waters Empower", version: "3.6.1", gxpRelevance: "Critical", riskLevel: "HIGH", part11Status: "In Progress", annex11Status: "Non-Compliant", gamp5Category: "4", validationStatus: "In Progress", siteId: "site-gl-3", intendedUse: "Chromatographic analysis, raw data capture, analytical result management", gxpScope: "21 CFR Part 11, EU GMP Annex 11", criticalFunctions: "Raw data integrity, e-signature on results, audit trail", riskFactors: "Patient safety: High. DI impact: High. Raw data deletion risk — CAPA-0046.", plannedActions: "E-sig binding fix Q1 2026. Raw data lock enforcement Q2 2026.", owner: "u-005", lastValidated: "2024-03-20T00:00:00Z", nextReview: "2025-03-20T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    { id: "sys-004", tenantId: "tenant-glimmora", name: "QMS — MasterControl 19.2", type: "QMS", vendor: "MasterControl", version: "19.2", gxpRelevance: "Critical", riskLevel: "MEDIUM", part11Status: "Compliant", annex11Status: "Compliant", gamp5Category: "4", validationStatus: "Validated", siteId: "site-gl-1", intendedUse: "CAPA management, deviations, change control, document management", gxpScope: "21 CFR Part 11, EU GMP Annex 11, ICH Q10", criticalFunctions: "CAPA workflow, e-approval, audit trail, document version control", riskFactors: "Patient safety: Medium. Regulatory exposure: High. Periodic review due Q3 2026.", plannedActions: "Periodic review due Q3 2026.", owner: "u-002", lastValidated: "2025-06-01T00:00:00Z", nextReview: "2026-06-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
    { id: "sys-005", tenantId: "tenant-glimmora", name: "MES — Siemens Opcenter 2023", type: "MES", vendor: "Siemens Opcenter", version: "2023.1", gxpRelevance: "Critical", riskLevel: "HIGH", part11Status: "Non-Compliant", annex11Status: "Non-Compliant", gamp5Category: "5", validationStatus: "Not Started", siteId: "site-gl-4", intendedUse: "Production order management, batch execution, line clearance", gxpScope: "21 CFR Part 11, EU GMP Annex 11, GAMP 5 Cat 5", criticalFunctions: "Batch record generation, e-signature, line clearance, yield calculation", riskFactors: "Patient safety: High. Cat 5 custom software — full IQ/OQ/PQ required. Validation not started.", plannedActions: "Validation project kickoff Q2 2026. Full IQ/OQ/PQ by Q4 2026.", owner: "u-002", lastValidated: "", nextReview: "2026-12-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  ],
  roadmap: [
    { id: "act-001", tenantId: "tenant-glimmora", systemId: "sys-001", title: "LIMS audit trail remediation", type: "PV", status: "In Progress", startDate: "2026-03-01T00:00:00Z", endDate: "2026-03-31T00:00:00Z", owner: "u-004" },
    { id: "act-002", tenantId: "tenant-glimmora", systemId: "sys-001", title: "LIMS e-signature binding fix", type: "PV", status: "Planned", startDate: "2026-04-01T00:00:00Z", endDate: "2026-04-30T00:00:00Z", owner: "u-004" },
    { id: "act-003", tenantId: "tenant-glimmora", systemId: "sys-003", title: "CDS e-sig validation OQ", type: "OQ", status: "In Progress", startDate: "2026-03-15T00:00:00Z", endDate: "2026-04-15T00:00:00Z", owner: "u-005" },
    { id: "act-004", tenantId: "tenant-glimmora", systemId: "sys-005", title: "MES IQ protocol execution", type: "IQ", status: "Planned", startDate: "2026-06-15T00:00:00Z", endDate: "2026-07-15T00:00:00Z", owner: "u-002" },
    { id: "act-005", tenantId: "tenant-glimmora", systemId: "sys-002", title: "SAP Annex 11 gap assessment", type: "Risk Assessment", status: "Planned", startDate: "2026-06-01T00:00:00Z", endDate: "2026-06-30T00:00:00Z", owner: "u-004" },
  ],
};

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
