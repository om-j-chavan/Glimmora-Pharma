import { GovernancePage } from "@/modules/governance/GovernancePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { GOVERNANCE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { getOverallReadiness } from "@/lib/queries";
import { getRisks, getRiskOwners } from "@/lib/queries/risks";
import { getManagementDecisions, getDecisionParticipants } from "@/lib/queries/managementDecisions";

// Governance & KPIs is restricted to qa_head + customer_admin (super_admin is
// platform-only). Enforced here at the ROUTE (server) level — before any data
// fetch — so an unauthorized role is redirected with no flash of content.
const ALLOWED_ROLES = new Set<string>(GOVERNANCE_VIEW_ROLES);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "governance",
    redirectTo: "/",
    extra: { path: "/governance" },
  });
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
