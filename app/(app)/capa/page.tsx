import { ErrorBoundary } from "@/components/errors";
import { CAPAPage } from "@/modules/capa/CAPAPage";

export default function CAPAPageRoute() {
  return (
    <ErrorBoundary moduleName="CAPA Tracker">
      <CAPAPage />
    </ErrorBoundary>
  );
}
