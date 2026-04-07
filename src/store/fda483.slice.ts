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
  closedAt?: string;
  createdAt: string;
}

interface FDA483State {
  items: FDA483Event[];
}

const initialState: FDA483State = {
  items: [
    {
      id: "event-001", tenantId: "tenant-glimmora", type: "FDA 483", referenceNumber: "FEI-3004795103-2026", agency: "FDA", siteId: "site-gl-3", inspectionDate: "2026-03-10T00:00:00Z", responseDeadline: "2026-04-05T00:00:00Z", status: "Response Due", responseDraft: "", agiDraft: "", createdAt: "2026-03-10T14:00:00Z",
      observations: [
        { id: "obs-001-1", number: 1, text: "Failure to maintain complete data integrity controls in the LIMS system. Audit trail gaps identified in 3 of 12 modules reviewed during inspection.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 211.68(b)", status: "RCA In Progress", rcaMethod: "5 Why", rootCause: "System upgrade Nov 2025 reset audit trail configuration.", capaId: "CAPA-0042" },
        { id: "obs-001-2", number: 2, text: "Electronic signatures in CDS not cryptographically linked to records as required under 21 CFR Part 11.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 11.50", status: "Open", capaId: "CAPA-0043" },
        { id: "obs-001-3", number: 3, text: "HPLC qualification records (IQ/OQ) overdue by 9 months. Equipment used in GMP testing without current qualification.", severity: "Major", area: "Manufacturing", regulation: "21 CFR 211.68(a)", status: "Response Drafted", rcaMethod: "Fishbone", rootCause: "CMMS did not flag overdue qualification. Scheduling gap.", capaId: "CAPA-0044" },
      ],
      commitments: [
        { id: "commit-001-1", eventId: "event-001", text: "Audit trail remediation across all 12 LIMS modules — configuration locked via change control", dueDate: "2026-03-31T00:00:00Z", owner: "u-005", status: "In Progress" },
        { id: "commit-001-2", eventId: "event-001", text: "E-signature binding validation and protocol completion", dueDate: "2026-04-15T00:00:00Z", owner: "u-005", status: "Pending" },
        { id: "commit-001-3", eventId: "event-001", text: "HPLC IQ/OQ completion and CMMS update with automated reminders", dueDate: "2026-03-31T00:00:00Z", owner: "u-002", status: "Complete" },
      ],
    },
  ],
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
