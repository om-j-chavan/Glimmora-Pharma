import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { mintAiToken, canMintAiToken, AI_TOKEN_MISCONFIGURED } from "@/lib/aiToken.server";

// In production (DO App Platform) this is the internal private URL of the api
// service — never leaves DO's private network. In dev it falls back to localhost.
const AI_BASE =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") ??
  "http://localhost:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The single doorway from the browser to the AI service.
 *
 * Everything AI-related in this app goes: browser → this route → FastAPI →
 * OpenAI/Pinecone. The browser never learns the AI service's address and never
 * holds a credential for it; this route authenticates the caller against the
 * app's own session and then mints the upstream token itself.
 */

// Only these upstream path prefixes may be proxied. The browser clients
// (aiAuth / aiChat / aiBackend) only ever hit `api/ai/*` and `api/v1/*`; an
// allowlist stops this same-origin route from being used as an open relay to
// arbitrary paths on the internal AI service.
const ALLOWED_PREFIXES = ["api/ai/", "api/v1/"];

// Paths the browser must NEVER be able to reach through this proxy, even though
// they sit under an allowed prefix. `auth/*` mints upstream credentials and
// takes a password — that exchange belongs to the server (see
// src/actions/aiAccount.ts), not to a passthrough the browser drives.
const BLOCKED_PATHS = [/^api\/v1\/auth\//i];

// Request headers we forward upstream. Everything else (cookies, the NextAuth
// session, forwarding/host headers, etc.) is dropped so the browser session is
// never leaked to the AI backend and headers can't be smuggled through.
//   - content-type: preserves JSON vs multipart (incl. the multipart boundary)
//   - accept:       content negotiation
//
// `auth` is deliberately NOT in this list. It used to be forwarded from the
// client, which made the browser the holder of the upstream credential; it is
// now minted here per request from the caller's session and any client-supplied
// value is discarded.
const FORWARD_REQUEST_HEADERS = ["content-type", "accept"];

function isAllowedPath(joined: string): boolean {
  const lower = joined.toLowerCase();
  if (BLOCKED_PATHS.some((re) => re.test(lower))) return false;
  return ALLOWED_PREFIXES.some((p) => lower.startsWith(p));
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // The proxy must not be usable by anonymous callers. This is now the ONLY
  // thing standing between the internet and the AI service, so the check is
  // load-bearing rather than defense-in-depth.
  const session = await auth();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!isAllowedPath(joined)) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const target = `${AI_BASE}/${joined}${req.nextUrl.search}`;

  // Build a minimal, explicit header set instead of copying req.headers wholesale.
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Attach the upstream credential server-side. FAIL CLOSED: a deployment with
  // no signing secret must not forward an unidentified request. Previously this
  // sent no `auth` header at all, and the AI service's dev fallback accepted the
  // call as the shared "anonymous" identity — so the Part 11 AI audit trail
  // recorded "anonymous" instead of the real user, and the misconfiguration only
  // surfaced in production as a blanket 401.
  const token = canMintAiToken() ? mintAiToken(session) : null;
  if (!token) {
    console.error("[ai-proxy] refusing to forward: AI_JWT_SECRET is not configured.");
    return NextResponse.json({ detail: AI_TOKEN_MISCONFIGURED }, { status: 503 });
  }
  headers.set("auth", token);

  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const buf = await req.arrayBuffer();
    body = buf.byteLength ? buf : undefined;
  }
  let res: Response;
  try {
    res = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
  } catch (err) {
    return new Response(JSON.stringify({ detail: `Proxy error: ${(err as Error).message}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
  const respHeaders = new Headers(res.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  // Lifecycle by-capa lookups (rca|action-plan|monitoring|effectiveness|closure)/capa/{id}
  // 404 when the stage hasn't been submitted yet. Surface that as 204 No Content so the
  // browser doesn't log it as an error in dev tools. The client treats both as "not started".
  if (
    res.status === 404 &&
    req.method === "GET" &&
    /^api\/v1\/(rca|action-plan|monitoring|effectiveness|closure)\/capa\//i.test(joined)
  ) {
    return new Response(null, { status: 204, headers: respHeaders });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: respHeaders });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
