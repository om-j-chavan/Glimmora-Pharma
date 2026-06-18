import { AuditTrailPage } from "@/modules/audit-trail/AuditTrailPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getAuditTrailView } from "@/lib/queries";

export const metadata = {
  title: "Audit Trail — Pharma Glimmora",
};

const ALLOWED_ROLES = new Set(["qa_head", "customer_admin", "super_admin"]);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "audit_trail" });

  const result = await getAuditTrailView(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Audit Trail">
      <AuditTrailPage {...result} />
    </ErrorBoundary>
  );
}
