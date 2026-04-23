"use client";

import { AGIPage } from "@/modules/agi-console/AGIPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="AGI Console">
      <AGIPage />
    </ErrorBoundary>
  );
}
