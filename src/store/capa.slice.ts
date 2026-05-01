import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LinkedDocument } from "@/components/shared/DocumentUpload";

export type CAPARisk = "Critical" | "High" | "Low";
export type CAPAStatus = "Open" | "In Progress" | "Pending QA Review" | "Closed";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Other";
export type CAPASource = "483" | "Internal Audit" | "Deviation" | "Complaint" | "OOS" | "Change Control" | "Gap Assessment";

export interface CAPA {
  id: string;
  tenantId: string;
  siteId: string;
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
  linkedSystemId?: string;
  linkedSystemName?: string;
  diGateStatus?: "open" | "cleared";
  diGateNotes?: string;
  diGateReviewedBy?: string;
  diGateReviewDate?: string;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  documents?: LinkedDocument[];
}

interface CAPAState {
  items: CAPA[];
}

const initialState: CAPAState = { items: [] };

const capaSlice = createSlice({
  name: "capa",
  initialState,
  reducers: {
    setCAPAs(state, { payload }: PayloadAction<CAPA[]>) {
      state.items = payload;
    },
    addCAPA(state, { payload }: PayloadAction<CAPA>) {
      state.items.push(payload);
    },
    updateCAPA(state, { payload }: PayloadAction<{ id: string; patch: Partial<CAPA> }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeCAPA(state, { payload }: PayloadAction<{ id: string; closedBy: string; closedAt: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) {
        item.status = "Closed";
        item.closedBy = payload.closedBy;
        item.closedAt = payload.closedAt;
      }
    },
    addEvidence(state, { payload }: PayloadAction<{ id: string; link: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) item.evidenceLinks.push(payload.link);
    },
    addCAPADocument(state, { payload }: PayloadAction<{ capaId: string; doc: LinkedDocument }>) {
      const item = state.items.find((c) => c.id === payload.capaId);
      if (item) {
        if (!item.documents) item.documents = [];
        item.documents.push(payload.doc);
      }
    },
    removeCAPADocument(state, { payload }: PayloadAction<{ capaId: string; docId: string }>) {
      const item = state.items.find((c) => c.id === payload.capaId);
      if (item && item.documents) item.documents = item.documents.filter((d) => d.id !== payload.docId);
    },
    approveCAPADocument(state, { payload }: PayloadAction<{ capaId: string; docId: string; approvedBy: string }>) {
      const item = state.items.find((c) => c.id === payload.capaId);
      const doc = item?.documents?.find((d) => d.id === payload.docId);
      if (doc) { doc.status = "approved"; doc.approvedBy = payload.approvedBy; doc.approvedAt = new Date().toISOString(); }
    },
  },
});

export const { setCAPAs, addCAPA, updateCAPA, closeCAPA, addEvidence, addCAPADocument, removeCAPADocument, approveCAPADocument } = capaSlice.actions;
export default capaSlice.reducer;
