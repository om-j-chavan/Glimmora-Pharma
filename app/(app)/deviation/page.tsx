"use client";

import { DeviationPage } from "@/modules/deviation/DeviationPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Deviation Management">
      <DeviationPage />
    </ErrorBoundary>
  );
}
