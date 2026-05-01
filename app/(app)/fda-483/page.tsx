import { FDA483Page } from "@/modules/fda-483/FDA483Page";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getFDA483Events, getFDA483Stats } from "@/lib/queries";

export const metadata = {
  title: "FDA 483 & Regulatory — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  const [events, stats] = await Promise.all([
    getFDA483Events(session.user.tenantId),
    getFDA483Stats(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="FDA 483">
      <FDA483Page events={events} stats={stats} />
    </ErrorBoundary>
  );
}
