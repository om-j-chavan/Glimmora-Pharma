"use client";

import { AIPolicyPage } from "@/modules/settings/AIPolicyPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="AI Policy">
      <AIPolicyPage />
    </ErrorBoundary>
  );
}
