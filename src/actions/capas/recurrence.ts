"use server";

import { requireAuth } from "@/lib/auth";
import { getSuggestedRecurrenceMatches } from "@/lib/queries/capas";
import type { ActionResult } from "./_types";

/* ── SME Section 1, Stage 6 (FULL) — recurrence suggestion read ───────
 *
 * Client-callable wrapper for getSuggestedRecurrenceMatches. Tenant
 * scope from session; siteId / windowDays optional from caller.
 * Returns Date fields as ISO strings so the Server-Action boundary
 * delivers a fully-serialisable payload.
 */
export async function loadSuggestedRecurrenceMatches(params: {
  siteId?: string;
  windowDays?: number;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const rows = await getSuggestedRecurrenceMatches({
    tenantId: session.user.tenantId,
    siteId: params.siteId,
    windowDays: params.windowDays,
  });
  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      description: r.description,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      effectivenessDueAt: r.effectivenessDate ? r.effectivenessDate.toISOString() : null,
      siteId: r.siteId,
      risk: r.risk,
    })),
  };
}
