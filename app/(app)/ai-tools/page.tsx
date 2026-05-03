"use client";

import { AiToolsPage } from "@/modules/ai-tools/AiToolsPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="AI Backend Tools">
      <AiToolsPage />
    </ErrorBoundary>
  );
}
