/**
 * Regulatory AI assistant client — the "Ask Regulatory AI" surface.
 *
 * ── What changed, and why ──────────────────────────────────────────
 * This file used to BE the assistant. It carried the prompt builder
 * (`buildLivePrompt`), a clause-level regulatory knowledge base for all nine
 * frameworks, a topic→framework intent map, role-based answer shaping, and a
 * complete deterministic answer engine — roughly 400 lines of AI logic and GxP
 * domain content compiled into the browser bundle, where anyone could read the
 * prompt and edit the cited clauses.
 *
 * All of it moved to the AI service
 * (app/regulatory_assistant_service.py, POST /api/ai/regulatory-assistant).
 * What remains here is the request: send the question plus the grounding
 * context the UI already has on screen, and type the answer.
 *
 * The scope guardrail is unchanged and now enforced server-side: the assistant
 * SUMMARISES and POINTS to clauses. It never interprets a requirement or makes
 * a compliance determination — that stays with Regulatory Affairs. Every answer
 * carries the advisory disclaimer.
 */

import { AI_API_BASE } from "@/lib/aiAuth";
import { AiChatError, type ChatMessage } from "@/lib/aiChat";

/** Context the overlay passes on every ask — drives the grounding. */
export interface RegulatoryAIContext {
  /** Org regulatory region code, e.g. "FDA" | "EMA" | "CDSCO" | "WHO". */
  region: string;
  /** Display label for the asker's role, e.g. "QA Head". */
  roleLabel: string;
  /** Frameworks currently enabled in Settings → Frameworks. */
  activeFrameworks: { key: string; label: string }[];
  /** Prior turns, so the model has conversational context. */
  history?: ChatMessage[];
}

export type RegulatoryAIConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface RegulatoryAISource {
  /** Clause / document reference, e.g. "21 CFR 211.194" or "FDA-2025-D-3210". */
  ref: string;
  /** Short human label for the source. */
  label: string;
}

export interface RegulatoryAIAnswer {
  /** Lead paragraph — plain language, scoped to the active context. */
  answer: string;
  /** Optional supporting points (clauses, steps, things to verify). */
  bullets: string[];
  /** Cited clauses / guidance refs. */
  sources: RegulatoryAISource[];
  confidence: RegulatoryAIConfidence;
  /** Framework labels this answer draws on (powers the chips under the answer). */
  relatedFrameworks: string[];
  /** Advisory disclaimer — always shown; RA interprets and decides. */
  disclaimer: string;
  /**
   * Which engine produced this.
   *   "live"     → the model answered.
   *   "fallback" → the backend's deterministic knowledge base answered because
   *                the model was unreachable.
   * The UI shows a "live" pill only for the former.
   */
  source: "live" | "fallback";
}

/**
 * Ask a regulatory question. Returns whatever the backend answers with —
 * including its own deterministic fallback, so this call does not need a
 * client-side safety net.
 */
export async function askRegulatoryAI(
  question: string,
  context: RegulatoryAIContext,
): Promise<RegulatoryAIAnswer> {
  const res = await fetch(`${AI_API_BASE}/api/ai/regulatory-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      question: question.trim(),
      region: context.region,
      roleLabel: context.roleLabel,
      activeFrameworks: context.activeFrameworks,
      chat_history: context.history ?? [],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    const detail =
      parsed && typeof parsed === "object" && typeof (parsed as { detail?: unknown }).detail === "string"
        ? (parsed as { detail: string }).detail
        : `Request failed (${res.status})`;
    console.error(`[regulatory-ai] ✗ ${res.status} — ${detail}`);
    throw new AiChatError(res.status, detail, parsed);
  }
  return (await res.json()) as RegulatoryAIAnswer;
}
