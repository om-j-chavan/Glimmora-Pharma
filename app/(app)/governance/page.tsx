"use client";

import { GovernancePage } from "@/modules/governance/GovernancePage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Governance & KPIs">
      <GovernancePage />
    </ErrorBoundary>
  );
}
