import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LinkedDocument } from "@/components/shared/DocumentUpload";

export type DeviationType = "planned" | "unplanned";
export type DeviationCategory = "process" | "equipment" | "material" | "environmental" | "personnel" | "documentation" | "system" | "other";
export type DeviationSeverity = "critical" | "major" | "minor";
export type DeviationStatus = "draft" | "open" | "under_investigation" | "pending_qa_review" | "closed" | "rejected";
export type ImpactLevel = "high" | "medium" | "low" | "none";
export type DeviationRCAMethod = "5Why" | "Fishbone" | "FaultTree";

export interface Deviation {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  type: DeviationType;
  category: DeviationCategory;
  severity: DeviationSeverity;
  siteId: string;
  area: string;
  detectedBy: string;
  detectedDate: string;
  reportedBy: string;
  reportedDate: string;
  owner: string;
  dueDate: string;
  status: DeviationStatus;
  immediateAction: string;
  rootCause?: string;
  rcaMethod?: DeviationRCAMethod;
  patientSafetyImpact: ImpactLevel;
  productQualityImpact: ImpactLevel;
  regulatoryImpact: ImpactLevel;
  batchesAffected?: string[];
  linkedCAPAId?: string;
  linkedFindingId?: string;
  documents?: LinkedDocument[];
  closedBy?: string;
  closedDate?: string;
  closureNotes?: string;
  rejectedBy?: string;
  rejectedDate?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeviationState {
  items: Deviation[];
}

const initialState: DeviationState = { items: [] };

const deviationSlice = createSlice({
  name: "deviation",
  initialState,
  reducers: {
    setDeviations(state, { payload }: PayloadAction<Deviation[]>) {
      state.items = payload;
    },
    addDeviation(state, { payload }: PayloadAction<Deviation>) {
      state.items.push(payload);
    },
    updateDeviation(state, { payload }: PayloadAction<{ id: string; patch: Partial<Deviation> }>) {
      const item = state.items.find((d) => d.id === payload.id);
      if (item) Object.assign(item, payload.patch, { updatedAt: new Date().toISOString() });
    },
    closeDeviation(state, { payload }: PayloadAction<{ id: string; closedBy: string; notes?: string }>) {
      const item = state.items.find((d) => d.id === payload.id);
      if (item) {
        item.status = "closed";
        item.closedBy = payload.closedBy;
        item.closedDate = new Date().toISOString();
        item.closureNotes = payload.notes;
        item.updatedAt = new Date().toISOString();
      }
    },
    rejectDeviation(state, { payload }: PayloadAction<{ id: string; rejectedBy: string; reason: string }>) {
      const item = state.items.find((d) => d.id === payload.id);
      if (item) {
        item.status = "rejected";
        item.rejectedBy = payload.rejectedBy;
        item.rejectedDate = new Date().toISOString();
        item.rejectionReason = payload.reason;
        item.updatedAt = new Date().toISOString();
      }
    },
    linkCAPAToDeviation(state, { payload }: PayloadAction<{ deviationId: string; capaId: string }>) {
      const item = state.items.find((d) => d.id === payload.deviationId);
      if (item) { item.linkedCAPAId = payload.capaId; item.updatedAt = new Date().toISOString(); }
    },
    addDeviationDocument(state, { payload }: PayloadAction<{ deviationId: string; doc: LinkedDocument }>) {
      const item = state.items.find((d) => d.id === payload.deviationId);
      if (item) { if (!item.documents) item.documents = []; item.documents.push(payload.doc); }
    },
    removeDeviationDocument(state, { payload }: PayloadAction<{ deviationId: string; docId: string }>) {
      const item = state.items.find((d) => d.id === payload.deviationId);
      if (item && item.documents) item.documents = item.documents.filter((d) => d.id !== payload.docId);
    },
  },
});

export const {
  setDeviations, addDeviation, updateDeviation, closeDeviation, rejectDeviation,
  linkCAPAToDeviation, addDeviationDocument, removeDeviationDocument,
} = deviationSlice.actions;
export default deviationSlice.reducer;
