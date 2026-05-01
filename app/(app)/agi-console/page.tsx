import { AGIPage } from "@/modules/agi-console/AGIPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getAGIActivityLogs } from "@/lib/queries";

export const metadata = {
  title: "AGI Console — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const activityLogs = await getAGIActivityLogs(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="AGI Console">
      <AGIPage activityLogs={activityLogs} />
    </ErrorBoundary>
  );
}
