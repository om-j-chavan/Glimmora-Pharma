import { notFound } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { GOVERNANCE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { ManagementDecisionDetailPage } from "@/modules/governance/ManagementDecisionDetailPage";
import {
  getManagementDecision,
  getManagementDecisionDocuments,
  getManagementDecisionAuditTrail,
  getDecisionParticipants,
} from "@/lib/queries/managementDecisions";

// Same module gate as /governance — a decision detail URL must not bypass it.
const ALLOWED_ROLES = new Set<string>(GOVERNANCE_VIEW_ROLES);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "governance",
    redirectTo: "/",
    extra: { path: "/governance/decisions/[id]" },
  });

  // IDOR guard: getManagementDecision applies the visibility where-clause IN THE
  // QUERY. A seat user who is neither the creator nor an action-item owner gets
  // null and sees a 404 — indistinguishable from a meeting that does not exist.
  const decision = await getManagementDecision(id, session);
  if (!decision) notFound();

  // Both loaders re-check visibility themselves and return [] when denied.
  const [docs, audit, participants] = await Promise.all([
    getManagementDecisionDocuments(id, session),
    getManagementDecisionAuditTrail(id, session),
    getDecisionParticipants(session),
  ]);

  return (
    <ErrorBoundary moduleName="Management Decision">
      <ManagementDecisionDetailPage decision={decision} docs={docs} audit={audit} participants={participants} />
    </ErrorBoundary>
  );
}
