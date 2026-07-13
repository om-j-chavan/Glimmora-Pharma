import { DeviationPage } from "@/modules/deviation/DeviationPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getDeviations, deviationVisibilityWhere } from "@/lib/queries";

export default async function Page() {
  const session = await requireAuth();
  // Phase 2 record-visibility: a non-see-all user sees only deviations they
  // created OR are a task-assignee on. See-all roles (customer_admin/qa_head/
  // super_admin) → {} → all tenant deviations (unchanged).
  const deviations = await getDeviations(session.user.tenantId, deviationVisibilityWhere(session));

  return (
    <ErrorBoundary moduleName="Deviation Management">
      <DeviationPage deviations={deviations} />
    </ErrorBoundary>
  );
}
