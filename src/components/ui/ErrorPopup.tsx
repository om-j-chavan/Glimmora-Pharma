"use client";

import { useState, useCallback } from "react";
import { Popup } from "@/components/ui/Popup";

/**
 * Standard action-failure surface. A thin, opinionated wrapper over <Popup>
 * so every module reports a failed server action the same way instead of
 * hand-rolling `variant="error"` popups (or, worse, a silent console.error).
 */
export function ErrorPopup({
  message,
  onDismiss,
  title = "Something went wrong",
}: {
  message: string | null;
  onDismiss: () => void;
  title?: string;
}) {
  return (
    <Popup
      isOpen={!!message}
      variant="error"
      title={title}
      description={message ?? undefined}
      onDismiss={onDismiss}
    />
  );
}

/**
 * Pairs a one-line error string with a ready-to-render <ErrorPopup>. Collapses
 * the `useState` + inline <Popup> boilerplate that was repeated across the
 * readiness tabs into a single call:
 *
 *   const { setError, errorPopup } = useErrorPopup();
 *   ...
 *   if (!result.success) { setError(result.error ?? "…"); return; }
 *   ...
 *   return (<>{…}{errorPopup}</>);
 */
export function useErrorPopup(title?: string) {
  const [message, setMessage] = useState<string | null>(null);
  const clearError = useCallback(() => setMessage(null), []);
  const errorPopup = <ErrorPopup message={message} onDismiss={clearError} title={title} />;
  return { error: message, setError: setMessage, clearError, errorPopup };
}
