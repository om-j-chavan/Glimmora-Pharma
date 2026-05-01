import { DeviationPage } from "@/modules/deviation/DeviationPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getDeviations } from "@/lib/queries";

export default async function Page() {
  const session = await requireAuth();
  const deviations = await getDeviations(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Deviation Management">
      <DeviationPage deviations={deviations} />
    </ErrorBoundary>
  );
}
