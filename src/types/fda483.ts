/**
 * FDA 483 module types — extracted from the deprecated Redux slice so
 * components can import without coupling to the slice file. The shapes
 * and enum values match the slice exactly, so this is a pure relocation:
 * existing code keeps working without any logic changes.
 *
 * Enum casing intentionally matches what's actually in the database
 * (PascalCase with spaces, e.g. "Response Submitted", "5 Why") rather
 * than the lowercase-underscore convention used in some specs.
 *
 * `LinkedDocument` is the Redux/local type used by `<DocumentUpload>`.
 * The Prisma schema has no FDA483Document or ObservationDocument tables
 * yet — those arrays remain optional and non-persistent for now.
 */

import type { LinkedDocument } from "@/components/shared/DocumentUpload";

/* ── Enums ── */

export type EventType =
  | "FDA 483"
  | "Warning Letter"
  | "EMA Inspection"
  | "MHRA Inspection"
  | "WHO Inspection";

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

export type ObservationStatus =
  | "Open"
  | "In Progress"
  | "RCA In Progress"
  | "CAPA Linked"
  | "Response Ready"
  | "Response Drafted"
  | "Closed";

export type RCAMethod = "5 Why" | "Fishbone" | "Fault Tree" | "Barrier Analysis";

export type CommitmentStatus = "Pending" | "In Progress" | "Complete" | "Overdue";

/* ── Domain shapes ── */

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
  status: CommitmentStatus;
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

/* ── Convenience aliases ── */

export type EventWithDetails = FDA483Event;
export type ObservationWithDocs = Observation;

/* ── Stats type for KPI surfaces ── */

export interface FDA483Stats {
  total: number;
  open: number;
  responseDue: number;
  overdue: number;
  closed: number;
  warningLetter: number;
  totalObservations: number;
}

/* ── Form input types (used by modals + server actions) ── */

export interface CreateEventInput {
  referenceNumber: string;
  eventType: EventType;
  agency: string;
  siteId: string;
  inspectionDate: string;
  responseDeadline: string;
}

export interface CreateObservationInput {
  eventId: string;
  number: number;
  text: string;
  area?: string;
  regulation?: string;
  severity: ObservationSeverity;
}

export interface CreateCommitmentInput {
  eventId: string;
  text: string;
  dueDate?: string;
  owner?: string;
}
