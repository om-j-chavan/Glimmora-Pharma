import { GapPage } from "@/modules/gap-assessment/GapPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getFindings, getFindingEvidenceDocIds, getFindingAssignees, findingVisibilityWhere } from "@/lib/queries";

export const metadata = {
  title: "Gap Assessment — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [findings, evidenceDocFindingIds, assignees] = await Promise.all([
    // Phase 3 record-visibility: a non-see-all user sees only findings they
    // created OR own (are assigned to). See-all roles → {} → all tenant findings.
    getFindings(session.user.tenantId, findingVisibilityWhere(session)),
    getFindingEvidenceDocIds(session.user.tenantId),
    // Server-scoped assignee pool (tenant + the assigner's own site) — the
    // dropdown renders exactly this, so selection can't widen scope.
    getFindingAssignees(session),
  ]);

  return (
    <ErrorBoundary moduleName="Gap Assessment">
      <GapPage findings={findings} evidenceDocFindingIds={evidenceDocFindingIds} assignees={assignees} />
    </ErrorBoundary>
  );
}
