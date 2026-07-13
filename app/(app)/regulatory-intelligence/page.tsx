import { RegulatoryIntelligencePage } from "@/modules/regulatory-intelligence/RegulatoryIntelligencePage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";

export const metadata = {
  title: "Regulatory Intelligence — Pharma Glimmora",
};

/**
 * Regulatory Intelligence route.
 *
 * The feature is a client-side AGI surface: guidance data flows through the
 * mock AI gateway (getRegulatoryIntelligence) in the browser, so no server
 * data fetch is needed yet. We still gate on requireAuth() and wrap in the
 * module ErrorBoundary, matching every other (app) route. When a real
 * agency-feed backend is wired, fetch + pass it as props here.
 */
export default async function Page() {
  await requireAuth();
  return (
    <ErrorBoundary moduleName="Regulatory Intelligence">
      <RegulatoryIntelligencePage />
    </ErrorBoundary>
  );
}
