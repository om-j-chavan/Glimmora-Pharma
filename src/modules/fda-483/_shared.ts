// Single source of truth for FDA 483 module rendering helpers.
//
// Replaces the inline-duplicated badge/status helpers that used to
// live in EventsTab, ObservationsTab, SignSubmitModal, and FDA483Page
// (eventTypeBadge × 3 copies; eventStatusBadge × 2; getEffectiveStatus
// × 3; daysLeft × 3). See AUDIT-FDA483-MODULE.md Cat 5 + Cat 11.
//
// Narrow domain types are imported from src/types/fda483.ts (the
// established single source of truth for the FDA483 union types). The
// `Record<NarrowType, BadgeVariant>` shape forces TS to error if a new
// status is added to the union without a colour decision here.
//
// The badge helpers accept `string` (not the narrow type) so legacy /
// unknown values from the DB degrade gracefully to a grey badge with
// the raw string as label instead of crashing.

import dayjs from "@/lib/dayjs";
import type { BadgeVariant } from "@/components/ui/Badge";
import type {
  EventStatus,
  EventType,
  ObservationStatus,
  ObservationSeverity,
  FDA483Event,
  Observation,
  WorkflowStage,
} from "@/types/fda483";
import {
  getSeverityVariant,
  normalizeSeverityForDisplay,
} from "@/lib/severity";

/* ── Re-export narrow types for convenient single-import in consumers ── */

export type { EventStatus, EventType, ObservationStatus, ObservationSeverity, WorkflowStage };

/* ── Role-based workflow stages (the ownership handoff model) ──────────
 *
 * `currentStage` is a lightweight pointer stored on FDA483Event, ORTHOGONAL
 * to `status` (which stays the data/urgency state). Each stage maps to a
 * fixed OWNER ROLE — no per-user assignment. The banner in EventHeader reads
 * this; the server action (fda483.ts) imports the role mapping for its guard.
 *
 * Handoff is SOFT: the two "hand off" buttons (intake→investigation,
 * investigation→response) only advance the pointer + notify — they do not
 * lock editing. The response→outcome and outcome→closed transitions happen
 * via Sign & Submit and Record Outcome respectively (not a handoff button),
 * so those stages carry `nextActionLabel: null`. */

export interface StageConfig {
  label: string;
  /** Role KEY that owns this stage (matches session.user.role). */
  ownerRole: string;
  /** Human label for the owning role. */
  ownerLabel: string;
  /** One-line "what to do next" hint shown in the banner. */
  nextHint: string;
  /** The stage a handoff advances to (null = terminal / advanced elsewhere). */
  nextStage: WorkflowStage | null;
  /** Handoff button text — null when this stage advances via a signed action
   *  (Sign & Submit / Record Outcome) rather than a plain handoff. */
  nextActionLabel: string | null;
}

export const STAGE_CONFIG: Record<WorkflowStage, StageConfig> = {
  intake: {
    label: "Intake",
    ownerRole: "regulatory_affairs",
    ownerLabel: "Regulatory Affairs",
    nextHint: "Add the observations, then hand to QA for investigation.",
    nextStage: "investigation",
    nextActionLabel: "Hand to QA",
  },
  investigation: {
    label: "Investigation",
    ownerRole: "qa_head",
    ownerLabel: "QA Head",
    nextHint: "Complete RCA + raise a CAPA for each observation, then hand back to RA.",
    nextStage: "response",
    nextActionLabel: "Hand to RA",
  },
  response: {
    label: "Response & Sign-off",
    ownerRole: "regulatory_affairs",
    ownerLabel: "Regulatory Affairs",
    nextHint: "Draft the response, then Sign & Submit.",
    nextStage: "outcome",
    nextActionLabel: null, // advances via Sign & Submit
  },
  outcome: {
    label: "Outcome",
    ownerRole: "regulatory_affairs",
    ownerLabel: "Regulatory Affairs",
    nextHint: "Record FDA's reply to close the event.",
    nextStage: "closed",
    nextActionLabel: null, // advances via Record Outcome
  },
  closed: {
    label: "Closed",
    ownerRole: "",
    ownerLabel: "—",
    nextHint: "No further action required.",
    nextStage: null,
    nextActionLabel: null,
  },
};

export function getStageOwnerRole(stage: WorkflowStage): string {
  return STAGE_CONFIG[stage]?.ownerRole ?? "";
}

export function getNextStage(stage: WorkflowStage): WorkflowStage | null {
  return STAGE_CONFIG[stage]?.nextStage ?? null;
}

/** Canonical audit-log module string for the FDA 483 module — the single
 *  source of truth shared by server actions (fda483.ts) and the response-tab
 *  DocumentUpload writers. Rung 3G unified the prior "FDA 483" / "FDA 483
 *  Response" split onto this one value (mirrors CSV_AUDIT_MODULE). */
export const FDA483_AUDIT_MODULE = "FDA 483" as const;

/* ── Variant maps — exhaustive Records (TS enforces all keys present) ── */

export const FDA483_EVENT_STATUS_VARIANT: Record<EventStatus, BadgeVariant> = {
  Open: "amber",
  "Under Investigation": "blue",
  "Response Due": "red",
  "Response Drafted": "amber",
  "Pending QA Sign-off": "amber",
  "Response Submitted": "green",
  "FDA Acknowledged": "green",
  Closed: "gray",
  "Warning Letter": "red",
};

export const FDA483_EVENT_TYPE_VARIANT: Record<EventType, BadgeVariant> = {
  "FDA 483": "red",
  "Warning Letter": "red",
  "EMA Inspection": "amber",
  "MHRA Inspection": "amber",
  "WHO Inspection": "blue",
  "Health Canada Inspection": "blue",
  "TGA Inspection": "blue",
  "PMDA Inspection": "blue",
  "CDSCO Inspection": "blue",
  "ANVISA Inspection": "blue",
  "Other Inspection": "gray",
};

export const FDA483_OBSERVATION_STATUS_VARIANT: Record<ObservationStatus, BadgeVariant> = {
  Open: "amber",
  "In Progress": "amber",
  "CAPA Linked": "blue",
  "Response Drafted": "green",
  Closed: "gray",
};

/* ── User-pickable vs server-only observation statuses ─────────────
 *
 * The full taxonomy has 5 values, but only 3 are reachable through
 * the user-facing observation status dropdown. The other 2 are set
 * by server actions:
 *   - "CAPA Linked"     → set by raiseCAPAFromObservation
 *   - "Response Drafted" → set by RCA-save in FDA483Page
 *
 * The badge map renders all 5; AddObservationModal's picker shows
 * only the user-pickable 3 (plus the current value as disabled when
 * editing an observation whose status is server-only). */

export const USER_PICKABLE_OBSERVATION_STATUSES: readonly ObservationStatus[] = [
  "Open",
  "In Progress",
  "Closed",
];

export const SERVER_ONLY_OBSERVATION_STATUSES: readonly ObservationStatus[] = [
  "CAPA Linked",
  "Response Drafted",
];

export function isServerOnlyObservationStatus(status: string): boolean {
  return (SERVER_ONLY_OBSERVATION_STATUSES as readonly string[]).includes(status);
}

/* ── Effective status + deadline helpers ─────────────────────────── */

/** Number of whole days from now until the deadline. Negative if the
 *  deadline has passed. Returns null if the input is missing/unparseable
 *  so call sites can render an em-dash instead of "NaN days". */
export function daysUntil(deadline: string | Date | null | undefined): number | null {
  if (!deadline) return null;
  const d = dayjs.utc(deadline);
  if (!d.isValid()) return null;
  return d.diff(dayjs(), "day");
}

/* ── Register-Event derivation helpers ────────────────────────────────
 *
 * Event Type drives the regulatory agency, the response-deadline formula,
 * and the reference-number label/placeholder. Keyed by the EventType
 * string the modal's dropdown emits; unknown keys degrade gracefully.
 */

export const AGENCY_BY_EVENT_TYPE: Record<string, string> = {
  "FDA 483": "FDA",
  "Warning Letter": "FDA",
  "EMA Inspection": "EMA",
  "MHRA Inspection": "MHRA",
  "WHO Inspection": "WHO",
  "Health Canada Inspection": "Health Canada",
  "TGA Inspection": "TGA",
  "PMDA Inspection": "PMDA",
  "CDSCO Inspection": "CDSCO",
  "ANVISA Inspection": "ANVISA",
  "Other Inspection": "Other",
};

export function deriveAgency(eventType: string): string {
  return AGENCY_BY_EVENT_TYPE[eventType] ?? "Other";
}

export const DEADLINE_FORMULA_BY_EVENT_TYPE: Record<
  string,
  { workingDays: number | null; calendarDays: number | null; hintText: string }
> = {
  "FDA 483": { workingDays: 15, calendarDays: null, hintText: "FDA: 15 working days from inspection conclusion" },
  "Warning Letter": { workingDays: 30, calendarDays: null, hintText: "Warning Letter: 30 working days from receipt" },
  "EMA Inspection": { workingDays: null, calendarDays: 30, hintText: "EMA: 30 calendar days from inspection" },
  "MHRA Inspection": { workingDays: 30, calendarDays: null, hintText: "MHRA: 30 working days from inspection" },
  "WHO Inspection": { workingDays: null, calendarDays: 30, hintText: "WHO: 30 calendar days from inspection" },
  "Health Canada Inspection": { workingDays: null, calendarDays: 30, hintText: "Health Canada: 30 calendar days from inspection (adjust as needed)" },
  "TGA Inspection": { workingDays: null, calendarDays: 30, hintText: "TGA: 30 calendar days from inspection (adjust as needed)" },
  "PMDA Inspection": { workingDays: null, calendarDays: 30, hintText: "PMDA: 30 calendar days from inspection (adjust as needed)" },
  "CDSCO Inspection": { workingDays: null, calendarDays: 30, hintText: "CDSCO: 30 calendar days from inspection (adjust as needed)" },
  "ANVISA Inspection": { workingDays: null, calendarDays: 30, hintText: "ANVISA: 30 calendar days from inspection (adjust as needed)" },
  "Other Inspection": { workingDays: null, calendarDays: 30, hintText: "Default: 30 calendar days — override if the agency differs" },
};

/**
 * Add N working days to a date, skipping Saturday and Sunday only.
 * NOTE: does NOT account for regional/public holidays — that's a V2
 * refinement. Operates on a copy; handles month/year boundaries via the
 * native Date rollover in setDate().
 */
export function addWorkingDays(from: Date, workingDays: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < workingDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/** Compute the response deadline from the event type + a base date
 *  (inspection end, or start when no end). Returns the base date unchanged
 *  for unknown event types. */
export function computeResponseDeadline(eventType: string, fromDate: Date): Date {
  const rule = DEADLINE_FORMULA_BY_EVENT_TYPE[eventType];
  if (!rule) return fromDate;
  if (rule.workingDays) {
    return addWorkingDays(fromDate, rule.workingDays);
  }
  if (rule.calendarDays) {
    const result = new Date(fromDate);
    result.setDate(result.getDate() + rule.calendarDays);
    return result;
  }
  return fromDate;
}

export const REFERENCE_LABEL_BY_EVENT_TYPE: Record<
  string,
  { label: string; placeholder: string }
> = {
  "FDA 483": { label: "Event reference", placeholder: "e.g. 483-MUM-2026-004 (auto if blank)" },
  "Warning Letter": { label: "Letter Reference", placeholder: "e.g. WL-2026-CDR-0042" },
  "EMA Inspection": { label: "Inspection ID", placeholder: "e.g. INS/GMP/2026/0123" },
  "MHRA Inspection": { label: "MHRA Reference", placeholder: "e.g. INSP-MHRA-2026-045" },
  "WHO Inspection": { label: "WHO Reference", placeholder: "e.g. WHO-PREQ-2026-008" },
  "Health Canada Inspection": { label: "Inspection Reference", placeholder: "e.g. HC-INS-2026-0123" },
  "TGA Inspection": { label: "TGA Reference", placeholder: "e.g. TGA-2026-000123" },
  "PMDA Inspection": { label: "PMDA Reference", placeholder: "e.g. PMDA-2026-0123" },
  "CDSCO Inspection": { label: "CDSCO Reference", placeholder: "e.g. CDSCO-2026-0123" },
  "ANVISA Inspection": { label: "ANVISA Reference", placeholder: "e.g. ANVISA-2026-0123" },
  "Other Inspection": { label: "Reference number", placeholder: "e.g. INSP-2026-0123" },
};

/** Reference-code prefix per event type. When the user leaves the reference
 *  blank, the server auto-generates a UNIQUE code `<prefix>-<siteCode>-<year>-<NNN>`
 *  (same scheme as observations + seed data) so events never collide — this is
 *  why an FDA 483's reference must NOT be the facility FEI (one facility has
 *  many 483s). A real, unique agency reference (e.g. a Warning Letter number)
 *  typed by the user is honoured as-is. */
export const REFERENCE_PREFIX_BY_EVENT_TYPE: Record<string, string> = {
  "FDA 483": "483",
  "Warning Letter": "WL",
  "EMA Inspection": "EMA",
  "MHRA Inspection": "MHRA",
  "WHO Inspection": "WHO",
  "Health Canada Inspection": "HC",
  "TGA Inspection": "TGA",
  "PMDA Inspection": "PMDA",
  "CDSCO Inspection": "CDSCO",
  "ANVISA Inspection": "ANVISA",
  "Other Inspection": "INS",
};

/** Promote the stored event status to "Response Due" when the deadline
 *  is within 15 days, unless the event is already in a terminal-or-late
 *  state (Closed / Response Submitted) where the deadline override is
 *  no longer meaningful. The stored status in the DB is unchanged. */
/** Statuses at/after response submission where the event is LOCKED — no more
 *  editing of observations / RCA / response, and no deadline "Response Due"
 *  overlay. Includes the FDA-outcome terminals set by recordFDA483Outcome
 *  (FDA Acknowledged / Warning Letter) plus the pre-existing Response Submitted
 *  / Closed. "Follow-up Requested" is intentionally EXCLUDED — it reopens the
 *  Response stage (status returns to Response Drafted) so editing resumes. */
export const LOCKED_EVENT_STATUSES: readonly string[] = [
  "Response Submitted",
  "FDA Acknowledged",
  "Closed",
  "Warning Letter",
];

export function isEventLocked(status: EventStatus | string): boolean {
  return (LOCKED_EVENT_STATUSES as readonly string[]).includes(status);
}

export function getEffectiveEventStatus(
  status: EventStatus | string,
  deadline: string | Date | null | undefined,
): EventStatus {
  // Once locked (submitted or any FDA outcome), the stored status is
  // authoritative — never overlay a deadline-driven "Response Due".
  if (isEventLocked(status)) return status as EventStatus;
  const days = daysUntil(deadline);
  if (days !== null && days <= 15) return "Response Due";
  return status as EventStatus;
}

/* ── Badge helpers — return data, not JSX ────────────────────────── */

interface BadgeData {
  variant: BadgeVariant;
  label: string;
}

export function eventStatusBadge(status: string): BadgeData {
  const variant = FDA483_EVENT_STATUS_VARIANT[status as EventStatus] ?? "gray";
  return { variant, label: status };
}

export function eventTypeBadge(type: string): BadgeData {
  const variant = FDA483_EVENT_TYPE_VARIANT[type as EventType] ?? "gray";
  return { variant, label: type };
}

export function observationStatusBadge(status: string): BadgeData {
  const variant = FDA483_OBSERVATION_STATUS_VARIANT[status as ObservationStatus] ?? "gray";
  return { variant, label: status };
}

export function observationSeverityBadge(severity: string): BadgeData {
  // Observation severity is GENERIC taxonomy per Cat 1 unification
  // (Critical / High / Medium / Low). normalizeSeverityForDisplay
  // accepts mixed-case stored values and returns the canonical label.
  return {
    variant: getSeverityVariant(severity, "generic"),
    label: normalizeSeverityForDisplay(severity, "generic") ?? severity,
  };
}

/* ── Readiness checklist helper (R2 spec item #24) ────────────────
 *
 * Five canonical readiness rows shared by:
 *   - the Overview tab (banner + checklist)
 *   - the Response tab (readiness card)
 *
 * Each row carries a `targetTab` (where clicking the row should
 * navigate) and an optional `targetObsIndex` (for rca/capa rows the
 * deep-link should land on the first incomplete observation). The
 * helper is pure — the consumer translates targetTab into the URL
 * via useEventDetailUrlState().navigate().
 */

export interface ReadinessRow {
  id: "rca" | "capa" | "docs" | "draft" | "commitments";
  label: string;
  done: boolean;
  targetTab: "overview" | "observations" | "investigation" | "response";
  targetObsIndex?: number;
}

export function computeReadinessRows(
  event: FDA483Event,
): { rows: ReadinessRow[]; doneCount: number; total: number } {
  const obs = event.observations ?? [];
  const totalObs = obs.length;

  // Index of the first observation missing each artefact — drives the
  // "Continue here" deep-link from the readiness row click handler.
  const firstWithoutRca = obs.findIndex((o) => !o.rootCause?.trim());
  const firstWithoutCapa = obs.findIndex((o) => !o.capaId);

  const rcaDoneCount = obs.filter((o) => !!o.rootCause?.trim()).length;
  const capaDoneCount = obs.filter((o) => !!o.capaId).length;
  const docsCount = event.responseDocuments?.length ?? 0;

  const rows: ReadinessRow[] = [
    {
      id: "rca",
      label: `Complete RCA for all observations (${rcaDoneCount} of ${totalObs})`,
      done: totalObs > 0 && rcaDoneCount === totalObs,
      targetTab: "investigation",
      targetObsIndex: firstWithoutRca >= 0 ? firstWithoutRca : undefined,
    },
    {
      id: "capa",
      label: `Raise CAPA for each observation (${capaDoneCount} of ${totalObs})`,
      done: totalObs > 0 && capaDoneCount === totalObs,
      targetTab: "investigation",
      targetObsIndex: firstWithoutCapa >= 0 ? firstWithoutCapa : undefined,
    },
    {
      id: "docs",
      label: `Attach response documents (${docsCount} attached)`,
      done: docsCount > 0,
      targetTab: "response",
    },
    {
      id: "draft",
      label: "Write response draft",
      done: (event.responseDraft?.trim().length ?? 0) > 0,
      targetTab: "response",
    },
    {
      id: "commitments",
      // First-class commitments — every commitment must be resolved (Complete
      // or Cancelled) before the response can be signed. Vacuously true when
      // there are no commitments (nothing to close).
      label: "Complete or close all commitments",
      done: event.commitments.every(
        (c) => c.status === "Complete" || c.status === "Cancelled",
      ),
      targetTab: "overview",
    },
  ];

  const doneCount = rows.filter((r) => r.done).length;
  return { rows, doneCount, total: rows.length };
}

/* ── Investigation step status helpers (R2 spec) ──────────────────
 *
 * The Investigation tab renders a per-observation 2-step strip
 * (Step 1: RCA, Step 2: CAPA). These helpers return the visual
 * status for each step. The "CAPA locked" UX (CAPA disabled until
 * RCA is complete) is NOT modelled here — that's the consuming
 * component's responsibility. These helpers only describe what the
 * step's own artefact looks like.
 */

export type InvestigationStepStatus = "pending" | "in_progress" | "complete";

export function getRcaStepStatus(obs: Observation): InvestigationStepStatus {
  if (obs.rootCause?.trim()) return "complete";
  if (obs.rcaMethod) return "in_progress";
  return "pending";
}

export function getCapaStepStatus(obs: Observation): InvestigationStepStatus {
  if (obs.capaId) return "complete";
  // "Ready" / "unlockable" maps to pending here; the UI gate decides
  // whether the user can act. The status itself only says "has CAPA
  // or not".
  return "pending";
}
