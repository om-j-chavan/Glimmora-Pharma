"use client";

import { FDA483Page } from "@/modules/fda-483/FDA483Page";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="FDA 483">
      <FDA483Page />
    </ErrorBoundary>
  );
}
