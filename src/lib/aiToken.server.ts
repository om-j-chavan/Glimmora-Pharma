import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthSession } from "@/lib/auth";

/**
 * Server-only minting of the access token the AI backend expects.
 *
 * ── Why this exists ────────────────────────────────────────────────
 * The browser used to hold this credential itself. `aiSignup`/`aiLogin` were
 * called from client components, the returned `access_token` was written into
 * Redux (and from there into the persisted `glimmora-state` localStorage blob),
 * and every AI call read it back out and sent it as the `auth` header. That
 * meant a bearer token for a separate service was readable by any script on the
 * page, survived in localStorage after sign-out, and — because the store slice
 * was almost never populated — usually degraded to the literal string
 * `"anonymous"`, which production rejects with a 401.
 *
 * The token is now minted here, on the server, per request, from the caller's
 * own NextAuth session, and attached by the proxy. It never reaches the client.
 *
 * ── Trust model ────────────────────────────────────────────────────
 * This app is the AI service's Backend-For-Frontend: it authenticates the user
 * (NextAuth), then vouches for them upstream. `AI_JWT_SECRET` must equal the AI
 * backend's `SECRET_KEY` so the HS256 signature verifies there. Both are
 * server-side env vars; neither is `NEXT_PUBLIC_`.
 *
 * Claims match what the FastAPI dependency reads (app/routers/auth_router.py):
 *   sub          → the acting user (audit-trail attribution)
 *   customer_id  → the tenant, used for every tenant-scoped query upstream
 *   exp          → short-lived; a fresh token is minted per request
 */

/** Token lifetime. Minted per request, so this only has to cover one call. */
const TTL_SECONDS = 300;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function secret(): string | null {
  // SECRET_KEY is accepted as an alias so a single-host deployment can set one
  // variable for both services.
  const key = process.env.AI_JWT_SECRET ?? process.env.AI_BACKEND_SECRET_KEY ?? null;
  return key && key.length > 0 ? key : null;
}

/**
 * True when this deployment can mint AI tokens.
 *
 * Callers must FAIL CLOSED when this is false — see `AI_TOKEN_MISCONFIGURED`.
 * Sending the request without an `auth` header instead is what produced the
 * bug this replaced: the AI service's dev fallback accepted the call as the
 * shared "anonymous" identity, so every AI action in the Part 11 audit trail
 * was attributed to "anonymous" rather than the real user, and the
 * misconfiguration stayed invisible until production (where it 401s).
 */
export function canMintAiToken(): boolean {
  return secret() !== null;
}

/** Operator-facing message for a deployment missing `AI_JWT_SECRET`. */
export const AI_TOKEN_MISCONFIGURED =
  "AI is not configured on this deployment (AI_JWT_SECRET is unset). " +
  "Set it to the AI service's SECRET_KEY.";

/**
 * Mint a short-lived HS256 JWT for the signed-in user, or null when no signing
 * secret is configured.
 *
 * Hand-rolled rather than pulling in a JWT dependency: HS256 is an HMAC over
 * two base64url segments, and we only ever SIGN here (verification is the
 * FastAPI service's job, using PyJWT).
 */
export function mintAiToken(session: AuthSession): string | null {
  const key = secret();
  if (!key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      // The AI backend keys its audit trail on `sub`, so this must identify the
      // real actor. Email is the stable, human-readable identifier the rest of
      // the app uses; fall back to the user id when it is absent.
      sub: session.user.email || session.user.id,
      customer_id: session.user.tenantId,
      role: session.user.role,
      iat: now,
      exp: now + TTL_SECONDS,
    }),
  );
  const signature = base64url(
    createHmac("sha256", key).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/**
 * Constant-time compare for shared-secret checks. Exported so callers that need
 * to validate an inbound service token don't hand-roll a `===` comparison.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
