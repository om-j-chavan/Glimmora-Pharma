"use server";

import { requireAuth } from "@/lib/auth";
import { getDashboardStats } from "@/lib/queries";
import { sanitizeServerError } from "@/lib/errors";
import type { ComplianceSnapshot } from "@/lib/aiData";

/**
 * Live compliance counts for the Compliance Assistant chatbot's data-question
 * answers ("how many open CAPAs?", "any overdue deviations?").
 *
 * The grounded /api/ai/help endpoint answers KNOWLEDGE questions from the SOP /
 * app-guidance corpus and deliberately cannot answer live-data questions — those
 * need the tenant's actual records. This action supplies exactly those numbers,
 * pulled from the SAME tenant-scoped query the Dashboard uses, so the figures the
 * assistant quotes always match what the user sees on screen.
 *
 * Read-only: it counts records, never mutates anything. Tenant isolation comes
 * from requireAuth() → the caller's own session, so one tenant can never read
 * another's numbers.
 *
 * The ComplianceSnapshot type lives in @/lib/aiData (a non-"use server" module)
 * so this file exports only the async action — a "use server" file must not
 * export non-function values.
 */
export async function getComplianceSnapshot(): Promise<ComplianceSnapshot> {
  const session = await requireAuth();
  try {
    const s = await getDashboardStats(session.user.tenantId);
    return {
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
    throw new Error(sanitizeServerError(err, "Could not read compliance data."));
  }
}
