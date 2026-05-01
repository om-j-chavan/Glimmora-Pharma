import { redirect } from "next/navigation";
import { AuditTrailPage } from "@/modules/audit-trail/AuditTrailPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getAuditLogs } from "@/lib/queries";

export const metadata = {
  title: "Audit Trail — Pharma Glimmora",
};

const ALLOWED_ROLES = new Set(["qa_head", "customer_admin", "super_admin"]);

export default async function Page() {
  const session = await requireAuth();
  if (!ALLOWED_ROLES.has(session.user.role)) {
    redirect("/");
  }

  const logs = await getAuditLogs(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Audit Trail">
      <AuditTrailPage logs={logs} />
    </ErrorBoundary>
  );
}
