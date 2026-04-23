"use client";

import { SettingsPage } from "@/modules/settings/SettingsPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  return (
    <ErrorBoundary moduleName="Settings">
      <SettingsPage />
    </ErrorBoundary>
  );
}
