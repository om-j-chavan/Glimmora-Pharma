import { GapPage } from "@/modules/gap-assessment/GapPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getFindings, getFindingEvidenceDocIds, getFindingAssignees } from "@/lib/queries";

export const metadata = {
  title: "Gap Assessment — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [findings, evidenceDocFindingIds, assignees] = await Promise.all([
    getFindings(session.user.tenantId),
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
