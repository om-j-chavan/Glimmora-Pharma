"use client";

import { InspectionPage } from "@/modules/inspection/InspectionPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Inspection">
      <InspectionPage />
    </ErrorBoundary>
  );
}
