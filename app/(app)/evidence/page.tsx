"use client";

import { EvidencePage } from "@/modules/evidence/EvidencePage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Evidence & Documents">
      <EvidencePage />
    </ErrorBoundary>
  );
}
