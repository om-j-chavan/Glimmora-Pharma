import { AuditTrailPage } from "@/modules/audit-trail/AuditTrailPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getAuditTrailPage, getAuditTrailFilterOptions } from "@/lib/queries";

export const metadata = {
  title: "Audit Log — Pharma Glimmora",
};

const ALLOWED_ROLES = new Set(["qa_head", "customer_admin", "super_admin"]);
// MUST match AuditTrailPage's DataTable pageSize (this seeds page 1).
const PAGE_SIZE = 25;

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "audit_trail" });

  // Scope pinned to the caller's tenant inside both queries — never widened.
  const [first, options] = await Promise.all([
    getAuditTrailPage(session.user.tenantId, { page: 1, pageSize: PAGE_SIZE }),
    getAuditTrailFilterOptions(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Audit Trail">
      <AuditTrailPage initialData={{ rows: first.rows, total: first.total }} options={options} />
    </ErrorBoundary>
  );
}
