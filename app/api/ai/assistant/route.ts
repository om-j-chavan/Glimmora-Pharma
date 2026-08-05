import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import { aiUpstreamBase } from "@/lib/aiAuth";
import { mintAiToken, canMintAiToken, AI_TOKEN_MISCONFIGURED } from "@/lib/aiToken.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Compliance Assistant BFF.
 *
 * The assistant needs two things this app owns and the AI service does not:
 * the caller's identity, and the caller's live compliance figures (which live
 * in this app's Prisma database, not the AI service's). So the browser posts
 * here, we attach both, and the AI service does all the routing and answering.
 *
 *   browser → this route (session + tenant figures) → FastAPI /api/ai/assistant
 *
 * The figures come from the SAME tenant-scoped query the Dashboard renders, so
 * a number the assistant quotes always matches what the user can see. Tenant
 * isolation comes from the caller's own session — one tenant can never read
 * another's counts.
 *
 * If the snapshot query fails we forward the message WITHOUT figures rather
 * than failing the turn: the assistant then declines live-data questions
 * outright instead of guessing, and knowledge questions still work.
 */

interface AssistantBody {
  message?: unknown;
  chat_history?: unknown;
}

/** Cap on conversation turns forwarded upstream — bounds the request size. */
const MAX_HISTORY = 20;
/** Cap on a single message — the backend has its own limits; this is the door. */
const MAX_MESSAGE_CHARS = 4000;

function cleanHistory(raw: unknown): { role: string; content: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: unknown; content: unknown } =>
        !!m && typeof m === "object" && "role" in m && "content" in m,
    )
    .map((m) => ({ role: String(m.role), content: String(m.content) }))
    .slice(-MAX_HISTORY);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: AssistantBody;
  try {
    body = (await req.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ detail: "message is required" }, { status: 422 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ detail: "message is too long" }, { status: 413 });
  }

  // Live tenant figures. Best-effort: a failure here must not take the whole
  // assistant down, so we forward without them and let the backend decline
  // data questions rather than answer them from nothing.
  let snapshot: Record<string, number> | null = null;
  try {
    const s = await getDashboardStats(session.user.tenantId);
    snapshot = {
      totalCAPAs: s.totalCAPAs,
      openCAPAs: s.openCAPAs,
      overdueCAPAs: s.overdueCAPAs,
      totalDeviations: s.totalDeviations,
      openDeviations: s.openDeviations,
      criticalDeviations: s.criticalDeviations,
      totalFindings: s.totalFindings,
      openFindings: s.openFindings,
      criticalFindings: s.criticalFindings,
      totalEvents: s.totalEvents,
      overdueEvents: s.overdueEvents,
      complianceScore: s.complianceScore,
      lowestReadiness: s.lowestReadiness,
    };
  } catch (err) {
    console.error("[api/ai/assistant] snapshot query failed", err);
  }

  // Fail closed, exactly like the proxy: never forward an unidentified request.
  const token = canMintAiToken() ? mintAiToken(session) : null;
  if (!token) {
    console.error("[api/ai/assistant] refusing to forward: AI_JWT_SECRET is not configured.");
    return NextResponse.json({ detail: AI_TOKEN_MISCONFIGURED }, { status: 503 });
  }
  const headers = new Headers({ "content-type": "application/json", auth: token });

  let res: Response;
  try {
    res = await fetch(`${aiUpstreamBase()}/api/ai/assistant`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        chat_history: cleanHistory(body.chat_history),
        snapshot,
      }),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `Assistant unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
