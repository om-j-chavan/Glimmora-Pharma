import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import { getAssistantCAPAs } from "@/lib/queries/capaQueries";
import { getAssistantDeviations } from "@/lib/queries/deviationQueries";
import { getAssistantFindings } from "@/lib/queries/findingQueries";
import { getAssistantEvents } from "@/lib/queries/eventQueries";
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

  // Live tenant figures AND actual records for intelligent responses.
  // CRITICAL: All queries use session.user.tenantId for tenant isolation.
  // Best-effort: a failure here must not take the whole assistant down.

  let snapshot: Record<string, number> | null = null;
  let records: Record<string, any[]> | null = null;

  try {
    // Fetch aggregate stats
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

    // Fetch actual records for ALL entities for intelligent list responses
    // CRITICAL: tenantId from session ONLY, never from client
    const [openCAPAs, overdueCAPAs, openDeviations, criticalDeviations,
           openFindings, criticalFindings, overdueEvents] = await Promise.all([
      // CAPAs
      getAssistantCAPAs(session.user.tenantId, {
        status: ["Open", "In Progress"],
        limit: 20
      }),
      getAssistantCAPAs(session.user.tenantId, {
        overdue: true,
        limit: 20
      }),
      // Deviations
      getAssistantDeviations(session.user.tenantId, {
        status: ["Open", "Investigating"],
        limit: 20
      }),
      getAssistantDeviations(session.user.tenantId, {
        severity: ["Critical"],
        limit: 20
      }),
      // Findings
      getAssistantFindings(session.user.tenantId, {
        status: ["Open", "In Progress"],
        limit: 20
      }),
      getAssistantFindings(session.user.tenantId, {
        severity: ["Critical"],
        limit: 20
      }),
      // Events (FDA 483s)
      getAssistantEvents(session.user.tenantId, {
        overdue: true,
        limit: 20
      }),
    ]);

    records = {
      capas: openCAPAs,
      overdueCapas: overdueCAPAs,
      deviations: openDeviations,
      criticalDeviations: criticalDeviations,
      findings: openFindings,
      criticalFindings: criticalFindings,
      events: overdueEvents,
    };

  } catch (err) {
    console.error("[api/ai/assistant] data query failed", err);
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
        records, // ADDED: Actual records for intelligent responses
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
