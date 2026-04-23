"use client";

import { AuditTrailPage } from "@/modules/audit-trail/AuditTrailPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Audit Trail">
      <AuditTrailPage />
    </ErrorBoundary>
  );
}
