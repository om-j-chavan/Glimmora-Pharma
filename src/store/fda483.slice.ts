import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type EventType = "FDA 483" | "Warning Letter" | "EMA Inspection" | "MHRA Inspection" | "WHO Inspection";
export type EventStatus = "Open" | "Response Due" | "Response Submitted" | "Closed";
export type ObservationSeverity = "Critical" | "Major" | "Minor";
export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Barrier Analysis";

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
  responseText?: string;
  status: "Open" | "RCA In Progress" | "Response Drafted" | "Closed";
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
  closedAt?: string;
  createdAt: string;
}

interface FDA483State {
  items: FDA483Event[];
}

const initialState: FDA483State = {
  items: [],
};

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
      if (item) {
        item.status = "Closed";
        item.closedAt = "";
      }
    },
    addObservation(state, { payload }: PayloadAction<{ eventId: string; obs: Observation }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.observations.push(payload.obs);
    },
    updateObservation(state, { payload }: PayloadAction<{ eventId: string; obsId: string; patch: Partial<Observation> }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) {
        const obs = event.observations.find((o) => o.id === payload.obsId);
        if (obs) Object.assign(obs, payload.patch);
      }
    },
    addCommitment(state, { payload }: PayloadAction<{ eventId: string; commitment: Commitment }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.commitments.push(payload.commitment);
    },
    updateCommitment(state, { payload }: PayloadAction<{ eventId: string; commitmentId: string; patch: Partial<Commitment> }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) {
        const c = event.commitments.find((cm) => cm.id === payload.commitmentId);
        if (c) Object.assign(c, payload.patch);
      }
    },
    setResponseDraft(state, { payload }: PayloadAction<{ eventId: string; text: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.responseDraft = payload.text;
    },
    setAGIDraft(state, { payload }: PayloadAction<{ eventId: string; text: string }>) {
      const event = state.items.find((e) => e.id === payload.eventId);
      if (event) event.agiDraft = payload.text;
    },
  },
});

export const {
  addEvent, updateEvent, closeEvent,
  addObservation, updateObservation,
  addCommitment, updateCommitment,
  setResponseDraft, setAGIDraft,
} = fda483Slice.actions;
export default fda483Slice.reducer;
