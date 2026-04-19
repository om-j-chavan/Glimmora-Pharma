import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LinkedDocument } from "@/components/shared/DocumentUpload";

export type EventType = "FDA 483" | "Warning Letter" | "EMA Inspection" | "MHRA Inspection" | "WHO Inspection";
export type EventStatus =
  | "Open"
  | "Under Investigation"
  | "Response Due"
  | "Response Drafted"
  | "Pending QA Sign-off"
  | "Response Submitted"
  | "FDA Acknowledged"
  | "Closed"
  | "Warning Letter";
export type ObservationSeverity = "Critical" | "High" | "Low";
export type ObservationStatus = "Open" | "In Progress" | "RCA In Progress" | "CAPA Linked" | "Response Ready" | "Response Drafted" | "Closed";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Barrier Analysis";

export interface LinkedCAPA {
  capaId: string;
  linkedObservation?: number;
}

export interface Observation {
  id: string;
  number: number;
  text: string;
  severity: ObservationSeverity;
  area: string;
  regulation: string;
  rcaMethod?: RCAMethod;
  rootCause?: string;
  capaId?: string;
  capaIds?: string[];
  responseText?: string;
  status: ObservationStatus;
  documents?: LinkedDocument[];
}

export interface Commitment {
  id: string;
  eventId: string;
  text: string;
  dueDate: string;
  owner: string;
  status: "Pending" | "In Progress" | "Complete" | "Overdue";
}

export interface FDA483Event {
  id: string;
  tenantId: string;
  type: EventType;
  referenceNumber: string;
  agency: string;
  siteId: string;
  inspectionDate: string;
  responseDeadline: string;
  status: EventStatus;
  observations: Observation[];
  commitments: Commitment[];
  responseDraft: string;
  agiDraft: string;
  submittedAt?: string;
  submittedBy?: string;
  signatureMeaning?: string;
  closedAt?: string;
  createdAt: string;
  documents?: LinkedDocument[];
  responseDocuments?: LinkedDocument[];
  linkedCapas?: LinkedCAPA[];
}

interface FDA483State {
  items: FDA483Event[];
}

import { MOCK_FDA483_EVENTS } from "@/mock";

const initialState: FDA483State = { items: MOCK_FDA483_EVENTS };

const fda483Slice = createSlice({
  name: "fda483",
  initialState,
  reducers: {
    addEvent(state, { payload }: PayloadAction<FDA483Event>) {
      state.items.push(payload);
    },
    updateEvent(state, { payload }: PayloadAction<{ id: string; patch: Partial<FDA483Event> }>) {
      const item = state.items.find((e) => e.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeEvent(state, { payload }: PayloadAction<string>) {
      const item = state.items.find((e) => e.id === payload);
      if (item) { item.status = "Closed"; item.closedAt = new Date().toISOString(); }
    },
    addObservation(state, { payload }: PayloadAction<{ eventId: string; obs: Observation }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.observations.push(payload.obs);
    },
    updateObservation(state, { payload }: PayloadAction<{ eventId: string; obsId: string; patch: Partial<Observation> }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) { const obs = event.observations.find((o) => o.id === payload.obsId); if (obs) Object.assign(obs, payload.patch); }
    },
    addCommitment(state, { payload }: PayloadAction<{ eventId: string; commitment: Commitment }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.commitments.push(payload.commitment);
    },
    updateCommitment(state, { payload }: PayloadAction<{ eventId: string; commitmentId: string; patch: Partial<Commitment> }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) { const c = event.commitments.find((cm) => cm.id === payload.commitmentId); if (c) Object.assign(c, payload.patch); }
    },
    setResponseDraft(state, { payload }: PayloadAction<{ eventId: string; text: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.responseDraft = payload.text;
    },
    setAGIDraft(state, { payload }: PayloadAction<{ eventId: string; text: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.agiDraft = payload.text;
    },
    // Event-level documents
    addFDADocument(state, { payload }: PayloadAction<{ eventId: string; doc: LinkedDocument }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) { if (!event.documents) event.documents = []; event.documents.push(payload.doc); }
    },
    removeFDADocument(state, { payload }: PayloadAction<{ eventId: string; docId: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event && event.documents) event.documents = event.documents.filter((d) => d.id !== payload.docId);
    },
    approveFDADocument(state, { payload }: PayloadAction<{ eventId: string; docId: string; approvedBy: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      const doc = event?.documents?.find((d) => d.id === payload.docId);
      if (doc) { doc.status = "approved"; doc.approvedBy = payload.approvedBy; doc.approvedAt = new Date().toISOString(); }
    },
    // Response-level documents
    addResponseDocument(state, { payload }: PayloadAction<{ eventId: string; doc: LinkedDocument }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) { if (!event.responseDocuments) event.responseDocuments = []; event.responseDocuments.push(payload.doc); }
    },
    removeResponseDocument(state, { payload }: PayloadAction<{ eventId: string; docId: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event && event.responseDocuments) event.responseDocuments = event.responseDocuments.filter((d) => d.id !== payload.docId);
    },
    // Observation-level documents
    addObservationDocument(state, { payload }: PayloadAction<{ eventId: string; obsId: string; doc: LinkedDocument }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      const obs = event?.observations.find((o) => o.id === payload.obsId);
      if (obs) { if (!obs.documents) obs.documents = []; obs.documents.push(payload.doc); }
    },
    // Multi-CAPA linkage
    linkCAPAToEvent(state, { payload }: PayloadAction<{ eventId: string; capaId: string; observationNumber?: number }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) {
        if (!event.linkedCapas) event.linkedCapas = [];
        event.linkedCapas.push({ capaId: payload.capaId, linkedObservation: payload.observationNumber });
        // Also update observation's capaIds
        if (payload.observationNumber) {
          const obs = event.observations.find((o) => o.number === payload.observationNumber);
          if (obs) {
            if (!obs.capaIds) obs.capaIds = obs.capaId ? [obs.capaId] : [];
            if (!obs.capaIds.includes(payload.capaId)) obs.capaIds.push(payload.capaId);
            if (!obs.capaId) obs.capaId = payload.capaId;
            if (obs.status === "Open" || obs.status === "In Progress" || obs.status === "RCA In Progress") obs.status = "CAPA Linked";
          }
        }
      }
    },
  },
});

export const {
  addEvent, updateEvent, closeEvent,
  addObservation, updateObservation,
  addCommitment, updateCommitment,
  setResponseDraft, setAGIDraft,
  addFDADocument, removeFDADocument, approveFDADocument,
  addResponseDocument, removeResponseDocument,
  addObservationDocument,
  linkCAPAToEvent,
} = fda483Slice.actions;
export default fda483Slice.reducer;
