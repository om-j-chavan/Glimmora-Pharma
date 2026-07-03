import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type DocType = "SOP" | "Record" | "Audit Trail" | "Validation" | "Report" | "Protocol" | "Certificate" | "Policy" | "Other";
export type DocStatus = "Current" | "Draft" | "Superseded" | "Missing" | "Under Review";
export type DocArea = "Manufacturing" | "QC Lab" | "Warehouse" | "Utilities" | "QMS" | "CSV/IT" | "Regulatory" | "Training" | "HR";

export interface EvidenceDocument {
  id: string;
  tenantId: string;
  siteId: string;
  title: string;
  reference: string;
  type: DocType;
  area: DocArea;
  systemId?: string;
  findingId?: string;
  capaId?: string;
  eventId?: string;
  version: string;
  status: DocStatus;
  author: string;
  reviewedBy?: string;
  effectiveDate: string;
  expiryDate?: string;
  // GxP periodic-review date (e.g. biennial SOP review). Drives the
  // "Review due / Overdue" lifecycle. ISO string; only native documents carry it.
  nextReviewDate?: string;
  tags: string[];
  url?: string;
  sizeKb?: number;
  complianceTags: string[];
  createdAt: string;
  // True only for standalone `Document` rows (the approve / reject / delete
  // lifecycle applies). Evidence aggregated from CAPA / Deviation / FDA-483 /
  // findings is a read-only mirror here — managed in its source module.
  isNative?: boolean;
  // Raw Prisma `Document.status` (draft | under_review | approved | rejected)
  // for native docs, so the detail drawer can gate lifecycle actions precisely
  // rather than inferring from the display-only DocStatus.
  rawStatus?: string;
}

export interface EvidencePack {
  id: string;
  tenantId: string;
  name: string;
  purpose: string;
  documentIds: string[];
  createdBy: string;
  createdAt: string;
  exportedAt?: string;
}

interface EvidenceState {
  documents: EvidenceDocument[];
  packs: EvidencePack[];
}

const initialState: EvidenceState = { documents: [], packs: [] };

const evidenceSlice = createSlice({
  name: "evidence",
  initialState,
  reducers: {
    addDocument(state, { payload }: PayloadAction<EvidenceDocument>) {
      state.documents.push(payload);
    },
    updateDocument(state, { payload }: PayloadAction<{ id: string; patch: Partial<EvidenceDocument> }>) {
      const item = state.documents.find((d) => d.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    removeDocument(state, { payload }: PayloadAction<string>) {
      state.documents = state.documents.filter((d) => d.id !== payload);
    },
    addPack(state, { payload }: PayloadAction<EvidencePack>) {
      state.packs.push(payload);
    },
    updatePack(state, { payload }: PayloadAction<{ id: string; patch: Partial<EvidencePack> }>) {
      const item = state.packs.find((p) => p.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    removePack(state, { payload }: PayloadAction<string>) {
      state.packs = state.packs.filter((p) => p.id !== payload);
    },
  },
});

export const { addDocument, updateDocument, removeDocument, addPack, updatePack, removePack } = evidenceSlice.actions;
export default evidenceSlice.reducer;
