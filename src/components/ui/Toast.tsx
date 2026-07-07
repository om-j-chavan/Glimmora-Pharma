"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string, duration?: number) => string;
  dismiss: (id: string) => void;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const PALETTE: Record<ToastKind, { bg: string; border: string; text: string; Icon: typeof CheckCircle }> = {
  success: { bg: "#d1fae5", border: "#10b981", text: "#065f46", Icon: CheckCircle },
  error:   { bg: "#fee2e2", border: "#dc2626", text: "#991b1b", Icon: AlertCircle },
  info:    { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af", Icon: Info },
};

// Per-kind defaults: success is quick confirmation, info is the most
// transient, error gets the longest hold because the user needs time to
// read what went wrong. Callers can still override per-call.
const DEFAULT_DURATIONS: Record<ToastKind, number> = {
  success: 3000,
  info:    2500,
  error:   5000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Tracks the setTimeout handles per-toast so dismiss() can clear them and
  // toasts that are dismissed early don't leak timers.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const handle = timersRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback((kind: ToastKind, message: string, duration?: number) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const effectiveDuration = duration ?? DEFAULT_DURATIONS[kind];
    setToasts((prev) => [...prev, { id, kind, message, duration: effectiveDuration }]);
    if (effectiveDuration > 0) {
      const handle = setTimeout(() => dismiss(id), effectiveDuration);
      timersRef.current.set(id, handle);
    }
    return id;
  }, [dismiss]);

  useEffect(() => {
    // Snapshot the ref's current value so the cleanup doesn't read a stale
    // ref.current after the component unmounts.
    const timers = timersRef.current;
    return () => {
      timers.forEach((h) => clearTimeout(h));
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    show,
    dismiss,
    success: (m, d) => show("success", m, d),
    error:   (m, d) => show("error",   m, d),
    info:    (m, d) => show("info",    m, d),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider> (mounted in Providers.tsx).");
  }
  return ctx;
}

/* ── Viewport: stacked fixed top-center ───────────────────────────
   Centered horizontally just below the top edge of the viewport. Stacks
   downward so the newest toast slides in above the older ones.

   Rendered via a PORTAL into <body> (like Modal/ConfirmModal) so the fixed
   position always resolves against the viewport and can never be trapped or
   clipped by an ancestor stacking context/overflow in a given shell. z-[100]
   sits ABOVE the modal layer (z-50), so a success/error toast is visible even
   while a confirmation modal is open. This is what makes toasts show reliably
   across every shell, including the Super Admin console. */

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  // Portal target is client-only — defer the first render so we never call
  // createPortal during SSR (document is undefined there).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-auto max-w-[90vw] sm:max-w-md pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const palette = PALETTE[toast.kind];
  const Icon = palette.Icon;
  // Errors interrupt (assertive/alert) so a failed save is announced even if a
  // screen reader is mid-utterance; success/info stay polite to avoid stepping
  // on the user's flow.
  const isError = toast.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-lg min-w-[260px] max-w-[380px] animate-in slide-in-from-top-4 fade-in duration-200"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 text-[12px] font-medium leading-snug">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 -mr-1 -mt-0.5 inline-flex items-center justify-center min-w-[24px] min-h-[24px] rounded hover:bg-black/5 transition-colors border-none bg-transparent cursor-pointer"
        style={{ color: palette.text }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
