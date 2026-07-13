import { notFound } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { RiskDetailPage } from "@/modules/governance/RiskDetailPage";
import { getRisk, getRiskDocuments, getRiskAuditTrail, getRiskOwners, getRiskConversion } from "@/lib/queries/risks";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();

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
