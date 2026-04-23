"use client";

import { CSVPage } from "@/modules/csv-csa/CSVPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="CSV/CSA Validation">
      <CSVPage />
    </ErrorBoundary>
  );
}
