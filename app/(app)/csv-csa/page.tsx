import { CSVPage } from "@/modules/csv-csa/CSVPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getSystems, getSystemsStats, getRTMStats } from "@/lib/queries";

export const metadata = {
  title: "CSV/CSA Validation — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [systems, stats, rtmStats] = await Promise.all([
    getSystems(session.user.tenantId),
    getSystemsStats(session.user.tenantId),
    getRTMStats(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="CSV/CSA Validation">
      <CSVPage systems={systems} stats={stats} rtmStats={rtmStats} />
    </ErrorBoundary>
  );
}
