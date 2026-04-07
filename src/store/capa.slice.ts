import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type CAPARisk = "Critical" | "Major" | "Minor";
export type CAPAStatus = "Open" | "In Progress" | "Pending QA Review" | "Closed";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Other";
export type CAPASource = "483" | "Internal Audit" | "Deviation" | "Complaint" | "OOS" | "Change Control" | "Gap Assessment";

export interface CAPA {
  id: string;
  tenantId: string;
  findingId?: string;
  source: CAPASource;
  risk: CAPARisk;
  owner: string;
  dueDate: string;
  status: CAPAStatus;
  description: string;
  rca?: string;
  rcaMethod?: RCAMethod;
  correctiveActions?: string;
  effectivenessCheck: boolean;
  effectivenessDate?: string;
  evidenceLinks: string[];
  diGate: boolean;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
}

interface CAPAState {
  items: CAPA[];
}

const initialState: CAPAState = {
  items: [
    { id: "CAPA-0042", tenantId: "tenant-glimmora", findingId: "FIND-001", source: "Gap Assessment", risk: "Critical", owner: "u-005", dueDate: "2026-03-20T00:00:00Z", status: "In Progress", description: "LIMS audit trail configuration gaps — 3 of 12 modules missing entries.", rca: "System upgrade Nov 2025 reset audit trail config. IT team not notified of quality impact.", rcaMethod: "5 Why", correctiveActions: "Audit trail re-enabled for all 12 modules. Configuration locked via change control.", effectivenessCheck: true, diGate: true, evidenceLinks: ["LIMS-CONFIG-2026-03"], createdAt: "2026-02-10T09:30:00Z" },
    { id: "CAPA-0043", tenantId: "tenant-glimmora", findingId: "FIND-002", source: "Gap Assessment", risk: "Critical", owner: "u-005", dueDate: "2026-03-25T00:00:00Z", status: "Open", description: "Electronic signature not cryptographically bound to CDS records.", rca: "", correctiveActions: "", effectivenessCheck: true, diGate: true, evidenceLinks: [], createdAt: "2026-02-12T11:00:00Z" },
    { id: "CAPA-0044", tenantId: "tenant-glimmora", findingId: "FIND-003", source: "Internal Audit", risk: "Major", owner: "u-002", dueDate: "2026-04-05T00:00:00Z", status: "Pending QA Review", description: "HPLC system IQ/OQ overdue — equipment qualification records incomplete.", rca: "Annual requalification scheduling failed to flag HPLC. No automated reminder in CMMS.", rcaMethod: "Fishbone", correctiveActions: "IQ/OQ completed March 2026. CMMS updated with automated reminders.", effectivenessCheck: true, diGate: false, evidenceLinks: ["IQ-HPLC-2026-03", "OQ-HPLC-2026-03"], createdAt: "2026-02-14T09:00:00Z" },
    { id: "CAPA-0045", tenantId: "tenant-glimmora", findingId: "FIND-004", source: "Gap Assessment", risk: "Major", owner: "u-002", dueDate: "2026-04-10T00:00:00Z", status: "In Progress", description: "ICH Q9 risk assessments missing patient safety weighting for 4 critical processes.", rca: "", rcaMethod: "5 Why", correctiveActions: "", effectivenessCheck: true, diGate: false, evidenceLinks: [], createdAt: "2026-02-15T12:00:00Z" },
    { id: "CAPA-0046", tenantId: "tenant-glimmora", findingId: "FIND-005", source: "Deviation", risk: "Critical", owner: "u-005", dueDate: "2026-04-15T00:00:00Z", status: "Open", description: "Raw data deletion possible in 2 analytical instruments — ALCOA+ violation.", rca: "", correctiveActions: "", effectivenessCheck: true, diGate: true, evidenceLinks: [], createdAt: "2026-02-16T10:00:00Z" },
    { id: "CAPA-0038", tenantId: "tenant-glimmora", findingId: "FIND-006", source: "Internal Audit", risk: "Minor", owner: "u-007", dueDate: "2026-02-28T00:00:00Z", status: "Closed", description: "Distribution records format non-compliant with 21 CFR 211.150.", rca: "SOP last revised 2021 — did not reflect current requirements.", rcaMethod: "5 Why", correctiveActions: "SOP-DIST-008 revised and re-approved. Training completed for 8 staff.", effectivenessCheck: true, effectivenessDate: "2026-05-28T00:00:00Z", evidenceLinks: ["SOP-DIST-008-v3", "TRAINING-RECORD-0038"], diGate: false, closedBy: "u-002", closedAt: "2026-02-26T14:00:00Z", createdAt: "2026-01-15T08:00:00Z" },
  ],
};

const capaSlice = createSlice({
  name: "capa",
  initialState,
  reducers: {
    addCAPA(state, { payload }: PayloadAction<CAPA>) {
      state.items.push(payload);
    },
    updateCAPA(state, { payload }: PayloadAction<{ id: string; patch: Partial<CAPA> }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeCAPA(state, { payload }: PayloadAction<{ id: string; closedBy: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) {
        item.status = "Closed";
        item.closedBy = payload.closedBy;
      }
    },
    addEvidence(state, { payload }: PayloadAction<{ id: string; link: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) item.evidenceLinks.push(payload.link);
    },
  },
});

export const { addCAPA, updateCAPA, closeCAPA, addEvidence } = capaSlice.actions;
export default capaSlice.reducer;
