/**
 * Client for the deployed AI backend's /api/v1/auth/* endpoints.
 *
 *   POST /api/v1/auth/signup  → creates a user, returns access_token
 *   POST /api/v1/auth/login   → returns a fresh access_token
 *
 * Signup is called once when a new app user is created and again is gated
 * by the user's `aiUserId` flag (already-signed-up sentinel). Login is
 * called every time the user signs in to the app and refreshes the cached
 * `aiAccessToken` on the user record so the modules that hit the AI
 * endpoints can include the `auth` header.
 */

export const AI_API_BASE =
  process.env.NEXT_PUBLIC_AI_API_URL ??
  "https://pharma-glimmora-ai-backend.onrender.com";

export interface AiSignupRequest {
  user_id: string;
  username: string;
  email: string;
  password: string;
  customer_id: string;
  role?: string;
}

export interface AiAuthResponse {
  access_token: string;
  token_type: string;
  username: string;
  customer_id: string;
  role?: string;
  message?: string;
}

export class AiAuthError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

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
  const tag = `[aiAuth] POST ${path}`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`, safeBody(body));
  let res: Response;
  try {
    res = await fetch(`${AI_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
  if (!res.ok) {
    const detail = formatDetail(parsed, res.status);
    console.error(`${tag} ✗ ${res.status} (${ms}ms) — ${detail}`, { body: safeBody(body), response: parsed });
    throw new AiAuthError(res.status, detail, parsed);
  }
  console.info(`${tag} ✓ ${res.status} (${ms}ms)`, parsed);
  return parsed as T;
}

export const aiSignup = (body: AiSignupRequest) =>
  postJson<AiAuthResponse>("/api/v1/auth/signup", body);

export const aiLogin = (username: string, password: string) =>
  postJson<AiAuthResponse>("/api/v1/auth/login", { username, password });

/* ── Helpers for ID generation ─────────────────────────────────── */

/**
 * Generates a customer_id for a brand-new tenant / customer admin.
 * Uses the same value as the user_id of the customer admin so the two
 * line up (per spec: "if the created user is a customer admin then the
 * customer ID is auto created and it is used as the User ID for that
 * customer too").
 */
export function generateCustomerId(): string {
  // CUST_<8 hex chars> — readable, unique, fits the backend's CUST_001 pattern.
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `CUST_${rand}`;
}

/**
 * Generates a USER-XXX style id for a non-customer-admin user.
 */
export function generateUserId(): string {
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `USER-${rand}`;
}
