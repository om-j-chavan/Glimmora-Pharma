/**
 * AI feature gateway. Mocks now; real backend later
 * (OpenAI / Anthropic / existing Python service).
 *
 * When wiring real backend:
 *   1. Set MOCK_AI_RESPONSES = false
 *   2. Implement the real fetch in each function below
 *   3. The function signatures and return shapes MUST
 *      remain identical
 *
 * The mocks intentionally produce deterministic,
 * observation-aware data so demos feel responsive
 * without being random.
 */

import {
  mockRcaSuggestions,
  mockCapaPrefill,
  mockResponseDraft,
  mockDocumentReview,
  mockRegulatoryIntelligence,
  buildRegulatoryUpdates,
  mockDeviationIntelligence,
  mockDriftDetection,
  buildDriftAlerts,
  mockFindingTriage,
} from "./mockData";
import {
  scanStageDocument,
  fetchRegulatoryIntelligence,
  fetchDeviationClusters,
  fetchDriftDetection,
  fetchResponseDraft,
  fetchRcaSuggestions,
  fetchCapaPrefill,
  fetchFindingTriage,
} from "../aiBackend";
import type { DriftAlert } from "@/types/agi";
import type { InvestigationRCAMethod } from "@/constants/rcaMethods";

/**
 * Per-feature mock switches. A feature serves real backend data when its flag
 * is `false`. Features A/B/C (RCA suggestions, CAPA pre-fill, FDA-483 response
 * draft) have no real backend yet, so they stay mocked. D/E/F/G/H are wired to
 * the FastAPI backend (see src/lib/aiBackend.ts + the matching routers).
 *
 * Robustness contract: each real branch falls back to the deterministic mock
 * if the backend call throws, so an advisory AGI surface never crashes its
 * page — it degrades to the stable demo data and logs a warning. (The mock's
 * `source: "mock"` badge then tells you the data is not live.)
 */
export const AI_MOCK = {
  rcaSuggestions: false, // Feature A — POST /api/v1/rca-suggestions/generate
  capaPrefill: false, // Feature B — POST /api/v1/capa-prefill/generate
  responseDraft: false, // Feature C — POST /api/v1/response-draft/generate
  documentReview: false, // Feature D — POST /api/v1/document-review/scan
  regulatoryIntelligence: false, // Feature E — GET  /api/v1/regulatory-intelligence/scan
  deviationIntelligence: false, // Feature F — POST /api/v1/deviation-intelligence/analyze
  driftDetection: false, // Feature H — GET  /api/v1/drift-detection/scan
  findingTriage: false, // Feature I — POST /api/v1/finding-triage/classify
} as const;

/**
 * @deprecated Legacy global switch. Retained only because external docs/tests
 * still reference it; new code reads the per-feature flags in {@link AI_MOCK}.
 * Kept `true` so any straggler still reading it stays safely mocked.
 */
export const MOCK_AI_RESPONSES = true;

function logMockUsage(featureName: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[mock-ai] ${featureName} served from mock. ` +
        `Set MOCK_AI_RESPONSES=false to use real backend.`,
    );
  }
}

/** Small latency shim so the demo's loading states are actually visible. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Feature A — RCA suggestions (method-shaped) ─────────────────── */

// Phase 1.5 — unified into the shared RCA-method constant.
export type RcaMethod = InvestigationRCAMethod;

/** 5 Why: 5 progressive Why answers leading to root cause. */
export interface FiveWhySuggestion {
  method: "5 Why";
  whys: [string, string, string, string, string]; // exactly 5 entries
  rootCause: string;
  confidence: number;
  supportingFindings: Array<{ ref: string; similarity: number }>;
}

/** Fishbone: 6 category candidates + root cause. */
export interface FishboneSuggestion {
  method: "Fishbone";
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
  if (AI_MOCK.rcaSuggestions) {
    logMockUsage("getRcaSuggestions");
    // Modest latency so the LOADING panel state is demoable.
    await delay(750);
    return mockRcaSuggestions(method, observationText);
  }
  try {
    return await fetchRcaSuggestions(
      method,
      observationText,
      observationSeverity,
      siteContext,
    );
  } catch (err) {
    console.error(
      "[ai] getRcaSuggestions: backend failed, falling back to mock.",
      err,
    );
    return mockRcaSuggestions(method, observationText);
  }
}

/* ── Feature B — CAPA pre-fill ───────────────────────────────────── */

export interface CAPAPrefill {
  title: string;
  description: string;
  suggestedOwnerHint: string;
  suggestedDueDate: string; // ISO date
  reasoning: string;
}

export async function getCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): Promise<CAPAPrefill> {
  if (AI_MOCK.capaPrefill) {
    logMockUsage("getCapaPrefill");
    await delay(600);
    return mockCapaPrefill(observationText, rcaRootCause, observationSeverity);
  }
  try {
    return await fetchCapaPrefill(
      observationText,
      rcaRootCause,
      observationSeverity,
    );
  } catch (err) {
    console.error(
      "[ai] getCapaPrefill: backend failed, falling back to mock.",
      err,
    );
    return mockCapaPrefill(observationText, rcaRootCause, observationSeverity);
  }
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
  observations: ResponseDraftObservation[];
}

export async function getResponseDraft(
  event: ResponseDraftEvent,
): Promise<{ draft: string; characterCount: number }> {
  if (AI_MOCK.responseDraft) {
    logMockUsage("getResponseDraft");
    // Artificial 1.5s delay mirrors real LLM latency (~1-3s).
    await delay(1500);
    return mockResponseDraft(event);
  }
  try {
    return await fetchResponseDraft(event);
  } catch (err) {
    console.error(
      "[ai] getResponseDraft: backend failed, falling back to mock.",
      err,
    );
    return mockResponseDraft(event);
  }
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
  /** Provenance so the UI can badge mock vs real-backend results. */
  source: "mock" | "backend";
}

export interface DocumentReviewInput {
  stageKey: string;
  stageLabel: string;
  systemName: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  /**
   * The freshly-uploaded File. Required for the real backend (it extracts
   * text server-side); the mock ignores the bytes and derives findings
   * deterministically from the filename + stage.
   */
  file?: File | null;
  /** AI access token for the real backend; ignored by the mock. */
  token?: string | null;
}

function mapBackendSeverity(s: string): DocumentReviewSeverity {
  const v = (s || "").toLowerCase();
  if (v === "high" || v === "critical" || v === "major") return "high";
  if (v === "low" || v === "minor" || v === "info") return "low";
  return "medium";
}

export async function getDocumentReview(
  input: DocumentReviewInput,
): Promise<DocumentReviewResult> {
  if (AI_MOCK.documentReview) {
    logMockUsage("getDocumentReview");
    // ~1.1s shim so the "Scanning…" state is visible. The *reported*
    // scan duration in the result is a separate, larger number for copy.
    await delay(1100);
    return mockDocumentReview(input);
  }

  // Real backend: extract text server-side + score against the rubric.
  // Identical return shape to the mock so flipping MOCK_AI_RESPONSES is
  // the only change required.
  if (!input.file) {
    throw new Error("Document Review requires the uploaded file to scan.");
  }
  const dto = await scanStageDocument(
    {
      file: input.file,
      stageKey: input.stageKey,
      stageLabel: input.stageLabel,
      systemName: input.systemName,
    },
    input.token ?? "",
  );
  return {
    stageKey: dto.stage_key ?? input.stageKey,
    fileName: dto.file_name ?? input.fileName,
    scannedAt: dto.scanned_at ?? new Date().toISOString(),
    scanDurationSeconds:
      typeof dto.scan_duration_seconds === "number" ? dto.scan_duration_seconds : 0,
    rubricVersion: dto.rubric_version ?? "unknown",
    source: "backend",
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
 * (that stays with Regulatory Affairs; see the AGI policy CANNOT-DO list).
 *
 * To wire a real backend later: set MOCK_AI_RESPONSES=false and implement
 * the fetch (e.g. an RSS/agency-feed scraper + LLM summariser) inside
 * getRegulatoryIntelligence. The return shape MUST stay identical so the
 * module page + dashboard alert keep working unchanged. */

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
  /** Provenance so the UI can badge mock vs real-backend results. */
  source: "mock" | "backend";
}

export async function getRegulatoryIntelligence(): Promise<RegulatoryIntelligenceResult> {
  if (AI_MOCK.regulatoryIntelligence) {
    logMockUsage("getRegulatoryIntelligence");
    // ~1.4s shim so the "Scanning agency feeds…" state is visible.
    await delay(1400);
    return mockRegulatoryIntelligence();
  }
  try {
    return await fetchRegulatoryIntelligence();
  } catch (err) {
    console.error(
      "[ai] getRegulatoryIntelligence: backend failed, falling back to mock.",
      err,
    );
    return mockRegulatoryIntelligence();
  }
}

/**
 * Synchronous, deterministic snapshot for surfaces that cannot await — the
 * Dashboard AGI Insights computes its alert counts inline during render.
 * Returns the same underlying data as getRegulatoryIntelligence(), minus the
 * latency shim and the timestamp.
 */
export function regulatoryAlertSummary(): {
  total: number;
  newRequirements: number;
  highImpact: number;
} {
  const updates = buildRegulatoryUpdates();
  return {
    total: updates.length,
    newRequirements: updates.filter((u) => u.isNewRequirement).length,
    highImpact: updates.filter((u) => u.impact === "high").length,
  };
}

/* ── Feature F — Deviation Intelligence ──────────────────────────────
 * Analyses the tenant's OWN deviation history and clusters recurring
 * patterns (by area), surfacing high-frequency areas + a suggested root
 * cause per cluster. CAN DO: cluster, surface patterns, suggest root
 * causes, flag high-frequency areas. CANNOT DO: close deviations, approve
 * investigations, or make risk decisions (those stay with QA — see the AGI
 * policy). Unlike the other agents, this one takes the live deviation list
 * as input rather than producing external data.
 *
 * To wire a real backend later: set MOCK_AI_RESPONSES=false and implement
 * the clustering (e.g. embeddings + density clustering + an LLM root-cause
 * summariser). The return shape MUST stay identical. */

export interface DeviationClusterInput {
  id: string;
  reference: string;
  title: string;
  category: string;
  area: string;
  /** Accepts either casing ("Critical"/"critical"); the mock normalises. */
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
  /** 0–100 heuristic confidence (scales with cluster size). */
  confidence: number;
}

export interface DeviationIntelligenceResult {
  clusters: DeviationCluster[];
  /** Total deviations the agent analysed. */
  analyzedCount: number;
  /** Number of recurring-pattern clusters surfaced. */
  patternCount: number;
  scannedAt: string;
  source: "mock" | "backend";
}

export async function getDeviationIntelligence(
  deviations: DeviationClusterInput[],
): Promise<DeviationIntelligenceResult> {
  if (AI_MOCK.deviationIntelligence) {
    logMockUsage("getDeviationIntelligence");
    // ~0.9s shim so the "Analysing deviation history…" state is visible.
    await delay(900);
    return mockDeviationIntelligence(deviations);
  }
  try {
    return await fetchDeviationClusters(deviations);
  } catch (err) {
    console.error(
      "[ai] getDeviationIntelligence: backend failed, falling back to mock.",
      err,
    );
    return mockDeviationIntelligence(deviations);
  }
}

/* ── Feature H — Drift Detection ─────────────────────────────────────
 * Continuous monitoring of configuration changes, access creep, and audit-
 * trail coverage across validated systems. CAN DO: monitor config changes,
 * detect access changes, flag audit-trail coverage drops, alert on system
 * changes. CANNOT DO: change configurations, restore access, or make IT
 * security decisions (those stay human — see the AGI policy). Alerts are
 * read-only signals; a human investigates and acts.
 *
 * Reuses the existing DriftAlert shape (@/types/agi). To wire a real backend:
 * set MOCK_AI_RESPONSES=false and stream alerts from a config/access/audit
 * monitor (e.g. diff validated baselines, watch IAM + audit-trail flags) —
 * the return shape MUST stay identical so the UI needs no changes. */

export interface DriftDetectionResult {
  alerts: DriftAlert[];
  scannedAt: string;
  source: "mock" | "backend";
}

export async function getDriftDetection(): Promise<DriftDetectionResult> {
  if (AI_MOCK.driftDetection) {
    logMockUsage("getDriftDetection");
    // ~1.0s shim so the "Scanning systems for drift…" state is visible.
    await delay(1000);
    return mockDriftDetection();
  }
  try {
    return await fetchDriftDetection();
  } catch (err) {
    console.error(
      "[ai] getDriftDetection: backend failed, falling back to mock.",
      err,
    );
    return mockDriftDetection();
  }
}

/**
 * Synchronous, deterministic snapshot for the Dashboard AGI Insights (which
 * computes alert counts inline during render). Same data the async
 * getDriftDetection() returns, minus the latency shim.
 */
export function driftAlertSummary(): {
  total: number;
  critical: number;
  auditTrail: number;
} {
  const alerts = buildDriftAlerts();
  return {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "Critical").length,
    auditTrail: alerts.filter((a) => a.type === "Audit Trail Anomaly").length,
  };
}

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
 * create, so the suggestion is pre-commitment by design).
 *
 * Real backend: POST /api/v1/finding-triage/classify (LLM picks framework +
 * clause from the tenant's active frameworks; Python coerces the enums). On any
 * backend error this falls back to the deterministic mock so the modal never
 * breaks — the `source: "mock"` badge then signals the data is not live. */

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
  source: "mock" | "backend";
}

export async function classifyFinding(
  requirement: string,
  area: string,
  purpose: string,
  activeFrameworks: string[],
): Promise<FindingTriageResult> {
  if (AI_MOCK.findingTriage) {
    logMockUsage("classifyFinding");
    // ~0.9s shim so the "Analysing…" state is visible.
    await delay(900);
    return mockFindingTriage(requirement, area, purpose, activeFrameworks);
  }
  try {
    return await fetchFindingTriage(requirement, area, purpose, activeFrameworks);
  } catch (err) {
    console.error(
      "[ai] classifyFinding: backend failed, falling back to mock.",
      err,
    );
    return mockFindingTriage(requirement, area, purpose, activeFrameworks);
  }
}
