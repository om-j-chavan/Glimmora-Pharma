/**
 * Maps raw API / network errors into short, user-facing sentences.
 *
 * The AI backend and OpenAI passthroughs can surface very long technical
 * payloads (Python dict-style error dumps, OpenAI "Invalid file format"
 * messages with full supported-format lists, FastAPI validation arrays).
 * Showing those in the UI is overwhelming and unactionable for end users.
 *
 * Call this anywhere you'd otherwise do `setError(err.message)` to render
 * a clean message — and log the raw error for debugging at the same time.
 */

import { AiChatError } from "./aiChat";
import { AiAuthError } from "./aiAuth";
import { AiBackendError } from "./aiBackend";

/** Optional second argument: short context like "chat", "transcription". */
export function friendlyAiError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  // 1. Network-level (fetch threw — no response).
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return "Couldn't reach the AI service. Check your connection and try again.";
  }

  // 2. Status-coded errors from our own clients.
  const status =
    err instanceof AiChatError ? err.status :
    err instanceof AiAuthError ? err.status :
    err instanceof AiBackendError ? err.status :
    undefined;
  const raw =
    err instanceof Error ? err.message :
    typeof err === "string" ? err :
    "";

  // 3. Pattern-match on the message text first — most server errors carry a
  //    descriptive substring that's more specific than the status code.
  const lower = raw.toLowerCase();

  if (/invalid file format|unsupported.*format|supported formats/.test(lower)) {
    return "We couldn't process that audio. Try recording again — keep it under 30 seconds.";
  }
  if (/file too large|payload too large|maximum/.test(lower)) {
    return "That file is too large. Please try a shorter clip or a smaller file.";
  }
  if (/microphone|getusermedia|permission/.test(lower)) {
    return "Microphone access was denied. Allow it from the address-bar lock icon, then try again.";
  }
  if (/rate limit|too many requests|429/.test(lower) || status === 429) {
    return "Too many requests right now. Please wait a few seconds and try again.";
  }
  if (/timeout|timed out|deadline/.test(lower)) {
    return "The AI service took too long to respond. Please try again.";
  }
  if (/openai.*api key|invalid api key|incorrect api key/.test(lower)) {
    return "AI service isn't configured correctly. Please contact your administrator.";
  }
  if (/quota|insufficient.*credit|billing/.test(lower)) {
    return "AI usage limit reached. Please contact your administrator.";
  }
  if (/empty|blank|no audio|silent/.test(lower) && /audio|recording|transcrib/.test(lower)) {
    return "We couldn't hear anything in that recording. Please try again.";
  }
  if (/not signed in|not authenticated|unauthor/i.test(lower)) {
    return "Please sign in again to continue.";
  }
  if (/not found|404/.test(lower) || status === 404) {
    return "That item couldn't be found. It may have been removed.";
  }
  if (/conflict|already exists|duplicate|409/.test(lower) || status === 409) {
    return "That already exists. Please use a different value.";
  }
  if (/validation|invalid|must be|required/.test(lower) && status !== 500) {
    // Strip dict / array dumps if the raw is short enough to read.
    if (raw.length <= 120 && !/[{}[\]]/.test(raw)) return raw;
    return "Some of the details aren't quite right. Please check your input and try again.";
  }

  // 4. Status-code fallback.
  if (status && status >= 500) {
    return "AI service is temporarily unavailable. Please try again in a moment.";
  }
  if (status && status >= 400) {
    return "We couldn't complete that request. Please try again.";
  }

  // 5. Last resort — if the raw message is short and free of structural
  //    noise, show it; otherwise the generic fallback.
  if (raw && raw.length <= 100 && !/[{}[\]]/.test(raw)) {
    return raw;
  }
  return fallback;
}
