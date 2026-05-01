import { GovernancePage } from "@/modules/governance/GovernancePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getRAIDItems, getOverallReadiness } from "@/lib/queries";

export default async function Page() {
  const session = await requireAuth();
  const [raidItems, readinessScore] = await Promise.all([
    getRAIDItems(session.user.tenantId),
    getOverallReadiness(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Governance & KPIs">
      <GovernancePage raidItems={raidItems} readinessScore={readinessScore} />
    </ErrorBoundary>
  );
}
