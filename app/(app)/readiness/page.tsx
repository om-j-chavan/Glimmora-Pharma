import { ReadinessPage } from "@/modules/readiness/ReadinessPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getInspections, getReadinessStats, getPlaybooks, inspectionVisibilityWhere } from "@/lib/queries";

export const metadata = {
  title: "Inspection Readiness — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
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
