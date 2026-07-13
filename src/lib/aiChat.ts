/**
 * Client for the AI Assistant + AI Voice endpoints on the deployed backend.
 *
 *   POST /api/ai/chat              { message, chat_history? } → { reply, intent, customer_id }
 *   GET  /api/ai/health
 *   POST /api/ai/voice/transcribe  multipart audio  → { text } (best effort, response shape inferred)
 *   POST /api/ai/voice/speak       { text, voice }  → audio bytes (audio/mpeg)
 *   POST /api/ai/voice/chat        multipart audio  → audio bytes (one-shot voice round-trip)
 *   GET  /api/ai/voice/health
 *
 * All protected endpoints take an `auth: <access_token>` header. The token
 * is the logged-in user's aiAccessToken (refreshed on every login).
 */

export { AI_API_BASE } from "./aiAuth";
import { AI_API_BASE } from "./aiAuth";

export class AiChatError extends Error {
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
  }
  return `Request failed (${status})`;
}

async function authedFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  if (!token) throw new AiChatError(401, "Not signed in to AI backend", null);
  const headers = new Headers(init.headers);
  headers.set("auth", token);
  const tag = `[aiChat] ${(init.method ?? "GET")} ${path}`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  let res: Response;
  try {
    res = await fetch(`${AI_API_BASE}${path}`, { ...init, headers });
  } catch (err) {
    console.error(`${tag} ✗ network error`, err);
    throw err;
  }
  const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
  if (!res.ok) {
    const text = await res.clone().text().catch(() => "");
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    const detail = flattenDetail(parsed, res.status);
    console.error(`${tag} ✗ ${res.status} (${ms}ms) — ${detail}`, parsed);
    throw new AiChatError(res.status, detail, parsed);
  }
  console.info(`${tag} ✓ ${res.status} (${ms}ms)`);
  return res;
}

/* ── Types ─────────────────────────────────────────────────────── */

export interface ChatMessage { role: "user" | "assistant" | string; content: string }

export interface ChatResponse {
  reply: string;
  intent?: string;
  customer_id?: string;
}

/* ── GxP Compliance Help Assistant (Feature 1) ─────────────────── */
// Grounded-only endpoint: answers strictly from approved SOPs/policies,
// returns citations + a confidence band, and hands off to a support ticket
// when not confident. See backend app/help_service.py.

export interface HelpSource {
  id: string;
  section?: string;
  title?: string;
  url?: string;
}

export interface TicketPrefill {
  summary: string;
  attach_conversation?: boolean;
  suggested_route?: string | null;
}

export interface HelpResponse {
  status: "answered" | "no_confident_answer" | string;
  confidence_band: "HIGH" | "MEDIUM" | "LOW" | string;
  confidence_score: number;
  answer: string;
  sources: HelpSource[];
  suggest_ticket: boolean;
  ticket_prefill?: TicketPrefill | null;
  action_refused: boolean;
  audit_id?: string | null;
  customer_id?: string | null;
  feature_id?: string;
  model?: string;
}

/* ── Endpoints ─────────────────────────────────────────────────── */

export async function aiChatSend(
  message: string,
  history: ChatMessage[],
  token: string | null,
): Promise<ChatResponse> {
  const res = await authedFetch(
    "/api/ai/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, chat_history: history }),
    },
    token,
  );
  return (await res.json()) as ChatResponse;
}

/* ── Plain-English Record Search (Feature 2) ───────────────────── */
// Translator only — returns a filter spec, never executes it. The list
// screen runs the filters client-side (see src/lib/aiSearch.ts).

export interface SearchConditionDTO {
  field: string;
  op: string;
  value: unknown;
}

export interface SearchResultResponse {
  status: "understood" | "unclear" | "empty_intent" | string;
  module: string;
  filters: { logic: "AND" | "OR" | string; conditions: SearchConditionDTO[] };
  understood_as: string;
  confidence: number;
  confidence_band: "HIGH" | "MEDIUM" | "LOW" | string;
  unsupported_terms: string[];
  suggestions: string[];
  audit_id?: string | null;
  customer_id?: string | null;
  feature_id?: string;
}

/**
 * Translate a plain-English request into a structured filter spec. The caller
 * executes the returned filters against the loaded records.
 */
export async function aiSearchSend(
  message: string,
  token: string | null,
  module = "capa",
): Promise<SearchResultResponse> {
  const res = await authedFetch(
    "/api/ai/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, module }),
    },
    token,
  );
  return (await res.json()) as SearchResultResponse;
}

/* ── CAPA / Root-Cause Draft Helper (Feature 5) ────────────────── */

export interface DraftResponse {
  status: "drafted" | "error" | string;
  draft: string;                              // free-text kinds
  whys?: string[];                            // rca_5why
  buckets?: Record<string, string>;           // rca_fishbone
  kind: string;
  tone: "formal" | "concise" | string;
  disclaimer: string;
  audit_id?: string | null;
  customer_id?: string | null;
  feature_id?: string;
}

export type DraftKind = "rca" | "capa_description" | "rca_5why" | "rca_fishbone";

export interface DraftOptions {
  kind?: DraftKind;
  tone?: "formal" | "concise";
  recordId?: string;
  module?: string;
}

/**
 * Generate an editable first-draft (RCA or CAPA description). The AI never
 * signs or approves — the returned text is a starting point the human edits.
 */
export async function aiDraftSend(
  context: string,
  opts: DraftOptions,
  token: string | null,
): Promise<DraftResponse> {
  const res = await authedFetch(
    "/api/ai/draft",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context,
        kind: opts.kind ?? "rca",
        tone: opts.tone ?? "formal",
        record_id: opts.recordId ?? "-",
        module: opts.module ?? "-",
      }),
    },
    token,
  );
  return (await res.json()) as DraftResponse;
}

/* ── Document Summarizing (Feature 3) ──────────────────────────── */

export interface SummaryResponse {
  status: "summarized" | "skipped" | "error" | string;
  reason: string;
  bullets: string[];
  length: "short" | "detailed" | string;
  lens: "qa" | "management" | "risks" | string;
  disclaimer: string;
  audit_id?: string | null;
  customer_id?: string | null;
  feature_id?: string;
}

export interface SummaryOptions {
  title?: string;
  length?: "short" | "detailed";
  lens?: "qa" | "management" | "risks";
  recordId?: string;
  module?: string;
}

/**
 * Summarize a long record into plain bullets. Grounded only in the supplied
 * text; short records come back status "skipped". Read-only — never mutates.
 */
export async function aiSummarizeSend(
  content: string,
  opts: SummaryOptions,
  token: string | null,
): Promise<SummaryResponse> {
  const res = await authedFetch(
    "/api/ai/summarize",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        title: opts.title ?? "",
        length: opts.length ?? "short",
        lens: opts.lens ?? "qa",
        record_id: opts.recordId ?? "-",
        module: opts.module ?? "-",
      }),
    },
    token,
  );
  return (await res.json()) as SummaryResponse;
}

/**
 * Send a question to the GxP Compliance Help Assistant. Unlike aiChatSend,
 * the reply carries cited sources, a confidence band, and (on low confidence)
 * a structured ticket suggestion. A 503 here means the assistant service is
 * unavailable ("I'm broken"), distinct from a confident "I don't know".
 */
export async function aiHelpSend(
  message: string,
  history: ChatMessage[],
  token: string | null,
): Promise<HelpResponse> {
  const res = await authedFetch(
    "/api/ai/help",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, chat_history: history }),
    },
    token,
  );
  return (await res.json()) as HelpResponse;
}

/**
 * One-shot voice round-trip. The backend transcribes, generates a reply,
 * and returns audio bytes. The transcript + reply text are returned via
 * CORS-exposed response headers (X-User-Text, X-AI-Reply, X-Intent), so
 * the UI can show them in the chat alongside the played audio.
 */
export interface VoiceChatResult {
  audio: Blob;
  userText: string | null;
  aiReply: string | null;
  intent: string | null;
}

export async function aiVoiceChat(
  audio: Blob,
  token: string | null,
  history: ChatMessage[] = [],
): Promise<VoiceChatResult> {
  const fd = new FormData();
  fd.append("audio", audio, audio instanceof File ? audio.name : "speech.webm");
  if (history.length > 0) fd.append("chat_history", JSON.stringify(history));
  const res = await authedFetch("/api/ai/voice/chat", { method: "POST", body: fd }, token);
  // Some browsers / proxies decode header values; the backend escapes them
  // server-side. Try both raw and URI-decoded.
  const decode = (v: string | null) => {
    if (!v) return v;
    try { return decodeURIComponent(v); } catch { return v; }
  };
  return {
    audio: await res.blob(),
    userText: decode(res.headers.get("x-user-text")),
    aiReply: decode(res.headers.get("x-ai-reply")),
    intent: decode(res.headers.get("x-intent")),
  };
}

export async function aiVoiceTranscribe(audio: Blob, token: string | null): Promise<{ text: string }> {
  const fd = new FormData();
  fd.append("audio", audio, audio instanceof File ? audio.name : "speech.webm");
  const res = await authedFetch("/api/ai/voice/transcribe", { method: "POST", body: fd }, token);
  return (await res.json()) as { text: string };
}

export async function aiVoiceSpeak(text: string, voice: string, token: string | null): Promise<Blob> {
  const res = await authedFetch(
    "/api/ai/voice/speak",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    },
    token,
  );
  return await res.blob();
}

export async function aiHealth(): Promise<unknown> {
  const res = await fetch(`${AI_API_BASE}/api/ai/health`);
  return res.json();
}

export async function aiVoiceHealth(): Promise<unknown> {
  const res = await fetch(`${AI_API_BASE}/api/ai/voice/health`);
  return res.json();
}
