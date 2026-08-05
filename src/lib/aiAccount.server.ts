import "server-only";
import { aiUpstreamBase, AiAuthError, type AiSignupRequest, type AiAuthResponse } from "./aiAuth";

/**
 * Provisioning calls against the AI service's own user store.
 *
 * These were previously invoked from client components (Settings → Users), so a
 * user's plaintext password was POSTed from the browser to a second service and
 * the returned bearer token was stored in Redux/localStorage. Both now happen
 * only here, on the server, and the token is not returned to the caller.
 */

/** Redacts password-ish fields before logging the request body. */
function safeBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  if ("password" in clone) clone.password = "***";
  return clone;
}

/** Flattens FastAPI's `detail` array into a readable single line. */
function formatDetail(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const d = (parsed as { detail?: unknown }).detail;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (item && typeof item === "object") {
            const it = item as { loc?: unknown[]; msg?: string };
            const field = Array.isArray(it.loc) ? it.loc.slice(1).join(".") : "?";
            return `${field}: ${it.msg ?? "invalid"}`;
          }
          return String(item);
        })
        .join("; ");
    }
    if (typeof d === "string") return d;
  }
  return `Request failed (${status})`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const tag = `[aiAccount] POST ${path}`;
  let res: Response;
  try {
    res = await fetch(`${aiUpstreamBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Provisioning must never hang a form submit.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    console.error(`${tag} ✗ network error`, err);
    throw err;
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail = formatDetail(parsed, res.status);
    console.error(`${tag} ✗ ${res.status} — ${detail}`, { body: safeBody(body) });
    throw new AiAuthError(res.status, detail, parsed);
  }
  return parsed as T;
}

/** Create the matching user on the AI service. Server-side only. */
export const aiSignup = (body: AiSignupRequest) =>
  postJson<AiAuthResponse>("/api/v1/auth/signup", body);
