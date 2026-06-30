import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getDashboardStats, getOverallReadiness, getFindings, getCAPAs, getDeviations, getSystems } from "@/lib/queries";

export const metadata = {
  title: "Dashboard — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  // Single compound query computes ~all dashboard data server-side.
  // `readinessScore` kept as a separate prop because the existing
  // DashboardPage already accepts it (last turn's wiring).
  // All tenant-scoped (session.user.tenantId) + cached; fetched in parallel
  // (no serial waterfall). The raw findings/capas/deviations seed the Redux
  // slices the dashboard reads, so it renders correct data on first paint
  // instead of waiting for another module's mount to hydrate the store.
  const [stats, readinessScore, findings, capas, deviations, systems] = await Promise.all([
    getDashboardStats(session.user.tenantId),
    getOverallReadiness(session.user.tenantId),
    getFindings(session.user.tenantId),
    getCAPAs(session.user.tenantId),
    getDeviations(session.user.tenantId),
    getSystems(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Dashboard">
      <DashboardPage
        stats={stats}
        readinessScore={readinessScore}
        findings={findings}
        capas={capas}
        deviations={deviations}
        systems={systems}
      />
    </ErrorBoundary>
  );
}
