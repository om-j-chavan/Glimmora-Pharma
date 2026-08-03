import { ReadinessPage } from "@/modules/readiness/ReadinessPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { READINESS_VIEW_ROLES } from "@/lib/permissions/roleSets";
import { getInspections, getReadinessStats, getPlaybooks, inspectionVisibilityWhere } from "@/lib/queries";

export const metadata = {
  title: "Inspection Readiness — Pharma Glimmora",
};

// Training & Awareness / Inspection Readiness is restricted to the two tenant
// quality-oversight identities (qa_head + customer_admin). Route-level gate so a
// typed URL is blocked, not just the hidden sidebar entry.
const ALLOWED_ROLES = new Set<string>(READINESS_VIEW_ROLES);

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "readiness",
    redirectTo: "/",
    extra: { path: "/readiness" },
  });
  const [inspections, stats, playbooks] = await Promise.all([
    // Phase 5 record-visibility: a non-see-all user sees only inspections they
    // created. Stats stay tenant-wide (Phase 6 aggregate deferral).
    getInspections(session.user.tenantId, inspectionVisibilityWhere(session)),
    getReadinessStats(session.user.tenantId),
    getPlaybooks(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Inspection Readiness">
      <ReadinessPage inspections={inspections} stats={stats} playbooks={playbooks} />
    </ErrorBoundary>
  );
}
