import { ErrorBoundary } from "@/components/errors";
import { CAPAPage } from "@/modules/capa/CAPAPage";
import { requireAuth } from "@/lib/auth";
import { getCAPAs } from "@/lib/queries";

export const metadata = {
  title: "CAPA Tracker — Pharma Glimmora",
};

export default async function CAPAPageRoute() {
  const session = await requireAuth();
  const capas = await getCAPAs(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="CAPA Tracker">
      <CAPAPage capas={capas} />
    </ErrorBoundary>
  );
}
