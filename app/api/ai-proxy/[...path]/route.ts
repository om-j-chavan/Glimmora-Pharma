import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// In production (DO App Platform) this is the internal private URL of the api
// service — never leaves DO's private network. In dev it falls back to localhost.
const AI_BASE =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") ??
  "http://localhost:8000";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Allowlist of upstream path prefixes this proxy may reach. Prevents the
// catch-all from being abused as an open relay / SSRF pivot into arbitrary
// upstream paths. These are the only two surfaces the client uses: the
// versioned compliance API (/api/v1/*) and the AI helper API (/api/ai/*,
// which includes chat, draft, search, voice and health).
const ALLOWED_PATH_PREFIXES = ["api/v1/", "api/ai/"];

function isAllowedPath(joined: string): boolean {
  // Reject path-traversal / absolute-URL injection outright.
  if (joined.includes("..") || joined.includes("://")) return false;
  return ALLOWED_PATH_PREFIXES.some((p) => joined === p || joined.startsWith(p));
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // ── AuthN: this proxy is the single ingress to the AI backend. Without a
  // session it was an open relay (cost abuse, SSRF, cross-tenant exposure).
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ detail: "Authentication required." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!isAllowedPath(joined)) {
    return new Response(JSON.stringify({ detail: "Forbidden upstream path." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const target = `${AI_BASE}/${joined}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  // The user's own AI access token (`auth`) is still forwarded — the upstream
  // derives tenant scope from it. We strip only the NextAuth session cookie,
  // which the upstream never reads and should not receive.
  headers.delete("cookie");
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
    /^api\/v1\/(rca|action-plan|monitoring|effectiveness|closure)\/capa\//i.test(path.join("/"))
  ) {
    return new Response(null, { status: 204, headers: respHeaders });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: respHeaders });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
