import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { CAPAPage } from "@/modules/capa/CAPAPage";
import { requireAuth } from "@/lib/auth";
import { getCAPAs } from "@/lib/queries";
import { getEffectivenessChecksDue, getOpenGapFindings, getOpenDeviations } from "@/lib/queries/capas";
import { CAPA_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";

export const metadata = {
  title: "CAPA Tracker — Pharma Glimmora",
};

export default async function CAPAPageRoute() {
  const session = await requireAuth();
  // Phase 6 cleanup FIX 1 — the CAPA module is qa_head/customer_admin only;
  // everyone else works their CAPAs through the Worklist.
  if (!CAPA_MODULE_VIEW_ROLES.includes(session.user.role)) redirect("/worklist");
  // Phase 6 — surface Phase 2's dormant effectiveness-due query in the tracker.
  const [capas, effectivenessDue, gapFindings, deviations] = await Promise.all([
    getCAPAs(session.user.tenantId),
    getEffectivenessChecksDue(session.user.tenantId),
    getOpenGapFindings(session.user.tenantId),
    getOpenDeviations(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="CAPA Tracker">
      <CAPAPage
        capas={capas}
        effectivenessDue={effectivenessDue.map((e) => ({
          id: e.id,
          reference: e.reference,
          description: e.description,
          risk: e.risk,
          effectivenessDate: e.effectivenessDate ? e.effectivenessDate.toISOString() : null,
        }))}
        gapFindings={gapFindings}
        deviations={deviations}
      />
    </ErrorBoundary>
  );
}
