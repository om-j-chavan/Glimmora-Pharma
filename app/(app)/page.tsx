"use client";

import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Dashboard">
      <DashboardPage />
    </ErrorBoundary>
  );
}
