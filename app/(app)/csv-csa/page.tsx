import { CSVPage } from "@/modules/csv-csa/CSVPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { CSV_MODULE_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { getSystems, getDeletedSystems, getSystemsStats, getRTMStats, systemVisibilityWhere } from "@/lib/queries";

export const metadata = {
  title: "CSV/CSA Validation — Pharma Glimmora",
};

// CSV/CSA is restricted to qa_head + customer_admin + csv_val_lead. Enforced at
// the ROUTE (server) level so hiding the sidebar entry is not the only barrier —
// a typed URL is redirected and the denial is written to the audit trail.
const ALLOWED_ROLES = new Set<string>(CSV_MODULE_VIEW_ROLES);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "csv-csa",
    redirectTo: "/",
    extra: { path: "/csv-csa" },
  });
  const [systems, stats, rtmStats] = await Promise.all([
    // Phase 4 record-visibility: a non-see-all user sees only systems they
    // created OR are a rework-task assignee on. Stats stay tenant-wide (Phase 6).
    getSystems(session.user.tenantId, systemVisibilityWhere(session)),
    getSystemsStats(session.user.tenantId),
    getRTMStats(session.user.tenantId),
  ]);

  // RUNG 3B — archived systems are admin-only; non-admins never receive the
  // data (archive view + restore are gated to customer_admin/super_admin).
  const isAdmin = session.user.role === "customer_admin" || session.user.role === "super_admin";
  const deletedSystems = isAdmin ? await getDeletedSystems(session.user.tenantId) : [];

  return (
    <ErrorBoundary moduleName="CSV/CSA Validation">
      <CSVPage systems={systems} deletedSystems={deletedSystems} stats={stats} rtmStats={rtmStats} />
    </ErrorBoundary>
  );
}
