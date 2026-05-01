import { ReadinessPage } from "@/modules/readiness/ReadinessPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getInspections, getReadinessStats, getPlaybooks } from "@/lib/queries";

export const metadata = {
  title: "Inspection Readiness — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [inspections, stats, playbooks] = await Promise.all([
    getInspections(session.user.tenantId),
    getReadinessStats(session.user.tenantId),
    getPlaybooks(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Inspection Readiness">
      <ReadinessPage inspections={inspections} stats={stats} playbooks={playbooks} />
    </ErrorBoundary>
  );
}
