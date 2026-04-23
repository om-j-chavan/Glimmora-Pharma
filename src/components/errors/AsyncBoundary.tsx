"use client";

import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface Props {
  children: ReactNode;
  moduleName?: string;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

function DefaultLoading() {
  return (
    <div className="flex items-center justify-center p-12" aria-busy="true" aria-label="Loading">
      <div className="space-y-3 w-full max-w-md animate-pulse">
        <div className="h-3 rounded-full" style={{ background: "var(--bg-elevated)", width: "60%" }} />
        <div className="h-3 rounded-full" style={{ background: "var(--bg-elevated)", width: "80%" }} />
        <div className="h-3 rounded-full" style={{ background: "var(--bg-elevated)", width: "40%" }} />
      </div>
    </div>
  );
}

export function AsyncBoundary({ children, moduleName, fallback, loadingFallback }: Props) {
  return (
    <ErrorBoundary moduleName={moduleName} fallback={fallback}>
      <Suspense fallback={loadingFallback ?? <DefaultLoading />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
