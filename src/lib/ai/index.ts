/**
 * AI feature gateway — the type contract every AI surface in the app codes
 * against, and a thin pass-through to the backend that implements it.
 *
 * ── What changed, and why ──────────────────────────────────────────
 * This module used to be mock-first. It shipped ~1,750 lines of fixture data
 * (src/lib/ai/mockData.ts: root-cause pools, a GxP validation rubric, a
 * regulatory watchlist, drift alerts, triage rules, sample 483 observations) to
 * every browser, and each function wrapped its backend call in a try/catch that
 * silently substituted that fixture on any failure.
 *
 * Two problems with that. First, it put AI business logic and GxP domain
 * content in client code. Second — and worse in a regulated tool — the CLIENT
 * decided when an answer was real: a backend outage produced confident-looking
 * compliance content with no server-side record that anything had degraded.
 *
 * All of it now lives in the AI service (app/fallbacks/). Each backend route
 * degrades deterministically on its own and stamps `source` so the UI can badge
 * a non-live answer. This file no longer decides anything: it calls, types the
 * result, and lets errors reach the caller's existing error state.
 *
 * Function signatures and return shapes are unchanged, so no calling surface
 * had to move.
 */

import {
  scanStageDocument,
  fetchRegulatoryIntelligence,
  fetchDeviationClusters,
  fetchDeviationRcaAnalysis,
  fetchDriftDetection,
  fetchResponseDraft,
  fetchRcaSuggestions,
  fetchCapaPrefill,
  fetchFindingTriage,
  fetchApprovalBrief,
  fetchReadinessGuidance,
  fetchReworkTasks,
  scanFda483Document,
} from "../aiBackend";
import type { DriftAlert } from "@/types/agi";
import type { InvestigationRCAMethod } from "@/constants/rcaMethods";

/**
 * Provenance of an AI result, as reported by the backend.
 *   "backend"  → a live model call produced it.
 *   "fallback" → the backend's deterministic result; its model call failed.
 * Pass straight to <AIBadge source={…}> — it greys out anything non-live.
 */
export type AiSource = "backend" | "fallback";

/* ── Feature A — RCA suggestions (method-shaped) ─────────────────── */

// Phase 1.5 — unified into the shared RCA-method constant.
export type RcaMethod = InvestigationRCAMethod;

/** 5 Why: 5 progressive Why answers leading to root cause. */
export interface FiveWhySuggestion {
  method: "5 Why";
  /** Provenance — see {@link AiSource}. Stamped per item because this feature's
   *  response is a bare list with no envelope to carry it. */
  source: AiSource;
  whys: [string, string, string, string, string]; // exactly 5 entries
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

/** Fishbone: 6 category candidates + root cause. */
export interface FishboneSuggestion {
  method: "Fishbone";
  /** Provenance — see {@link AiSource}. */
  source: AiSource;
  categories: {
    people: string;
    process: string;
    equipment: string;
    materials: string;
    environment: string;
    management: string;
  };
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

/** Fault Tree + Barrier Analysis: freeform root cause only. */
export interface FreeformSuggestion {
  method: "Fault Tree" | "Barrier Analysis";
  /** Provenance — see {@link AiSource}. */
  source: AiSource;
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

export type RcaSuggestion =
  | FiveWhySuggestion
  | FishboneSuggestion
  | FreeformSuggestion;

export async function getRcaSuggestions(
  method: RcaMethod,
  observationText: string,
  observationSeverity: string,
  siteContext: string,
): Promise<RcaSuggestion[]> {
  return fetchRcaSuggestions(
    method,
    observationText,
    observationSeverity,
    siteContext,
  );
}

/* ── Feature B — CAPA pre-fill ───────────────────────────────────── */

export interface CAPAPrefill {
  title: string;
  description: string;
  suggestedOwnerHint: string;
  suggestedDueDate: string; // ISO date
  reasoning: string;
  source: AiSource;
}

export async function getCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): Promise<CAPAPrefill> {
  return fetchCapaPrefill(observationText, rcaRootCause, observationSeverity);
}

/* ── Feature C — Response draft ──────────────────────────────────── */

export interface ResponseDraftObservation {
  number: number;
  text: string;
  severity: string;
  rootCause: string | null;
  capaRef: string | null;
}

export interface ResponseDraftEvent {
  reference: string;
  agency: string;
  site: string;
  inspectionDate: string;
  /** The responding company's legal name (the tenant's own name, NOT the
   *  vendor's). Omitted/blank → the draft carries a visible "[Company Name]"
   *  placeholder, because a letter addressed to a regulator must never be
   *  signed with a guessed company. */
  companyName?: string;
  observations: ResponseDraftObservation[];
}

export interface ResponseDraftResult {
  draft: string;
  characterCount: number;
  source: AiSource;
}

export async function getResponseDraft(
  event: ResponseDraftEvent,
): Promise<ResponseDraftResult> {
  return fetchResponseDraft(event);
}

/* ── Feature D — CSV validation Document Review ──────────────────── */
/**
 * "Document Review" AI agent. Pre-checks an uploaded CSV validation
 * document (IQ / OQ / PQ / etc.) against a validation rubric BEFORE QA
 * sees it, so the csv_val_lead can fix gaps in one pass instead of
 * bouncing through 2-4 rounds of manual QA review.
 *
 * Soft gate by design: findings are advisory. They never block the
 * upload or the "Submit for QA Review" action — they inform it.
 */

export type DocumentReviewSeverity = "high" | "medium" | "low";

export interface DocumentReviewFinding {
  /** Stable id so the UI can key list items + expansion state. */
  id: string;
  severity: DocumentReviewSeverity;
  /** One-line summary shown inline (e.g. "No signature block found…"). */
  title: string;
  /** Longer explanation + remediation shown when findings are expanded. */
  detail: string;
  /** Where in the document the issue sits (e.g. "Section 4.2"). */
  sectionRef?: string;
  /** Which rubric check produced the finding. */
  rubricItem: string;
}

export interface DocumentReviewResult {
  stageKey: string;
  fileName: string;
  /** ISO timestamp of when the scan completed. */
  scannedAt: string;
  /** Reported scan time for display ("Scanned in N seconds") — not wall-clock. */
  scanDurationSeconds: number;
  rubricVersion: string;
  findings: DocumentReviewFinding[];
  /** Set when the document yielded no reviewable text (scanned PDF, unsupported
   *  type, parse error). `findings` is then empty because the rubric scan never
   *  ran — this is NOT a clean pass, and the UI must not render it as one. */
  note?: string;
  /** Provenance so the UI can badge a non-live result. */
  source: AiSource;
}

export interface DocumentReviewInput {
  stageKey: string;
  stageLabel: string;
  systemName: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  /**
   * The freshly-uploaded File. The backend extracts its text server-side.
   */
  file?: File | null;
  /**
   * StageDocument id of an already-stored document. Used when `file` is
   * absent (a scan started from the document list rather than from the
   * upload itself) to pull the bytes back down from the download route.
   */
  documentId?: string | null;
}

function mapBackendSeverity(s: string): DocumentReviewSeverity {
  const v = (s || "").toLowerCase();
  if (v === "high" || v === "critical" || v === "major") return "high";
  if (v === "low" || v === "minor" || v === "info") return "low";
  return "medium";
}

/** Normalise the backend's `source` field; anything unrecognised is not live. */
function readSource(value: unknown): AiSource {
  return value === "backend" ? "backend" : "fallback";
}

/**
 * Pull an already-stored stage document's bytes back down so it can be
 * scanned. The upload path hands the live `File` straight to the backend, but
 * a review run from the document list (after a reload, or a re-scan) only has
 * the StageDocument id — /api/stage-documents/[id] is the same authenticated
 * download route the list already links to, so tenant scope, system
 * visibility and soft-delete are all enforced server-side.
 */
async function fetchStoredStageDocument(
  documentId: string,
  fileName: string,
  fileType?: string,
): Promise<File> {
  const res = await fetch(
    `/api/stage-documents/${encodeURIComponent(documentId)}`,
    { credentials: "same-origin" },
  );
  if (!res.ok) {
    // The route replies with a JSON {error} body on 401/404/410/500.
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      body?.error ?? `Could not load the stored document (HTTP ${res.status}).`,
    );
  }
  const blob = await res.blob();
  return new File([blob], fileName, {
    type: fileType || blob.type || "application/octet-stream",
  });
}

export async function getDocumentReview(
  input: DocumentReviewInput,
): Promise<DocumentReviewResult> {
  // Bytes come from the freshly-picked File on the upload path; a scan started
  // from the stored document list has no File and is re-fetched by id.
  const file =
    input.file ??
    (input.documentId
      ? await fetchStoredStageDocument(
          input.documentId,
          input.fileName,
          input.fileType,
        )
      : null);
  if (!file) {
    throw new Error("Document Review requires the uploaded file to scan.");
  }
  const dto = await scanStageDocument({
    file,
    stageKey: input.stageKey,
    stageLabel: input.stageLabel,
    systemName: input.systemName,
  });
  return {
    stageKey: dto.stage_key ?? input.stageKey,
    fileName: dto.file_name ?? input.fileName,
    scannedAt: dto.scanned_at ?? new Date().toISOString(),
    scanDurationSeconds:
      typeof dto.scan_duration_seconds === "number" ? dto.scan_duration_seconds : 0,
    rubricVersion: dto.rubric_version ?? "unknown",
    note: dto.note ?? undefined,
    source: readSource(dto.source),
    findings: (dto.findings ?? []).map((f, i) => ({
      id: `${input.stageKey}-be-${i}`,
      severity: mapBackendSeverity(f.severity),
      title: f.title,
      detail: f.detail,
      sectionRef: f.section_ref ?? undefined,
      rubricItem: f.rubric_item ?? "Validation rubric",
    })),
  };
}

/* ── Feature E — Regulatory Intelligence ─────────────────────────────
 * FDA/EMA guidance monitoring + change alerts. The agent watches external
 * regulatory publications, flags NEW requirements, and SUGGESTS compliance
 * alignment — it never interprets requirements or makes determinations
 * (that stays with Regulatory Affairs; see the AGI policy CANNOT-DO list). */

export type RegulatorySource = "FDA" | "EMA" | "ICH" | "MHRA" | "WHO";
export type RegulatoryImpact = "high" | "medium" | "low";
export type RegulatoryChangeType =
  | "New guidance"
  | "Revised guidance"
  | "Draft for comment"
  | "Withdrawn";

export interface RegulatoryGuidanceUpdate {
  /** Stable id so the UI can key list items + acknowledge state. */
  id: string;
  source: RegulatorySource;
  /** Agency document reference (e.g. "FDA-2025-D-3210"). */
  docRef: string;
  title: string;
  /** Publication date, ISO `YYYY-MM-DD`. */
  publishedDate: string;
  category: string;
  changeType: RegulatoryChangeType;
  impact: RegulatoryImpact;
  /** AI flag: introduces a NEW regulatory requirement (vs. a clarification). */
  isNewRequirement: boolean;
  summary: string;
  /** AI-SUGGESTED compliance-alignment action — advisory only; RA decides. */
  suggestedAlignment: string;
  /** Internal QMS areas the update touches (drives the affected-area chips). */
  affectedAreas: string[];
}

export interface RegulatoryIntelligenceResult {
  updates: RegulatoryGuidanceUpdate[];
  /** ISO timestamp of when the scan completed. */
  scannedAt: string;
  /** Provenance so the UI can badge a non-live result. */
  source: AiSource;
}

export async function getRegulatoryIntelligence(): Promise<RegulatoryIntelligenceResult> {
  return fetchRegulatoryIntelligence();
}

/* REMOVED — regulatoryAlertSummary().
 *
 * It returned counts over a hardcoded six-item guidance list, synchronously, and
 * the Dashboard AGI rail rendered them as "N new FDA/EMA regulatory requirements
 * flagged" — presenting a fixture as the result of a live agency scan, for every
 * tenant, forever.
 *
 * driftAlertSummary() was removed earlier for exactly this defect; this is the
 * twin the note in that comment pointed at. A real regulatory scan is
 * asynchronous (it reads agency guidance through an LLM), so it cannot be served
 * from a sync helper — use getRegulatoryIntelligence() from an effect, as the
 * Regulatory Intelligence page does. Do not reintroduce a sync fixture-backed
 * summary here.
 */

/* ── Feature F — Deviation Intelligence ──────────────────────────────
 * Analyses the tenant's OWN deviation history and clusters recurring
 * patterns (by area), surfacing high-frequency areas + a suggested root
 * cause per cluster. CAN DO: cluster, surface patterns, suggest root
 * causes, flag high-frequency areas. CANNOT DO: close deviations, approve
 * investigations, or make risk decisions (those stay with QA — see the AGI
 * policy). Unlike the other agents, this one takes the live deviation list
 * as input rather than producing external data. */

export interface DeviationClusterInput {
  id: string;
  reference: string;
  title: string;
  category: string;
  area: string;
  /** Accepts either casing ("Critical"/"critical"); the backend normalises. */
  severity: string;
  status: string;
}

export interface DeviationClusterMember {
  id: string;
  reference: string;
}

export interface DeviationCluster {
  /** Stable id (derived from the area) for list keys. */
  id: string;
  theme: string;
  area: string;
  /** Driver category — the highest-severity member's category. */
  category: string;
  count: number;
  /** True when the cluster crosses the high-frequency threshold (>= 3). */
  isHighFrequency: boolean;
  /** Category breakdown within the cluster, most-common first. */
  categoryChips: { label: string; count: number }[];
  severityMix: { critical: number; major: number; minor: number };
  members: DeviationClusterMember[];
  /** AI-SUGGESTED candidate root cause — advisory only; QA investigates. */
  suggestedRootCause: string;
  /** 0–100 heuristic derived from cluster SIZE alone (min(95, 50 + count*12)) —
   *  NOT the model's certainty in the root cause. Surfaced in the UI as
   *  "pattern strength" so it is never read as an AI confidence score. */
  confidence: number;
}

export interface DeviationIntelligenceResult {
  clusters: DeviationCluster[];
  /** Total deviations the agent actually analysed. */
  analyzedCount: number;
  /** Present ONLY when the backend capped the input (MAX_ANALYZE): how many
   *  deviations were sent. `analyzedCount` is then the risk-first subset that
   *  was analysed, and the UI warns that coverage was partial. Absent on every
   *  normal run. */
  suppliedCount?: number;
  /** Number of recurring-pattern clusters surfaced. */
  patternCount: number;
  scannedAt: string;
  source: AiSource;
}

export async function getDeviationIntelligence(
  deviations: DeviationClusterInput[],
): Promise<DeviationIntelligenceResult> {
  return fetchDeviationClusters(deviations);
}

/* ── Feature N — Deviation RCA Intelligence (per deviation) ──────────
 * Opened from the RCA section of a single deviation's detail view. Distinct
 * from Feature F above, which clusters the WHOLE register: this reads ONE
 * deviation in depth (description, immediate action, severity, area/category,
 * attached document names, any RCA text already written) plus a slice of that
 * tenant's similar past deviations, and returns investigation assist for it.
 *
 * CAN DO (AI-assisted): propose candidate root causes, name contributing
 * factors, recommend next investigative steps, draft candidate corrective /
 * preventive actions, and flag evidence the investigation is still missing.
 * CANNOT DO (human only): complete the investigation, decide whether a CAPA is
 * required, close the deviation. Every output is advisory and is applied to the
 * RCA form only on an explicit user click — never automatically. */

/** A past deviation offered to the agent for comparison. Reference/title only —
 *  no documents or personal data leave the app. */
export interface DeviationRcaHistoryItem {
  reference: string;
  title: string;
  area: string;
  category: string;
  severity: string;
  /** The recorded root cause, when that deviation's investigation completed. */
  rootCause: string;
}

/** Everything the investigator can see about the deviation under analysis. */
export interface DeviationRcaInput {
  /** Shapes the applyable draft — must be the method picked in the RCA form. */
  method: RcaMethod;
  reference: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  area: string;
  type: string;
  immediateAction: string;
  batchesAffected: string[];
  /** File NAMES only. The bytes never leave the app; the names still tell the
   *  agent what evidence exists and, by omission, what does not. */
  documentNames: string[];
  /** RCA text already entered, so the agent builds on it instead of ignoring it. */
  existingRootCause: string;
  history: DeviationRcaHistoryItem[];
}

export type DeviationRcaLikelihood = "High" | "Medium" | "Low";

export interface DeviationRcaRootCause {
  title: string;
  rationale: string;
  likelihood: DeviationRcaLikelihood;
  /** Specific details from the deviation that support this candidate. */
  evidence: string[];
}

export interface DeviationRcaFactor {
  /** Fishbone-style bucket (People / Process / Equipment / …). */
  category: string;
  factor: string;
}

export interface DeviationRcaRelated {
  reference: string;
  reason: string;
}

export interface DeviationRcaAnalysis {
  summary: string;
  /** 0–100 — the agent's confidence in the LEADING root cause. */
  confidence: number;
  probableRootCauses: DeviationRcaRootCause[];
  contributingFactors: DeviationRcaFactor[];
  recommendations: string[];
  correctiveActions: string[];
  preventiveActions: string[];
  /** Evidence/information the investigation still needs. Empty = nothing flagged. */
  missingInformation: string[];
  /** Only references the agent was actually shown — never fabricated. */
  relatedDeviations: DeviationRcaRelated[];
  /** The leading analysis shaped into the RCA form's method. This is the ONLY
   *  part that can be written into the investigator's fields, and only on an
   *  explicit "Apply" click. */
  draft: RcaSuggestion;
  method: RcaMethod;
  analyzedHistoryCount: number;
  scannedAt: string;
  source: AiSource;
}

export async function getDeviationRcaAnalysis(
  input: DeviationRcaInput,
): Promise<DeviationRcaAnalysis> {
  return fetchDeviationRcaAnalysis(input);
}

/* ── Feature H — Drift Detection ─────────────────────────────────────
 * Continuous monitoring of configuration changes, access creep, and audit-
 * trail coverage across validated systems. CAN DO: monitor config changes,
 * detect access changes, flag audit-trail coverage drops, alert on system
 * changes. CANNOT DO: change configurations, restore access, or make IT
 * security decisions (those stay human — see the AGI policy). Alerts are
 * read-only signals; a human investigates and acts. */

export interface DriftDetectionResult {
  alerts: DriftAlert[];
  scannedAt: string;
  /** Set when the scan could not run. `alerts` is then empty because nothing
   *  was assessed — this is NOT a clean result, and the UI must not render it
   *  as one. A drift alert is a claim about the tenant's own validated systems,
   *  so the backend reports an outage rather than substituting a fixture. */
  note?: string;
  source: AiSource;
}

export async function getDriftDetection(): Promise<DriftDetectionResult> {
  return fetchDriftDetection();
}

/* REMOVED — driftAlertSummary().
 *
 * It counted a STATIC DRIFT_ALERTS fixture and returned it synchronously,
 * never calling the backend. Its only caller (the Dashboard AGI Insights rail)
 * therefore told every tenant "N critical system drift alerts detected" from a
 * hardcoded array — a fabricated claim about their validated systems.
 *
 * The Dashboard now derives that insight from the tenant's real system records
 * via isValidationDrift (@/lib/kpi). Real drift analysis is asynchronous by
 * nature (it reads the audit trail through an LLM), so it cannot be served from
 * a sync helper — use getDriftDetection() from an effect, as the CSV/CSA page
 * does. Do not reintroduce a sync fixture-backed summary here.
 */

/* ── Feature I — Finding Triage (Gap Assessment) ─────────────────────
 * When a compliance gap is reported, the user must pick the right regulatory
 * framework, classify severity, and articulate the risk + missing evidence.
 * This agent triages the free-text requirement: it maps the finding to a
 * framework + clause, suggests a severity (Critical/High/Low), drafts a risk
 * summary, lists evidence gaps, and proposes a CAPA title.
 *
 * CAN DO: classify framework/severity, summarise risk, flag evidence gaps,
 * suggest a CAPA title. CANNOT DO: create the finding, lock a classification,
 * or raise the CAPA — every field is a suggestion the human reviews and edits
 * before saving (severity/area/framework lock only AFTER human-confirmed
 * create, so the suggestion is pre-commitment by design). */

export type FindingTriageSeverity = "Critical" | "High" | "Low";

export interface FindingTriageResult {
  /** Framework KEY (p210, p11, annex11, …) — selects the modal's dropdown. */
  framework: string;
  /** Human label for the key (e.g. "Part 11"). */
  frameworkLabel: string;
  /** Most specific clause, e.g. "21 CFR 211.194(a)" / "Annex 11 §9". */
  clause: string;
  severity: FindingTriageSeverity;
  /** One-line justification for the severity. */
  severityRationale: string;
  /** 2-3 sentence compliance-risk summary (fills the Finding.agiSummary slot). */
  agiSummary: string;
  /** Records/documents needed to close the gap (advisory chips). */
  evidenceGaps: string[];
  /** Proposed corrective-action title for a follow-on CAPA. */
  suggestedCapaTitle: string;
  /** 0–100 heuristic confidence. */
  confidence: number;
  source: AiSource;
}

export async function classifyFinding(
  requirement: string,
  area: string,
  purpose: string,
  activeFrameworks: string[],
): Promise<FindingTriageResult> {
  return fetchFindingTriage(requirement, area, purpose, activeFrameworks);
}

/* ── Feature J — CAPA Approval Brief (reviewer assist) ────────────────
 * When a QA Head / Regulatory Affairs reviewer is about to APPROVE a CAPA,
 * this agent summarises the record on one screen: a plain overview, what looks
 * solid, and what to scrutinise before signing.
 *
 * CAN DO: summarise the CAPA, surface strengths, flag what to verify. CANNOT
 * DO: approve/reject, recommend a verdict, change status, or replace the QA
 * Head sign-off (see the AGI policy). Read-only support — every output is
 * advisory and the e-signed decision stays with the human. */

export interface ApprovalBriefInput {
  reference: string;
  title: string;
  description: string;
  risk: string;
  /** Human-readable root cause (capa.rca). */
  rootCause: string;
  /** Free-text corrective actions summary (capa.correctiveActions). */
  correctiveActions: string;
  rcaApproved: boolean;
  /** "aligned" | "cosmetic" | "needs_review" | "" (not reviewed). */
  alignmentStatus: string;
  approvalsCollected: number;
  approvalsRequired: number;
  unresolvedConcerns: number;
}

export interface ApprovalBriefResult {
  /** 2-3 sentence plain-language summary. */
  overview: string;
  /** Aspects that look solid. */
  strengths: string[];
  /** Things the reviewer should scrutinise before signing (gate facts first). */
  watchOuts: string[];
  /** ISO timestamp of when the brief was generated. */
  generatedAt: string;
  source: AiSource;
}

export async function getApprovalBrief(
  input: ApprovalBriefInput,
): Promise<ApprovalBriefResult> {
  return fetchApprovalBrief(input);
}

/* ── Feature K — CAPA Readiness Pre-flight Copilot ────────────────────
 * While a CAPA is being authored (open / in_progress), getCAPAReadiness()
 * computes which submission conditions are still unmet. This agent turns that
 * terse, computed list into plain-language coaching: for each unmet condition,
 * WHY it matters and HOW to fix it, plus a suggested order to tackle them.
 *
 * CAN DO: explain blockers, suggest fix steps + order. CANNOT DO: submit,
 * approve, close, change status, or mark a condition met (see the AGI policy).
 * Only REAL user actions flip readiness flags, and submitForReview re-enforces
 * getCAPAReadiness() server-side — the copilot can coach but never bypass it.
 *
 * Grounded by design: the unmet list is COMPUTED and sent in, so the model
 * writes prose only for the exact keys that are genuinely unmet — it can't
 * invent or omit a blocker. */

export interface ReadinessUnmetCondition {
  /** ReadinessKey: rca | alignment | diGate | actions | evidence | criteria. */
  key: string;
  label: string;
  detail?: string;
}

export interface ReadinessGuidanceInput {
  title: string;
  risk: string;
  /** Human-readable root cause (capa.rca), for context. */
  rootCause: string;
  /** The computed unmet conditions from getCAPAReadiness(). */
  unmet: ReadinessUnmetCondition[];
}

export interface ReadinessGuidanceItem {
  /** Echoes the readiness key so the UI can map back to its tab. */
  key: string;
  /** One sentence: why this condition matters. */
  why: string;
  /** One sentence: the concrete action that resolves it. */
  how: string;
}

export interface ReadinessGuidanceResult {
  /** One encouraging sentence: how many items remain + the first step. */
  summary: string;
  /** Keys in the suggested order to tackle (canonical gate order). */
  priorityOrder: string[];
  items: ReadinessGuidanceItem[];
  generatedAt: string;
  source: AiSource;
}

export async function getReadinessGuidance(
  input: ReadinessGuidanceInput,
): Promise<ReadinessGuidanceResult> {
  return fetchReadinessGuidance(input);
}

/* ── Feature M — FDA 483 PDF Auto-Extraction ─────────────────────────
 * Upload a digital (text-selectable) FDA 483 PDF → the agent extracts each
 * inspectional observation VERBATIM + a suggested severity/area/regulation,
 * so QA reviews + bulk-imports instead of typing each observation by hand.
 *
 * CAN DO: read the PDF, extract observation text, suggest severity/area, flag
 * a confidence + source page. CANNOT DO: create the observations itself, lock a
 * severity, or raise a CAPA — every field is a suggestion the human reviews and
 * edits before the human-confirmed bulk create (which is Part 11 audited).
 *
 * Scanned/image PDFs yield no text in Phase 1 → empty list + a `note` (OCR is a
 * Phase-2 addition). An extraction that could not run returns the same shape:
 * the backend never substitutes sample observations, because they would be
 * attributed to the user's own Form 483 and are one click from a Part 11 record. */

/** Severity the extraction UI + CreateObservationSchema accept. */
export type ExtractedSeverity = "Critical" | "High" | "Medium" | "Low";

export interface ExtractedObservation {
  /** Observation number as printed on the 483 (1, 2, 3, …). */
  number: number;
  /** Verbatim observation wording. */
  text: string;
  regulation: string;
  area: string;
  severity: ExtractedSeverity;
  /** 1-based page the observation was found on (0 when unknown). */
  sourcePage: number;
  /** 0–100 extraction confidence. */
  confidence: number;
}

export interface Fda483ExtractionResult {
  observations: ExtractedObservation[];
  fileName: string;
  pageCount: number;
  /** Non-null when nothing extractable was found (scanned PDF, or the
   *  extraction service was unavailable). */
  note: string | null;
  extractedAt: string;
  source: AiSource;
}

export interface Fda483ExtractionInput {
  /** The uploaded PDF. The backend extracts its text server-side. */
  file?: File | null;
  fileName: string;
  inspectionReference: string;
  facility: string;
}

function normalizeExtractedSeverity(s: string | null | undefined): ExtractedSeverity {
  const v = (s || "").toLowerCase();
  if (v.startsWith("crit")) return "Critical";
  if (v === "high" || v === "major") return "High";
  if (v === "low" || v === "minor") return "Low";
  return "Medium";
}

export async function getFda483Extraction(
  input: Fda483ExtractionInput,
): Promise<Fda483ExtractionResult> {
  if (!input.file) {
    throw new Error("FDA 483 extraction requires the uploaded file to scan.");
  }
  const dto = await scanFda483Document({
    file: input.file,
    inspectionReference: input.inspectionReference,
    facility: input.facility,
  });
  return {
    fileName: dto.file_name ?? input.fileName,
    pageCount: typeof dto.page_count === "number" ? dto.page_count : 0,
    note: dto.note ?? null,
    extractedAt: dto.extracted_at ?? new Date().toISOString(),
    source: readSource(dto.source),
    observations: (dto.observations ?? []).map((o, i) => ({
      number: typeof o.number === "number" && o.number > 0 ? o.number : i + 1,
      text: o.text ?? "",
      regulation: o.regulation ?? "",
      area: o.area ?? "",
      severity: normalizeExtractedSeverity(o.severity),
      sourcePage:
        typeof o.source_page === "number" && o.source_page > 0 ? o.source_page : 0,
      confidence:
        typeof o.confidence === "number" ? Math.max(0, Math.min(100, o.confidence)) : 0,
    })),
  };
}

/* ── Feature O — Rework Task Suggestions (CSV/CSA validation) ─────────
 * QA rejects a validation stage document; this turns their free-text feedback
 * (plus any Document Review findings already on the stage) into discrete,
 * assignable rework tasks, each traced back to the rubric item it came from.
 *
 * CAN DO: propose one instruction per issue and name its rubric trace. CANNOT
 * DO: create, assign, or close a task — the Validation Lead edits every
 * suggestion and assigns it explicitly.
 *
 * This used to run in the browser: `src/lib/ai/reworkTasks.ts` was a 10-entry
 * keyword regex table sitting behind a Sparkles button labelled "Suggest tasks
 * (AI)" with a spinner state. It is now a real model call, and that keyword
 * table is the backend's fallback (app/fallbacks/rework.py). */

/** One Document Review finding the suggester can lift directly into a task. */
export interface ReworkReviewFinding {
  title: string;
  rubricItem?: string;
}

export interface ReworkTasksInput {
  rejectionReason: string;
  stageLabel?: string;
  systemName?: string;
  findings?: ReworkReviewFinding[];
}

export interface ReworkTaskSuggestion {
  /** The instruction shown to (and editable by) the Lead before assigning. */
  message: string;
  /** Rubric item / rejection point this task traces back to. */
  findingRef?: string | null;
}

export interface ReworkTasksResult {
  suggestions: ReworkTaskSuggestion[];
  source: AiSource;
}

export async function getReworkTaskSuggestions(
  input: ReworkTasksInput,
): Promise<ReworkTasksResult> {
  return fetchReworkTasks(input);
}
