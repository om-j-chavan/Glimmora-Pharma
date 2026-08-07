import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LinkedDocument } from "@/components/shared/DocumentUpload";
import type { WorklistDoc } from "@/lib/queries/worklist";
import type { InvestigationRCAMethod } from "@/constants/rcaMethods";
// Type-only: used solely in a `typeof` query, so this import is fully erased —
// no runtime dependency from the store on the taxonomy module.
import type { DEVIATION_STATUS_VALUES } from "@/constants/statusTaxonomy";

export type DeviationType = "planned" | "unplanned";
export type DeviationCategory = "process" | "equipment" | "material" | "environmental" | "personnel" | "documentation" | "system" | "other";
// Accepts both casings. Legacy DB rows are lowercase
// (critical/major/minor); rows written via createDeviation after the
// Cat 1 severity-unification rung are TitleCase (Critical/Major/Minor,
// matching the FDA-regulatory canonical form). Display code normalises
// via src/lib/severity.ts; comparisons must do the same.
export type DeviationSeverity = "critical" | "major" | "minor" | "Critical" | "Major" | "Minor";
// "capa_pending" (Stage 1, deviation redesign): a CAPA was raised for a high/med
// deviation; it stays OPEN + linked until the CAPA closes, then QA sign-closes.
// Derived from the canonical DEVIATION_STATUS_VALUES array — the values live in
// src/constants/statusTaxonomy.ts, which the display map derives from too, so
// the union and the badge/label maps can no longer drift apart.
export type DeviationStatus = (typeof DEVIATION_STATUS_VALUES)[number];
// Phase 1.5 — unified to canonical spaced values via the shared constant.
export type DeviationRCAMethod = InvestigationRCAMethod;

/** Stage 4 (deviation redesign) — the current active low-priority task on a
 *  deviation (serialised; Dates → ISO). Null when none is open. */
export interface DeviationTaskMessageView {
  id: string;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface DeviationActiveTask {
  id: string;
  assignee: string;
  assigneeId: string | null;
  message: string;
  dueDate: string | null;
  status: string;
  completionNotes: string | null;
  submittedAt: string | null;
  reworkReason: string | null;
  /** Stage 5 — flat QA↔worker conversation. */
  messages: DeviationTaskMessageView[];
  /** Count of the task's own documents (for the raise-CAPA confirm preview). */
  docCount: number;
  /** The task's own uploaded documents (grouped by GxP category in the QA modal). */
  taskDocs: WorklistDoc[];
}

export interface Deviation {
  id: string;
  // Human-readable reference (e.g. "DEV-CHN-2026-001"). Optional in
  // the Redux shape because legacy/pre-backfill rows may not have one;
  // every created Deviation populates it server-side. UI fallback when
  // missing: display the cuid-prefixed slice.
  reference?: string;
  tenantId: string;
  title: string;
  description: string;
  type: DeviationType;
  category: DeviationCategory;
  severity: DeviationSeverity;
  /** Stage 2/3 (deviation redesign) — QA triage priority ("Low"|"Medium"|"High");
   *  drives the priority split (high/med → CAPA, low → task). Optional: legacy
   *  rows predate it. */
  priority?: string;
  /** Stage 4 — the current active low-priority task (assign → submit → review). */
  activeTask?: DeviationActiveTask | null;
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
  /** Authoritative userId FK of the reporter (Deviation.createdById).
   *  Used by the investigation/CAPA-decision SoD checks in the UI. */
  createdById?: string;
  // ── Tier 2, Items 3+4 — investigation + CAPA decision ──
  /** Raw structured RCA form buffer as JSON text (repopulates the edit
   *  form without re-parsing rootCause). */
  rcaData?: string;
  investigationCompletedAt?: string;
  investigationCompletedById?: string;
  capaDecisionMade?: boolean;
  capaDecisionRequired?: boolean;
  capaDecisionReason?: string;
  capaDecisionAt?: string;
  capaDecisionById?: string;
  batchesAffected?: string[];
  linkedCAPAId?: string;
  /** Human-readable reference of the linked CAPA (resolved from the
   *  sourcedCAPA relation); used for display while linkedCAPAId routes. */
  linkedCAPARef?: string;
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
