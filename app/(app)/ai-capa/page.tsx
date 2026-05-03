"use client";

import { AiCapaIndex } from "@/modules/ai-capa/AiCapaIndex";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="AI CAPAs">
      <AiCapaIndex />
    </ErrorBoundary>
  );
}
