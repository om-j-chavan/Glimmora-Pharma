import { GovernancePage } from "@/modules/governance/GovernancePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getOverallReadiness } from "@/lib/queries";
import { getRisks, getRiskOwners } from "@/lib/queries/risks";
import { getManagementDecisions, getDecisionParticipants } from "@/lib/queries/managementDecisions";

export default async function Page() {
  const session = await requireAuth();
  // Both `getRisks` and `getManagementDecisions` apply their visibility
  // where-clause IN THE QUERY, so the client component only ever receives rows
  // this user is allowed to see.
  const [risks, riskOwners, decisions, participants, readinessScore] = await Promise.all([
    getRisks(session),
    getRiskOwners(session),
    getManagementDecisions(session),
    getDecisionParticipants(session),
    getOverallReadiness(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Governance & KPIs">
      <GovernancePage
        risks={risks}
        riskOwners={riskOwners}
        decisions={decisions}
        decisionParticipants={participants}
        readinessScore={readinessScore}
      />
    </ErrorBoundary>
  );
}
