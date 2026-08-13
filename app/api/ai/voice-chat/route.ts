import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import { aiUpstreamBase } from "@/lib/aiAuth";
import { mintAiToken, canMintAiToken, AI_TOKEN_MISCONFIGURED } from "@/lib/aiToken.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Voice assistant BFF — the spoken twin of app/api/ai/assistant/route.ts.
 *
 * The microphone used to post straight through the generic AI proxy to a
 * DIFFERENT backend pipeline: no retrieval, no citations, no confidence band,
 * no audit entry, and no tenant snapshot. So typing "how do I close a CAPA?"
 * was correctly refused for lack of sources while speaking it returned an
 * ungrounded answer — and live-data questions could not be answered at all,
 * because nothing attached the caller's figures.
 *
 * This route exists so the voice path gets EXACTLY what the typed path gets:
 * the same session check, the same tenant snapshot from Prisma, the same
 * upstream pipeline, and the same response envelope. The only difference is
 * that audio goes in and audio comes back.
 *
 *   browser → this route (session + tenant figures) → FastAPI /api/ai/voice/chat
 */

/** Ceiling on an audio turn. Whisper is billed by duration, so this is a real
 *  cost control; the AI service enforces its own limit independently. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY = 20;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid form body" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ detail: "audio is required" }, { status: 422 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { detail: `Audio too large. Maximum ${MAX_AUDIO_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  // Same best-effort snapshot as the typed route: a failure here means the
  // assistant declines live-data questions rather than guessing at them.
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
    console.error("[api/ai/voice-chat] snapshot query failed", err);
  }

  const token = canMintAiToken() ? mintAiToken(session) : null;
  if (!token) {
    console.error("[api/ai/voice-chat] refusing to forward: AI_JWT_SECRET is not configured.");
    return NextResponse.json({ detail: AI_TOKEN_MISCONFIGURED }, { status: 503 });
  }

  const upstream = new FormData();
  upstream.append("audio", audio, audio.name || "speech.webm");

  const rawHistory = form.get("chat_history");
  if (typeof rawHistory === "string" && rawHistory) {
    try {
      const parsed = JSON.parse(rawHistory);
      if (Array.isArray(parsed)) {
        upstream.append(
          "chat_history",
          JSON.stringify(
            parsed
              .filter((m) => m && typeof m === "object" && "role" in m && "content" in m)
              .map((m) => ({ role: String(m.role), content: String(m.content) }))
              .slice(-MAX_HISTORY),
          ),
        );
      }
    } catch {
      // Malformed history is dropped, not fatal — the turn still works.
    }
  }
  if (snapshot) upstream.append("snapshot", JSON.stringify(snapshot));

  let res: Response;
  try {
    res = await fetch(`${aiUpstreamBase()}/api/ai/voice/chat`, {
      method: "POST",
      headers: { auth: token },
      body: upstream,
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `Voice assistant unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  }

  // Forward the audio plus the provenance envelope, so a spoken answer renders
  // with the same confidence band, sources and audit id as a typed one.
  const headers = new Headers({
    "content-type": res.headers.get("content-type") ?? "audio/mpeg",
  });
  const envelope = res.headers.get("x-assistant-envelope");
  if (envelope) headers.set("X-Assistant-Envelope", envelope);

  return new Response(res.body, { status: 200, headers });
}
