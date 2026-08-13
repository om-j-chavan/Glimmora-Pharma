import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiUpstreamBase } from "@/lib/aiAuth";
import { canAuthorGxP } from "@/lib/permissions/roleSets";
import { getAgiPolicyForTenant } from "@/actions/agi-policy";
import { mintAiToken, canMintAiToken, AI_TOKEN_MISCONFIGURED } from "@/lib/aiToken.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CAPA Recurrence BFF.
 *
 * The AI service cannot see the tenant's CAPAs — Prisma is the system of record
 * and lives here. So this route reads the caller's OWN closed CAPA history
 * under their session and sends it upstream as the comparison set.
 *
 *   browser → this route (session + real closed CAPAs) → FastAPI → analysis
 *
 * ── What this replaces ────────────────────────────────────────
 * The modal used to POST straight to the AI service's `/api/v1/capa/create`,
 * which (a) compared the new problem against five hardcoded fictional CAPAs
 * that existed in no customer's records, (b) created a CAPA row in the AI
 * service's own tables — a second system of record — and (c) let the model's
 * chosen ids rewrite real EffectivenessCheck rows.
 *
 * Now: nothing is created anywhere by this call. It is pure analysis over the
 * tenant's real history, and the CAPA itself is created afterwards through the
 * normal `createCAPA` server action with its own authorization and audit trail.
 *
 * ── Why the history is read HERE and not upstream ─────────────
 * Tenant isolation is enforced by the session, in the same place every other
 * read in this app is scoped. The AI service never gets a database credential
 * and never gets to decide which tenant's records it may see — it only ever
 * receives rows this route already fetched for this user.
 */

/** Cap on history sent upstream. Ordered most-recent-first. */
const MAX_HISTORY = 40;
const MAX_PROBLEM_CHARS = 8000;

interface Body {
  problem_statement?: unknown;
  source?: unknown;
  area_affected?: unknown;
  equipment_product?: unknown;
  initial_severity?: unknown;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  // Recurrence analysis is part of authoring a CAPA, so it carries the same
  // authorization as authoring one. The AI service re-checks this from the
  // signed token — this is the first of two gates, not the only one.
  if (!canAuthorGxP(session.user.role)) {
    return NextResponse.json(
      { detail: "Your role is not permitted to author CAPA records." },
      { status: 403 },
    );
  }

  // Two request shapes: JSON for the common case, multipart when the user
  // attached a document (which is forwarded upstream for server-side text
  // extraction — the browser never parses a PDF).
  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  // This route bypasses the generic AI proxy (it needs Prisma access the proxy
  // has no business having), so it enforces the tenant's agent policy itself.
  // A policy that binds on one path and not another is not a policy.
  const policy = await getAgiPolicyForTenant(session.user.tenantId);
  if (!policy.agents.capa) {
    return NextResponse.json(
      {
        detail:
          "The CAPA AI agent is switched off for your organisation. " +
          "A QA Head or organisation admin can re-enable it in Settings → AGI Policy.",
      },
      { status: 403 },
    );
  }

  let body: Body;
  let document: File | null = null;
  if (isMultipart) {
    try {
      const form = await req.formData();
      const doc = form.get("document");
      document = doc instanceof File && doc.size > 0 ? doc : null;
      body = {
        problem_statement: form.get("problem_statement"),
        source: form.get("source"),
        area_affected: form.get("area_affected"),
        equipment_product: form.get("equipment_product"),
        initial_severity: form.get("initial_severity"),
      };
    } catch {
      return NextResponse.json({ detail: "Invalid form body" }, { status: 400 });
    }
  } else {
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
    }
  }

  const problem = str(body.problem_statement, MAX_PROBLEM_CHARS).trim();
  if (problem.length < 10) {
    return NextResponse.json(
      { detail: "problem_statement must be at least 10 characters" },
      { status: 422 },
    );
  }

  // ── The tenant's OWN closed CAPAs ──────────────────────────
  // Scoped by tenantId from the session, excluding soft-deleted rows. Only
  // resolved CAPAs are comparable: an open one has no outcome to learn from.
  let history: Array<Record<string, unknown>> = [];
  try {
    const rows = await prisma.cAPA.findMany({
      where: {
        tenantId: session.user.tenantId,
        deletedAt: null,
        status: { in: ["closed", "rejected"] },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_HISTORY,
      select: {
        reference: true,
        id: true,
        title: true,
        description: true,
        risk: true,
        status: true,
        updatedAt: true,
        effectivenessVerdict: true,
      },
    });
    history = rows.map((c) => ({
      // `reference` is what the user can actually open. Rows predating the
      // reference column fall back to a stable id-derived label rather than
      // being dropped — they are still real records worth comparing against.
      reference: c.reference ?? `CAPA-LEGACY-${c.id.slice(0, 8)}`,
      title: c.title ?? "",
      description: (c.description ?? "").slice(0, 600),
      area: "",
      equipment: "",
      risk: c.risk ?? "",
      status: c.status ?? "",
      closed_at: c.updatedAt ? c.updatedAt.toISOString().slice(0, 10) : "",
      // null (never reviewed) stays null — the analyser distinguishes "the
      // earlier fix failed" from "nobody checked whether it worked", and only
      // the first of those raises the recurrence risk score.
      was_effective:
        c.effectivenessVerdict == null
          ? null
          : c.effectivenessVerdict.toLowerCase() === "effective",
    }));
  } catch (err) {
    // A history read failure must not silently become "no recurrence". Fail the
    // request so the user is told, rather than shown a clean result.
    console.error("[api/ai/capa-recurrence] history query failed", err);
    return NextResponse.json(
      { detail: "Could not read your CAPA history. Please try again." },
      { status: 503 },
    );
  }

  const token = canMintAiToken() ? mintAiToken(session) : null;
  if (!token) {
    console.error("[api/ai/capa-recurrence] refusing to forward: AI_JWT_SECRET is not configured.");
    return NextResponse.json({ detail: AI_TOKEN_MISCONFIGURED }, { status: 503 });
  }

  const payload = JSON.stringify({
    problem_statement: problem,
    source: str(body.source, 120),
    area_affected: str(body.area_affected, 200),
    equipment_product: str(body.equipment_product, 200),
    initial_severity: str(body.initial_severity, 40),
    history,
    customer_id: session.user.tenantId,
  });

  let res: Response;
  try {
    if (document) {
      const fd = new FormData();
      fd.append("payload", payload);
      fd.append("document", document, document.name);
      res = await fetch(`${aiUpstreamBase()}/api/v1/capa-recurrence/analyze-with-document`, {
        method: "POST",
        headers: { auth: token },
        body: fd,
        cache: "no-store",
      });
    } else {
      res = await fetch(`${aiUpstreamBase()}/api/v1/capa-recurrence/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json", auth: token },
        body: payload,
        cache: "no-store",
      });
    }
  } catch (err) {
    return NextResponse.json(
      { detail: `Recurrence analysis unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
