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

export const AI_API_BASE =
  process.env.NEXT_PUBLIC_AI_API_URL ??
  "https://pharma-glimmora-ai-backend.onrender.com";

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

/**
 * One-shot voice round-trip. The backend transcribes, generates a reply,
 * and returns audio bytes. The decoded transcript + reply text aren't in
 * the audio response — for those, use transcribe + chat separately.
 */
export async function aiVoiceChat(audio: Blob, token: string | null): Promise<Blob> {
  const fd = new FormData();
  fd.append("audio", audio, audio instanceof File ? audio.name : "speech.webm");
  const res = await authedFetch("/api/ai/voice/chat", { method: "POST", body: fd }, token);
  return await res.blob();
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
