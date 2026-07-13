import { AGIPage } from "@/modules/agi-console/AGIPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getAGIActivityLogs } from "@/lib/queries";

export const metadata = {
  title: "AGI Console — Pharma Glimmora",
};

// Mirrors src/store/permissions.slice.ts DEFAULT_MATRIX — every role declared
// in that matrix has at least readonly access to `agi`. The list is explicit
// here so a future tightening (e.g. dropping `viewer` from `agi` access) is a
// one-line change at the server gate without depending on Redux client state.
const ALLOWED_ROLES = new Set([
  "super_admin",
  "customer_admin",
  "qa_head",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
]);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "agi_console",
    extra: { path: "/agi-console" },
  });

  const activityLogs = await getAGIActivityLogs(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="AGI Console">
      <AGIPage activityLogs={activityLogs} />
    </ErrorBoundary>
  );
}
