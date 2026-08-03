import { notFound } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { GOVERNANCE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { RiskDetailPage } from "@/modules/governance/RiskDetailPage";
import { getRisk, getRiskDocuments, getRiskAuditTrail, getRiskOwners, getRiskConversion } from "@/lib/queries/risks";

// Same module gate as /governance — a risk detail URL must not bypass it. The
// per-record visibility where-clause below is a SECOND, narrower check; this one
// answers "may this role open the Governance module at all".
const ALLOWED_ROLES = new Set<string>(GOVERNANCE_VIEW_ROLES);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "governance",
    redirectTo: "/",
    extra: { path: "/governance/risks/[id]" },
  });

  // IDOR guard: getRisk applies riskVisibilityWhere IN THE QUERY. A seat user who
  // is neither creator nor owner gets null here and sees a 404 — indistinguishable
  // from a risk that does not exist, so the id cannot be probed.
  const risk = await getRisk(id, session);
  if (!risk) notFound();

  // Each loader re-checks visibility itself and returns empty/null when denied.
  const [docs, audit, owners, conversion] = await Promise.all([
    getRiskDocuments(id, session),
    getRiskAuditTrail(id, session),
    getRiskOwners(session),
    getRiskConversion(id, session),
  ]);

  return (
    <ErrorBoundary moduleName="Risk Detail">
      <RiskDetailPage risk={risk} docs={docs} audit={audit} owners={owners} conversion={conversion} />
    </ErrorBoundary>
  );
}
