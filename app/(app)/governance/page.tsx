import { GovernancePage } from "@/modules/governance/GovernancePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getOverallReadiness, getFindings, getCAPAs, getSystems, getFDA483Events } from "@/lib/queries";
import { getRisks, getRiskOwners } from "@/lib/queries/risks";
import { getManagementDecisions, getDecisionParticipants } from "@/lib/queries/managementDecisions";

export default async function Page() {
  const session = await requireAuth();
  // Risks + decisions apply their visibility where-clause IN THE QUERY, so the
  // client only ever receives rows this user may see.
  //
  // Phase 6 — KPI PARITY WITH THE DASHBOARD. The KPI Scorecard reads TENANT-WIDE
  // aggregates (findings / CAPAs / systems / 483 events), NOT the visibility-
  // scoped Redux slices it used before. Fetching them here (no visibility
  // fragment, exactly like app/(app)/page.tsx does for the Dashboard) means a
  // user who lands directly on /governance sees the SAME totals as the Dashboard
  // instead of KPIs computed from whatever the Redux slices happened to be
  // seeded with. These arrays are aggregates only — never rendered as rows.
  const [
    risks, riskOwners, decisions, participants, readinessScore,
    allFindings, allCAPAs, allSystems, allFDA483,
  ] = await Promise.all([
    getRisks(session),
    getRiskOwners(session),
    getManagementDecisions(session),
    getDecisionParticipants(session),
    getOverallReadiness(session.user.tenantId),
    getFindings(session.user.tenantId),
    getCAPAs(session.user.tenantId),
    getSystems(session.user.tenantId),
    getFDA483Events(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Governance & KPIs">
      <GovernancePage
        risks={risks}
        riskOwners={riskOwners}
        decisions={decisions}
        decisionParticipants={participants}
        readinessScore={readinessScore}
        allFindings={allFindings}
        allCAPAs={allCAPAs}
        allSystems={allSystems}
        allFDA483={allFDA483}
      />
    </ErrorBoundary>
  );
}
