/**
 * Unified, typed browser client for the AI backend.
 *
 * One function per operation. Every call goes to the same-origin
 * /api/ai-proxy route, which checks the caller's session and attaches the
 * upstream access token server-side — so no function here takes, reads, or
 * stores a credential. (They used to take a `token` argument that the browser
 * pulled out of Redux; that is gone, along with the token itself.)
 *
 * Re-exports the aiChat (chat/voice) helpers so callers only need this module.
 *
 * Every call goes through `request()` which logs:
 *   [aiBackend] METHOD /path → sending
 *   [aiBackend] METHOD /path ✓ status (Xms)   on success
 *   [aiBackend] METHOD /path ✗ status (Xms) — detail   on failure
 */

export {
  AI_API_BASE,
  AiAuthError,
  generateCustomerId,
  generateUserId,
  type AiSignupRequest,
  type AiAuthResponse,
} from "./aiAuth";

export {
  aiChatSend,
  aiAssistantSend,
  aiVoiceChat,
  aiVoiceTranscribe,
  aiVoiceSpeak,
  aiHealth,
  aiVoiceHealth,
  AiChatError,
  type ChatMessage,
  type ChatResponse,
  type AssistantResponse,
  type AssistantRoute,
} from "./aiChat";

import { AI_API_BASE } from "./aiAuth";

// Type-only imports of the gateway result shapes. These are erased at compile
// time, so they do NOT create a runtime import cycle with ./ai (which imports
// the fetch* functions below from this module).
import type {
  RegulatoryIntelligenceResult,
  DeviationClusterInput,
  DeviationIntelligenceResult,
  DeviationRcaInput,
  DeviationRcaAnalysis,
  DriftDetectionResult,
  ResponseDraftEvent,
  ResponseDraftResult,
  RcaMethod,
  RcaSuggestion,
  CAPAPrefill,
  FindingTriageResult,
  ApprovalBriefInput,
  ApprovalBriefResult,
  ReadinessGuidanceInput,
  ReadinessGuidanceResult,
  ReworkTasksInput,
  ReworkTasksResult,
} from "./ai";

/* ── Error type ────────────────────────────────────────────────── */

export class AiBackendError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function flattenDetail(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const d = (parsed as { detail?: unknown }).detail;
    if (Array.isArray(d)) {
      return d.map((it) => {
        if (it && typeof it === "object") {
          const x = it as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(x.loc) ? x.loc.slice(1).join(".") : "?";
          return `${field}: ${x.msg ?? "invalid"}`;
        }
        return String(it);
      }).join("; ");
    }
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      const o = d as { error?: string; message?: string; incomplete_fields?: unknown };
      const parts: string[] = [];
      if (typeof o.error === "string") parts.push(o.error);
      if (typeof o.message === "string" && o.message !== o.error) parts.push(o.message);
      if (Array.isArray(o.incomplete_fields) && o.incomplete_fields.length) {
        parts.push(o.incomplete_fields.map((s) => String(s)).join("; "));
      }
      if (parts.length) return parts.join(" — ");
    }
  }
  return `Request failed (${status})`;
}

interface RequestOpts extends Omit<RequestInit, "body" | "headers"> {
  jsonBody?: unknown;
  formBody?: FormData;
  /** Statuses to log as info instead of error (e.g. 404 from by-capa lookups before a stage is submitted). */
  silentStatuses?: number[];
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { jsonBody, formBody, silentStatuses, ...rest } = opts;
  const method = rest.method ?? "GET";
  const tag = `[aiBackend] ${method} ${path}`;
  const headers = new Headers();
  if (jsonBody !== undefined) headers.set("Content-Type", "application/json");
  // No auth header: the proxy attaches it. See app/api/ai-proxy/[...path]/route.ts.
  const body = jsonBody !== undefined ? JSON.stringify(jsonBody) : formBody;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  let res: Response;
  try {
    res = await fetch(`${AI_API_BASE}${path}`, { ...rest, headers, body, credentials: "same-origin" });
  } catch (err) {
    console.error(`${tag} ✗ network error`, err);
    throw err;
  }
  const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const detail = flattenDetail(parsed, res.status);
    const isSilent = silentStatuses?.includes(res.status);
    if (isSilent) {
      console.info(`${tag} ○ ${res.status} (${ms}ms) — ${detail}`);
    } else {
      console.error(`${tag} ✗ ${res.status} (${ms}ms) — ${detail}`, parsed);
    }
    throw new AiBackendError(res.status, detail, parsed);
  }
  console.info(`${tag} ✓ ${res.status} (${ms}ms)`, parsed);
  return parsed as T;
}

/* ══════════════════════════════════════════════════════════════ */
/* REMOVED — the CAPA lifecycle transport                         */
/* ══════════════════════════════════════════════════════════════ */
/**
 * capaCreate / capaListAll / capaListByCustomer / capaStatus /
 * capaDismissAlert / rcaSubmit / rcaByCapa / rcaStatus / actionPlanSubmit /
 * actionPlanByCapa / actionPlanStatus / monitoringCheck / monitoringByCapa /
 * monitoringStatus / effectivenessCheck / effectivenessByCapa /
 * effectivenessStatus / closureInitiate / closureByCapa / closureStatus /
 * usersList — and the SimilarCAPA / CAPACreateResponse / RCACreateRequest / …
 * types that went with them.
 *
 * They addressed a SECOND CAPA system of record inside the AI service, which
 * ran its own RCA → action plan → monitoring → effectiveness → closure
 * lifecycle and never synchronised back to the Prisma CAPA these screens
 * actually show. Inside it, an LLM produced the effectiveness score and the
 * flag that closed a regulated record, no submit endpoint carried a role check,
 * and the "electronic signature" was any non-blank string.
 *
 * Prisma is the system of record. CAPA lifecycle writes go through the server
 * actions in src/actions/capas/, which carry the authorization, readiness gates,
 * Part 11 signing and audit trail. The one genuinely useful piece of the old
 * flow — recurrence analysis — is now a stateless call to
 * /api/ai/capa-recurrence, grounded in the tenant's own closed CAPAs.
 *
 * Do not reintroduce a CAPA write path here.
 */

/* ══════════════════════════════════════════════════════════════ */
/* AI audit trail                                                 */
/* ══════════════════════════════════════════════════════════════ */

export interface AiAuditRow {
  audit_id: string;
  request_id: string | null;
  action_type: string;
  feature_id: string;
  record_id: string;
  username: string;
  model: string | null;
  prompt_version: string | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  status: string;
  timestamp: string;
}

export interface AiAuditPage {
  total: number;
  limit: number;
  offset: number;
  audit_logs: AiAuditRow[];
}

/** Tenant-scoped AI activity. Scoping is enforced upstream from the signed
 *  token — these filters only narrow what the caller may already see. */
export function aiAuditList(params: {
  featureId?: string;
  actionType?: string;
  username?: string;
  status?: string;
  since?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AiAuditPage> {
  const q = new URLSearchParams();
  if (params.featureId) q.set("feature_id", params.featureId);
  if (params.actionType) q.set("action_type", params.actionType);
  if (params.username) q.set("username", params.username);
  if (params.status) q.set("status", params.status);
  if (params.since) q.set("since", params.since);
  q.set("limit", String(params.limit ?? 100));
  q.set("offset", String(params.offset ?? 0));
  return request<AiAuditPage>(`/api/v1/audit/all?${q.toString()}`, { method: "GET" });
}

/** Full input/output metadata for one application record's AI activity. */
export function aiAuditForRecord(recordId: string) {
  return request<{ record_id: string; total: number; audit_logs: unknown[] }>(
    `/api/v1/audit/record/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
}

export interface AiUsageRow {
  feature_id: string;
  model: string | null;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  avg_latency_ms: number;
}

/** Per-feature call counts, token totals and mean latency for this tenant. */
export function aiUsage(since?: string): Promise<{ usage: AiUsageRow[] }> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return request<{ usage: AiUsageRow[] }>(`/api/v1/audit/usage${q}`, { method: "GET" });
}

/* ══════════════════════════════════════════════════════════════ */
/* Document Review (CSV validation stage docs)                    */
/* ══════════════════════════════════════════════════════════════ */

/** One rubric finding as returned by the backend (snake_case DTO). */
export interface StageDocReviewFindingDTO {
  severity: string;
  title: string;
  detail: string;
  section_ref?: string | null;
  rubric_item?: string | null;
}

export interface StageDocReviewResponse {
  stage_key: string;
  file_name: string;
  scan_duration_seconds: number;
  rubric_version: string;
  findings: StageDocReviewFindingDTO[];
  /** Non-null when the document yielded no reviewable text (scanned PDF,
   *  unsupported type, parse error) or was only partially read. `findings` is
   *  then empty or partial — explicitly not a clean pass. */
  note?: string | null;
  /** True when only the opening section fit the review budget. */
  truncated?: boolean;
  scanned_at: string;
  /** "backend" for a live scan, "fallback" when the model call failed. */
  source?: string;
}

/**
 * Pre-check an uploaded validation document against the rubric, via the
 * gateway's getDocumentReview(). The file is sent as multipart so the backend
 * can extract its text server-side.
 */
export async function scanStageDocument(
  input: { file: File; stageKey: string; stageLabel: string; systemName: string },
): Promise<StageDocReviewResponse> {
  const fd = new FormData();
  fd.append("file", input.file);
  fd.append("stage_key", input.stageKey);
  fd.append("stage_label", input.stageLabel);
  fd.append("system_name", input.systemName);
  return request<StageDocReviewResponse>("/api/v1/document-review/scan", {
    method: "POST",
    formBody: fd,
  });
}

/* ══════════════════════════════════════════════════════════════ */
/* FDA 483 Extraction (upload a 483 PDF → structured observations) */
/* ══════════════════════════════════════════════════════════════ */

/** One extracted observation as returned by the backend (snake_case DTO). */
export interface Fda483ObservationDTO {
  number: number;
  text: string;
  regulation?: string | null;
  area?: string | null;
  severity: string;
  source_page?: number | null;
  confidence?: number | null;
}

export interface Fda483ExtractionResponse {
  inspection_reference: string;
  file_name: string;
  page_count: number;
  prompt_version: string;
  observations: Fda483ObservationDTO[];
  /** Non-null when nothing extractable was found (e.g. a scanned PDF). */
  note?: string | null;
  extracted_at: string;
  /** "backend" for a live extraction, "fallback" when the model call failed. */
  source?: string;
}

/**
 * Extract inspectional observations from an uploaded FDA 483 PDF, via the
 * gateway's getFda483Extraction(). The file is sent as multipart so the
 * backend can extract its text server-side.
 */
export async function scanFda483Document(
  input: { file: File; inspectionReference: string; facility: string },
): Promise<Fda483ExtractionResponse> {
  const fd = new FormData();
  fd.append("file", input.file);
  fd.append("inspection_reference", input.inspectionReference);
  fd.append("facility", input.facility);
  return request<Fda483ExtractionResponse>("/api/v1/fda483-extraction/scan", {
    method: "POST",
    formBody: fd,
  });
}

/* ══════════════════════════════════════════════════════════════ */
/* AGI agents (Regulatory / Deviation / Batch / Drift)            */
/* ══════════════════════════════════════════════════════════════ */
/**
 * Counterparts to the feature gateway in src/lib/ai/index.ts. The backend
 * routers emit these camelCase keys directly, so the gateway returns the result
 * unchanged. Each router degrades to a deterministic result server-side when
 * its model call fails (see the AI service's app/fallbacks/), and stamps
 * `source` so the UI can badge a non-live answer.
 */

/** Feature E — FDA/EMA/ICH guidance monitoring (LLM over the agent's prompt). */
export function fetchRegulatoryIntelligence(): Promise<RegulatoryIntelligenceResult> {
  return request<RegulatoryIntelligenceResult>(
    "/api/v1/regulatory-intelligence/scan",
    { method: "GET" },
  );
}

/** Feature F — semantic clustering of the tenant's own deviation history. */
export function fetchDeviationClusters(
  deviations: DeviationClusterInput[],
): Promise<DeviationIntelligenceResult> {
  return request<DeviationIntelligenceResult>(
    "/api/v1/deviation-intelligence/analyze",
    { method: "POST", jsonBody: { deviations } },
  );
}

/** Feature H — drift/anomaly detection grounded in the real audit trail. */
export function fetchDriftDetection(): Promise<DriftDetectionResult> {
  return request<DriftDetectionResult>("/api/v1/drift-detection/scan", {
    method: "GET",
  });
}

/** Feature C — formal FDA-483 response-letter draft (LLM long-form generation). */
export function fetchResponseDraft(
  event: ResponseDraftEvent,
): Promise<ResponseDraftResult> {
  return request<ResponseDraftResult>(
    "/api/v1/response-draft/generate",
    { method: "POST", jsonBody: event },
  );
}

/** Feature A — method-shaped RCA suggestions for an observation (LLM). */
export function fetchRcaSuggestions(
  method: RcaMethod,
  observationText: string,
  observationSeverity: string,
  siteContext: string,
): Promise<RcaSuggestion[]> {
  return request<RcaSuggestion[]>("/api/v1/rca-suggestions/generate", {
    method: "POST",
    jsonBody: { method, observationText, observationSeverity, siteContext },
  });
}

/** Feature N — per-deviation RCA intelligence: root causes, contributing
 *  factors, recommendations, CAPA candidates, evidence gaps + a method-shaped
 *  RCA draft the investigator can apply. Advisory; nothing is auto-applied. */
export function fetchDeviationRcaAnalysis(
  input: DeviationRcaInput,
): Promise<DeviationRcaAnalysis> {
  return request<DeviationRcaAnalysis>("/api/v1/deviation-rca/analyze", {
    method: "POST",
    jsonBody: input,
  });
}

/** Feature B — CAPA pre-fill draft from an observation + RCA root cause (LLM). */
export function fetchCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): Promise<CAPAPrefill> {
  return request<CAPAPrefill>("/api/v1/capa-prefill/generate", {
    method: "POST",
    jsonBody: { observationText, rcaRootCause, observationSeverity },
  });
}

/** Feature I — triage a finding's requirement into framework + severity +
 *  risk summary + evidence gaps (LLM picks from the active frameworks). */
export function fetchFindingTriage(
  requirement: string,
  area: string,
  purpose: string,
  activeFrameworks: string[],
): Promise<FindingTriageResult> {
  return request<FindingTriageResult>("/api/v1/finding-triage/classify", {
    method: "POST",
    jsonBody: { requirement, area, purpose, activeFrameworks },
  });
}

/** Feature J — read-only approval brief for a CAPA awaiting approval (LLM
 *  prose + Python-appended gate facts). Reviewer assist only; never a verdict. */
export function fetchApprovalBrief(
  input: ApprovalBriefInput,
): Promise<ApprovalBriefResult> {
  return request<ApprovalBriefResult>("/api/v1/capa-approval-brief/generate", {
    method: "POST",
    jsonBody: input,
  });
}

/** Feature K — plain-language coaching for a CAPA's unmet readiness conditions
 *  (LLM prose grounded in the computed unmet list). Authoring guidance only. */
export function fetchReadinessGuidance(
  input: ReadinessGuidanceInput,
): Promise<ReadinessGuidanceResult> {
  return request<ReadinessGuidanceResult>(
    "/api/v1/capa-readiness-guidance/generate",
    { method: "POST", jsonBody: input },
  );
}

/** Feature O — assignable rework tasks from a QA rejection + review findings.
 *  Replaces the browser-side keyword engine that used to sit behind the
 *  "Suggest tasks (AI)" button (src/lib/ai/reworkTasks.ts). */
export function fetchReworkTasks(
  input: ReworkTasksInput,
): Promise<ReworkTasksResult> {
  return request<ReworkTasksResult>("/api/v1/rework-tasks/suggest", {
    method: "POST",
    jsonBody: input,
  });
}

/* ══════════════════════════════════════════════════════════════ */
/* Selector helper                                                */
/* ══════════════════════════════════════════════════════════════ */

import type { RootState } from "@/store";

/* REMOVED — selectAiToken().
 *
 * It read the AI backend's bearer token out of the Redux auth slice so client
 * components could put it in an `auth` header. That made the browser the holder
 * of a second service's credential (persisted to localStorage with the rest of
 * the slice), and because the slice was almost never populated it returned the
 * literal string "anonymous" — which a strict backend rejects with 401, so
 * every AGI surface silently fell through to its client-side mock.
 *
 * The token is now minted per request by app/api/ai-proxy/[...path]/route.ts
 * from the caller's session and never leaves the server. Client components need
 * no token at all — do not reintroduce a selector here.
 */

/**
 * The tenant id the AI service scopes records by.
 *
 * This must equal the `customer_id` claim in the token the server mints
 * (src/lib/aiToken.server.ts), or a record written under one id becomes
 * invisible when read under the other. That claim is always the NextAuth
 * tenantId, so this returns the tenantId — nothing else.
 *
 * It used to resolve a chain: the user's own `aiCustomerId`, else the tenant's
 * customer-admin `aiUserId`, else the tenantId. That produced a different
 * identifier depending on which users happened to be provisioned, while the
 * token said something else entirely.
 */
export function selectAiCustomerId(state: RootState): string | null {
  return state.auth.user?.tenantId ?? null;
}
