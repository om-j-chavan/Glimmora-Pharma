import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getDashboardStats, getOverallReadiness } from "@/lib/queries";

export const metadata = {
  title: "Dashboard — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  // Single compound query computes ~all dashboard data server-side.
  // `readinessScore` kept as a separate prop because the existing
  // DashboardPage already accepts it (last turn's wiring).
  const [stats, readinessScore] = await Promise.all([
    getDashboardStats(session.user.tenantId),
    getOverallReadiness(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Dashboard">
      <DashboardPage stats={stats} readinessScore={readinessScore} />
    </ErrorBoundary>
  );
}
