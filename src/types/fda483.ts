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
import type { InvestigationRCAMethod } from "@/constants/rcaMethods";

/* ── Enums ── */

export type EventType =
  | "FDA 483"
  | "Warning Letter"
  | "EMA Inspection"
  | "MHRA Inspection"
  | "WHO Inspection"
  | "Health Canada Inspection"
  | "TGA Inspection"
  | "PMDA Inspection"
  | "CDSCO Inspection"
  | "ANVISA Inspection"
  | "Other Inspection";

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

export type ObservationSeverity = "Critical" | "High" | "Medium" | "Low";

/** Role-based workflow pointer (orthogonal to EventStatus). Drives the
 *  stage-owner banner + handoff. Owner mapping lives in STAGE_CONFIG
 *  (src/modules/fda-483/_shared.ts). */
export type WorkflowStage =
  | "intake"
  | "investigation"
  | "response"
  | "outcome"
  | "closed";

/** FDA reply captured at the Outcome step. */
export type OutcomeType =
  | "Acknowledged"
  | "Closed"
  | "Warning Letter"
  | "Follow-up Requested";

export type ObservationStatus =
  | "Open"
  | "In Progress"
  | "CAPA Linked"
  | "Response Drafted"
  | "Closed";

// Phase 1.5 — unified into the shared RCA-method constant.
export type RCAMethod = InvestigationRCAMethod;

// "Overdue" is a DERIVED display state (status === "Pending"/"In Progress"
// AND dueDate < today), not a stored value — kept in the union for legacy
// rows that may still carry it. Stored workflow values are Pending / In
// Progress / Complete / Cancelled.
export type CommitmentStatus = "Pending" | "In Progress" | "Complete" | "Cancelled" | "Overdue";

export interface CommitmentDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: string;
}

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
  // ── First-class commitment fields ──
  reference?: string;
  /** Source linkage — at most one of these is set (else event-level). */
  observationId?: string;
  /** Resolved from the linked observation for display (number + reference). */
  observationNumber?: number;
  observationRef?: string;
  capaId?: string;
  /** Resolved from the linked CAPA for display. */
  capaRef?: string;
  completedAt?: string;
  completedById?: string;
  /** Resolved display name of the completer. */
  completedByName?: string;
  completionNotes?: string;
  createdById?: string;
  documents?: CommitmentDocument[];
}

export interface FDA483Event {
  id: string;
  tenantId: string;
  type: EventType;
  referenceNumber: string;
  agency: string;
  siteId: string;
  inspectionDate: string;
  /** Optional inspection end date (extended capture); absent on legacy rows. */
  inspectionEndDate?: string;
  responseDeadline: string;
  status: EventStatus;
  /** Role-based workflow pointer; defaults to "intake" on legacy rows. */
  currentStage: WorkflowStage;
  /** FDA outcome capture (Record Outcome step); absent until recorded. */
  outcomeType?: OutcomeType;
  outcomeNote?: string;
  /** FDA inspector named on the form (extended capture); optional. */
  leadInvestigator?: string;
  /** Internal QA owner user id (extended capture); optional on legacy rows. */
  internalOwnerId?: string;
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
