/**
 * Where AI calls are addressed.
 *
 * In the browser this is ALWAYS the same-origin proxy at
 * `app/api/ai-proxy/[...path]`. The proxy checks the NextAuth session, mints the
 * upstream access token server-side, and forwards the call. So the browser never
 * learns the AI service's address and never carries a credential for it.
 *
 * There is deliberately no `NEXT_PUBLIC_AI_API_URL` escape hatch any more: it
 * let a deployment point client-side fetches straight at the AI service, which
 * bypassed the session check and the token injection in one step.
 *
 * Server-side callers (server actions, route handlers) go direct to the
 * upstream — they are already inside the trust boundary and have no proxy to
 * route through. `BACKEND_URL` / `NEXT_PUBLIC_API_URL` mirror the proxy's own
 * resolution so there is one place the address is decided.
 *
 * Signup/login against the AI service are NOT here. They exchange a password
 * for a bearer token, so they run server-side only — see
 * `src/lib/aiAccount.server.ts` and the `provisionAiAccount` server action.
 */

/** Same-origin proxy path. Every browser AI request goes through this. */
export const AI_PROXY_PATH = "/api/ai-proxy";

/** Direct upstream base for server-side callers. */
export function aiUpstreamBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") ??
    "http://localhost:8000"
  );
}

export const AI_API_BASE =
  typeof window === "undefined" ? aiUpstreamBase() : AI_PROXY_PATH;

export class AiAuthError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

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
