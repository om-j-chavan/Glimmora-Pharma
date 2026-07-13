import type { BadgeVariant } from "@/components/ui/Badge";
import { frameworkLabel } from "@/constants/frameworks";
import type {
  WorklistActionItem,
  WorklistDeviationTask,
  WorklistDoc,
  WorklistFinding,
  WorklistTaskMessage,
} from "@/lib/queries/worklist";

/**
 * ONE normalized "work item" view-model for the rebuilt Worklist. Every assigned
 * work type — a Gap Finding, a CAPA action item, or a Deviation task — is mapped
 * to this shape by a per-source adapter (the DocumentCard playbook: one card/modal,
 * adapters per source). The shared WorkItemCard + WorkItemModal render it; the
 * modal wires the source-specific server actions off `source` + `raw`.
 */

export type WorkSource = "finding" | "capa" | "deviation";

export interface WorkItemMetaField {
  label: string;
  value: string;
}

export interface WorkItem {
  key: string; // `${source}:${id}` — stable React key
  source: WorkSource;
  sourceLabel: string; // "Finding" | "CAPA" | "Deviation"
  id: string; // the source record id (finding / action-item / deviation-task)
  reference: string; // shown after the source label
  title: string; // requirement / action description / task instruction
  status: string; // raw source status
  statusLabel: string; // normalized chip label
  statusVariant: BadgeVariant;
  isOpen: boolean; // counts as open work (summary card)
  isRework: boolean; // returned for rework
  canWork: boolean; // the work surface is editable
  priority: string | null; // severity / CAPA risk / deviation priority
  dueDate: string | null; // ISO, for sorting
  metaLine: string; // one compact line for the card
  metaFields: WorkItemMetaField[]; // metadata block in the modal
  description: string; // body text in the modal
  reworkReason: string | null;
  notes: string; // current work/completion notes
  /** "My Uploaded Documents" — docs the worker uploaded on this item (editable). */
  myDocs: WorklistDoc[];
  /** "Related Documents" — module-sourced docs (READ-ONLY; the origin boundary). */
  relatedDocs: WorklistDoc[];
  messages: WorklistTaskMessage[]; // QA ↔ worker conversation
  link: { href: string; label: string } | null; // chip to the source / parent CAPA
  /** Source-record resolution — the Close Message + closed date (deviation), shown
   *  on the worklist detail when the source record is closed. */
  closureMessage: string | null;
  closedDate: string | null;
  raw: WorklistFinding | WorklistActionItem | WorklistDeviationTask;
}

type Fmt = (iso: string | null) => string;

interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  isOpen: boolean;
  isRework: boolean;
  canWork: boolean;
}

// ── Per-source status → shared chip + flags. "Not Started / In Progress /
//    Returned / Submitted / Done" — a single vocabulary across all three. ──
function findingStatusMeta(s: string): StatusMeta {
  switch (s) {
    case "In Progress": return { label: "In Progress", variant: "amber", isOpen: true, isRework: false, canWork: true };
    case "Submitted": return { label: "Submitted", variant: "purple", isOpen: false, isRework: false, canWork: false };
    case "Rework": return { label: "Returned", variant: "red", isOpen: true, isRework: true, canWork: true };
    case "Closed": return { label: "Closed", variant: "green", isOpen: false, isRework: false, canWork: false };
    default: return { label: "Not Started", variant: "blue", isOpen: true, isRework: false, canWork: true }; // "Open"
  }
}
function capaStatusMeta(s: string, editable: boolean): StatusMeta {
  switch (s) {
    case "in_progress": return { label: "In Progress", variant: "amber", isOpen: true, isRework: false, canWork: editable };
    case "complete": return { label: "Done", variant: "green", isOpen: false, isRework: false, canWork: false };
    case "skipped": return { label: "Skipped", variant: "gray", isOpen: false, isRework: false, canWork: false };
    case "rework": return { label: "Returned", variant: "red", isOpen: true, isRework: true, canWork: editable };
    default: return { label: "Not Started", variant: "blue", isOpen: true, isRework: false, canWork: editable }; // "pending"
  }
}
function deviationStatusMeta(s: string): StatusMeta {
  switch (s) {
    case "in_progress": return { label: "In Progress", variant: "amber", isOpen: true, isRework: false, canWork: true };
    case "submitted": return { label: "Submitted", variant: "purple", isOpen: false, isRework: false, canWork: false };
    case "rework": return { label: "Returned", variant: "red", isOpen: true, isRework: true, canWork: true };
    // Parent deviation CLOSED (closeDeviation sets the task to "closed") →
    // reflect Closed, read-only. "cancelled" mirrors it.
    case "closed": return { label: "Closed", variant: "green", isOpen: false, isRework: false, canWork: false };
    case "cancelled": return { label: "Cancelled", variant: "gray", isOpen: false, isRework: false, canWork: false };
    default: return { label: "Not Started", variant: "blue", isOpen: true, isRework: false, canWork: true }; // "pending"
  }
}

/** Gap Finding → the shared work item. Source: "Finding · FND-…". */
export function findingToWorkItem(f: WorklistFinding, fmt: Fmt): WorkItem {
  const st = findingStatusMeta(f.status);
  const fw = f.framework ? frameworkLabel(f.framework) : null;
  return {
    key: `finding:${f.id}`,
    source: "finding", sourceLabel: "Finding", id: f.id,
    reference: f.reference ?? f.id.slice(0, 8),
    title: f.requirement,
    status: f.status, statusLabel: st.label, statusVariant: st.variant,
    isOpen: st.isOpen, isRework: st.isRework, canWork: st.canWork,
    priority: f.severity, dueDate: f.targetDate,
    metaLine: [fw, f.area, f.targetDate ? `due ${fmt(f.targetDate)}` : null].filter(Boolean).join(" · "),
    metaFields: [
      { label: "Framework", value: fw ?? "—" },
      { label: "Area", value: f.area },
      { label: "Target date", value: fmt(f.targetDate) },
    ],
    description: f.requirement,
    reworkReason: f.reworkReason,
    notes: f.completionNotes ?? "",
    myDocs: f.docs, relatedDocs: [], messages: f.messages,
    link: { href: "/gap-assessment", label: f.reference ?? "Gap register" },
    closureMessage: null, closedDate: null,
    raw: f,
  };
}

/** CAPA action item → the shared work item. Source: "CAPA · <ref>" + link chip
 *  to the parent CAPA. */
export function actionToWorkItem(a: WorklistActionItem, fmt: Fmt): WorkItem {
  const st = capaStatusMeta(a.status, a.capaEditable);
  const capaRef = a.capaReference ?? a.capaId.slice(0, 8);
  return {
    key: `capa:${a.id}`,
    source: "capa", sourceLabel: "CAPA", id: a.id,
    reference: capaRef,
    title: a.description,
    status: a.status, statusLabel: st.label, statusVariant: st.variant,
    isOpen: st.isOpen, isRework: st.isRework, canWork: st.canWork,
    priority: a.capaRisk, dueDate: a.dueDate,
    metaLine: [a.capaTitle, a.dueDate ? `due ${fmt(a.dueDate)}` : null].filter(Boolean).join(" · "),
    metaFields: [
      { label: "Parent CAPA", value: capaRef },
      { label: "Priority", value: a.capaRisk },
      { label: "Due date", value: fmt(a.dueDate) },
      { label: "Assignee", value: a.assigneeName },
    ],
    description: a.description,
    reworkReason: a.reworkReason,
    notes: a.completionNotes ?? "",
    // Item 6 — myDocs = the worker's own evidence uploads (editable); relatedDocs
    // = the source-module docs (gap finding / deviation) that spawned the CAPA,
    // read-only (the origin boundary). The modal renders relatedDocs read-only.
    myDocs: a.docs, relatedDocs: a.relatedDocs, messages: a.messages,
    link: { href: `/capa/${a.capaId}`, label: capaRef },
    closureMessage: null, closedDate: null,
    raw: a,
  };
}

/** Deviation task → the shared work item. Source: "Deviation · <ref>" + link chip. */
export function deviationToWorkItem(t: WorklistDeviationTask, fmt: Fmt): WorkItem {
  const st = deviationStatusMeta(t.status);
  return {
    key: `deviation:${t.id}`,
    source: "deviation", sourceLabel: "Deviation", id: t.id,
    reference: t.deviationReference ?? t.deviationId.slice(0, 8),
    title: t.message,
    status: t.status, statusLabel: st.label, statusVariant: st.variant,
    isOpen: st.isOpen, isRework: st.isRework, canWork: st.canWork,
    priority: t.context.priority, dueDate: t.dueDate,
    metaLine: [t.context.area, t.dueDate ? `due ${fmt(t.dueDate)}` : null].filter(Boolean).join(" · "),
    metaFields: [
      { label: "Area", value: t.context.area },
      { label: "Priority", value: t.context.priority ?? "—" },
      { label: "Due date", value: fmt(t.dueDate) },
    ],
    description: t.context.description,
    reworkReason: t.reworkReason,
    notes: t.completionNotes ?? "",
    // Origin boundary (already built in the query): taskDocs = the worker's own
    // uploads (editable); deviationDocs = the parent-deviation module docs (read-only).
    myDocs: t.taskDocs, relatedDocs: t.deviationDocs, messages: t.messages,
    link: { href: "/deviation", label: t.deviationReference ?? "Deviations" },
    closureMessage: t.closureMessage, closedDate: t.closedDate,
    raw: t,
  };
}
