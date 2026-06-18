/**
 * Unified, typed client for the deployed AI backend.
 * Base: https://pharma-glimmora-ai-backend.onrender.com
 *
 * One function per OpenAPI operation. All protected endpoints take a
 * `token` argument (the user's aiAccessToken from Redux) which is sent
 * as the `auth` header. Login/signup don't need the token.
 *
 * Re-exports the existing aiAuth (login/signup) and aiChat (chat/voice)
 * helpers so callers only need this module.
 *
 * Every call goes through `request()` which logs:
 *   [aiBackend] METHOD /path → sending
 *   [aiBackend] METHOD /path ✓ status (Xms)   on success
 *   [aiBackend] METHOD /path ✗ status (Xms) — detail   on failure
 */

export {
  AI_API_BASE,
  AiAuthError,
  aiSignup,
  aiLogin,
  generateCustomerId,
  generateUserId,
  type AiSignupRequest,
  type AiAuthResponse,
} from "./aiAuth";

export {
  aiChatSend,
  aiVoiceChat,
  aiVoiceTranscribe,
  aiVoiceSpeak,
  aiHealth,
  aiVoiceHealth,
  AiChatError,
  type ChatMessage,
  type ChatResponse,
} from "./aiChat";

import { AI_API_BASE } from "./aiAuth";

// Type-only imports of the gateway result shapes. These are erased at compile
// time, so they do NOT create a runtime import cycle with ./ai (which imports
// the fetch* functions below from this module).
import type {
  RegulatoryIntelligenceResult,
  DeviationClusterInput,
  DeviationIntelligenceResult,
  DriftDetectionResult,
  ResponseDraftEvent,
  RcaMethod,
  RcaSuggestion,
  CAPAPrefill,
  FindingTriageResult,
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
  token?: string | null;
  /** Statuses to log as info instead of error (e.g. 404 from by-capa lookups before a stage is submitted). */
  silentStatuses?: number[];
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { jsonBody, formBody, token, silentStatuses, ...rest } = opts;
  const method = rest.method ?? "GET";
  const tag = `[aiBackend] ${method} ${path}`;
  const headers = new Headers();
  if (jsonBody !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("auth", token);
  const body = jsonBody !== undefined ? JSON.stringify(jsonBody) : formBody;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  let res: Response;
  try {
    res = await fetch(`${AI_API_BASE}${path}`, { ...rest, headers, body });
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
/* CAPA                                                           */
/* ══════════════════════════════════════════════════════════════ */

export interface SimilarCAPA {
  capa_id: string;
  similarity_score: number;
  description: string;
  was_effective: boolean;
}

export interface CAPACreateResponse {
  capa_id: string;
  customer_id: string;
  status: string;
  created_at: string;
  is_recurring: boolean;
  similar_capas: SimilarCAPA[];
  recurrence_alert?: string;
  pattern_detected?: string;
  ai_recommendation?: string;
  risk_score: number;
  message: string;
}

export interface CapaCreateInput {
  customer_id: string;
  problem_statement: string;
  source: string;
  area_affected: string;
  equipment_product: string;
  initial_severity: string;
  document?: File | null;
}

export async function capaCreate(input: CapaCreateInput, token: string): Promise<CAPACreateResponse> {
  const fd = new FormData();
  fd.append("customer_id", input.customer_id);
  fd.append("problem_statement", input.problem_statement);
  fd.append("source", input.source);
  fd.append("area_affected", input.area_affected);
  fd.append("equipment_product", input.equipment_product);
  fd.append("initial_severity", input.initial_severity);
  if (input.document) fd.append("document", input.document);
  return request<CAPACreateResponse>("/api/v1/capa/create", { method: "POST", formBody: fd, token });
}

export const capaListAll = (token: string) =>
  request<unknown>("/api/v1/capa/all", { method: "GET", token });

export const capaListByCustomer = (customerId: string, token: string) =>
  request<unknown>(`/api/v1/capa/customer/${encodeURIComponent(customerId)}`, { method: "GET", token });

export const capaStatus = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/capa/status/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export interface AlertDismissalRequest {
  capa_id: string;
  alert_type: string;
  dismissal_reason: string;
  electronic_signature: string;
  dismissed_by: string;
}

export const capaDismissAlert = (body: AlertDismissalRequest, token: string) =>
  request<unknown>("/api/v1/capa/dismiss-alert", { method: "POST", jsonBody: body, token });

/* ══════════════════════════════════════════════════════════════ */
/* RCA                                                            */
/* ══════════════════════════════════════════════════════════════ */

export interface RCACreateRequest {
  capa_id: string;
  customer_id: string;
  rca_method: string;
  evidence?: string | null;
}
export interface RCACreateResponse {
  rca_id?: string;
  status?: string;
  message?: string;
  [k: string]: unknown;
}

export const rcaSubmit = (body: RCACreateRequest, token: string) =>
  request<RCACreateResponse>("/api/v1/rca/submit", { method: "POST", jsonBody: body, token });

export const rcaByCapa = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/rca/capa/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export const rcaStatus = (rcaId: string, token: string) =>
  request<unknown>(`/api/v1/rca/status/${encodeURIComponent(rcaId)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* Action Plan                                                    */
/* ══════════════════════════════════════════════════════════════ */

export interface ActionItem {
  action_description: string;
  responsible_person: string;
  due_date: string;
}
export interface ActionPlanCreateRequest {
  capa_id: string;
  customer_id: string;
  rca_id: string;
  actions: ActionItem[];
}
export interface ActionPlanCreateResponse {
  action_plan_id?: string;
  status?: string;
  message?: string;
  [k: string]: unknown;
}

export const actionPlanSubmit = (body: ActionPlanCreateRequest, token: string) =>
  request<ActionPlanCreateResponse>("/api/v1/action-plan/submit", { method: "POST", jsonBody: body, token });

export const actionPlanByCapa = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/action-plan/capa/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export const actionPlanStatus = (id: string, token: string) =>
  request<unknown>(`/api/v1/action-plan/status/${encodeURIComponent(id)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* Implementation Monitoring                                      */
/* ══════════════════════════════════════════════════════════════ */

export type ActionStatus = "On Track" | "Delayed" | "Completed" | "Blocked" | string;
export interface ActionProgressUpdate {
  action_description: string;
  responsible_person: string;
  due_date: string;
  status: ActionStatus;
  progress_note?: string | null;
}
export interface MonitoringRequest {
  capa_id: string;
  customer_id: string;
  action_plan_id: string;
  action_updates: ActionProgressUpdate[];
}
export interface MonitoringResponse {
  monitoring_id?: string;
  status?: string;
  [k: string]: unknown;
}

export const monitoringCheck = (body: MonitoringRequest, token: string) =>
  request<MonitoringResponse>("/api/v1/monitoring/check", { method: "POST", jsonBody: body, token });

export const monitoringByCapa = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/monitoring/capa/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export const monitoringStatus = (id: string, token: string) =>
  request<unknown>(`/api/v1/monitoring/status/${encodeURIComponent(id)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* Effectiveness Check                                            */
/* ══════════════════════════════════════════════════════════════ */

export interface EvidenceItem {
  action_description: string;
  completed: boolean;
  evidence_attached: boolean;
  evidence_note?: string | null;
}
export interface TrendData {
  metric_name: string;
  before_capa: number;
  after_capa: number;
  unit: string;
}
export interface EffectivenessRequest {
  capa_id: string;
  customer_id: string;
  action_plan_id: string;
  days_since_capa: number;
  evidence_items: EvidenceItem[];
  trend_data: TrendData[];
  new_issues_reported: boolean;
  new_issue_details?: string | null;
}
export interface EffectivenessResponse {
  effectiveness_id?: string;
  status?: string;
  [k: string]: unknown;
}

export const effectivenessCheck = (body: EffectivenessRequest, token: string) =>
  request<EffectivenessResponse>("/api/v1/effectiveness/check", { method: "POST", jsonBody: body, token });

export const effectivenessByCapa = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/effectiveness/capa/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export const effectivenessStatus = (id: string, token: string) =>
  request<unknown>(`/api/v1/effectiveness/status/${encodeURIComponent(id)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* CAPA Closure                                                   */
/* ══════════════════════════════════════════════════════════════ */

export interface ClosureRequest {
  capa_id: string;
  customer_id: string;
  effectiveness_id: string;
  approved_by: string;
  designation: string;
  electronic_signature: string;
  closure_rationale: string;
  related_capas_reviewed: boolean;
  document_changes_approved: boolean;
}
export interface ClosureResponse {
  closure_id?: string;
  status?: string;
  [k: string]: unknown;
}

export const closureInitiate = (body: ClosureRequest, token: string) =>
  request<ClosureResponse>("/api/v1/closure/initiate", { method: "POST", jsonBody: body, token });

export const closureByCapa = (capaId: string, token: string) =>
  request<unknown>(`/api/v1/closure/capa/${encodeURIComponent(capaId)}`, { method: "GET", token, silentStatuses: [404] });

export const closureStatus = (id: string, token: string) =>
  request<unknown>(`/api/v1/closure/status/${encodeURIComponent(id)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* Audit Trail                                                    */
/* ══════════════════════════════════════════════════════════════ */

export const auditAll = (token: string) =>
  request<unknown>("/api/v1/audit/all", { method: "GET", token });

export const auditRecord = (recordId: string, token: string) =>
  request<unknown>(`/api/v1/audit/record/${encodeURIComponent(recordId)}`, { method: "GET", token });

/* ══════════════════════════════════════════════════════════════ */
/* Users                                                          */
/* ══════════════════════════════════════════════════════════════ */

export const usersList = () => request<unknown>("/api/v1/users/", { method: "GET" });

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
  scanned_at: string;
}

/**
 * Pre-check an uploaded validation document against the rubric. Used by the
 * mock-first gateway's getDocumentReview() when MOCK_AI_RESPONSES is false.
 * The file is sent as multipart so the backend can extract its text.
 */
export async function scanStageDocument(
  input: { file: File; stageKey: string; stageLabel: string; systemName: string },
  token: string,
): Promise<StageDocReviewResponse> {
  const fd = new FormData();
  fd.append("file", input.file);
  fd.append("stage_key", input.stageKey);
  fd.append("stage_label", input.stageLabel);
  fd.append("system_name", input.systemName);
  return request<StageDocReviewResponse>("/api/v1/document-review/scan", {
    method: "POST",
    formBody: fd,
    token,
  });
}

/* ══════════════════════════════════════════════════════════════ */
/* AGI agents (Regulatory / Deviation / Batch / Drift)            */
/* ══════════════════════════════════════════════════════════════ */
/**
 * Real-backend counterparts to the mock-first gateway in src/lib/ai/index.ts.
 * Each returns the SAME shape the gateway's mock returns (the backend routers
 * emit those camelCase keys directly), so the gateway can return the result
 * unchanged. These AGI surfaces are tenant-agnostic / send their own input, so
 * they don't require the AI auth token. The gateway wraps each call in a
 * try/catch that falls back to the deterministic mock on failure.
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
): Promise<{ draft: string; characterCount: number }> {
  return request<{ draft: string; characterCount: number }>(
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

/* ══════════════════════════════════════════════════════════════ */
/* Selector helper                                                */
/* ══════════════════════════════════════════════════════════════ */

import type { RootState } from "@/store";

/**
 * Reads the AI access token off the currently logged-in user's tenant
 * record. Returns a placeholder `"anonymous"` string instead of null when
 * no real token is available — the AI backend was made permissive on
 * 2026-05-15, so the placeholder satisfies every `if (!token)` UI gate
 * without blocking the user, and the now-optional Authorization header
 * is ignored server-side.
 */
export function selectAiToken(state: RootState): string {
  const u = state.auth.user;
  if (!u) return "anonymous";
  if (u.aiAccessToken) return u.aiAccessToken;
  const tenant = state.auth.tenants.find((t) => t.id === u.tenantId);
  return tenant?.config?.users?.find((x) => x.id === u.id)?.aiAccessToken ?? "anonymous";
}

/**
 * Same idea for the active customer_id (the customer admin's aiUserId for
 * the current user's tenant). Falls back to tenantId if the customer admin
 * isn't signed up yet — the backend will reject and the caller can show
 * a helpful error.
 */
export function selectAiCustomerId(state: RootState): string | null {
  const u = state.auth.user;
  if (!u) return null;
  if (u.aiCustomerId) return u.aiCustomerId;
  const tenant = state.auth.tenants.find((t) => t.id === u.tenantId);
  const admin = tenant?.config?.users?.find((x) => x.role === "customer_admin" && x.aiUserId);
  return admin?.aiUserId ?? u.tenantId ?? null;
}
