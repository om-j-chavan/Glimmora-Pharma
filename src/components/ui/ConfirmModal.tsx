"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

/**
 * Reusable, compact (square-ish) confirmation modal. Context-agnostic — the
 * caller supplies the title / message / confirm label, so it works for logout,
 * suspend, delete, restore, etc. Follows the shared Modal pattern (portal into
 * <body>, backdrop, popupIn animation, design tokens) but with a small centred
 * layout instead of the wide 680px form modal.
 *
 * Copy is NEVER hardcoded here — pass it via props.
 */
export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm-button intent: 'primary' (default), 'danger', or 'warning'. */
  variant?: "primary" | "danger" | "warning";
  /** Optional icon rendered in the header badge. */
  icon?: ComponentType<{ className?: string }>;
  /** Disables the buttons + shows a busy label while an async confirm runs. */
  loading?: boolean;
}

const VARIANT: Record<NonNullable<ConfirmModalProps["variant"]>, { badgeBg: string; color: string; btnBg: string; btnText: string }> = {
  primary: { badgeBg: "var(--brand-muted)", color: "var(--brand)", btnBg: "var(--brand)", btnText: "#ffffff" },
  danger: { badgeBg: "var(--danger-bg)", color: "var(--danger)", btnBg: "var(--danger)", btnText: "#ffffff" },
  warning: { badgeBg: "var(--warning-bg)", color: "var(--warning)", btnBg: "var(--warning)", btnText: "#ffffff" },
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  icon: Icon,
  loading = false,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose(); };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
    };
  }, [open, onClose, loading]);

  if (!open || !mounted) return null;
  const v = VARIANT[variant];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={loading ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative w-full max-w-[360px] flex flex-col items-center text-center gap-4 p-6",
          "rounded-2xl border shadow-2xl",
          "bg-(--bg-surface) border-(--bg-border)",
          "animate-[popupIn_0.15s_ease-out] focus:outline-none",
        )}
      >
        {Icon && (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: v.badgeBg }}
          >
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div className="space-y-1.5">
          <h2 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          {message && (
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{message}</div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 w-full pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="py-2.5 rounded-lg text-[13px] font-semibold border cursor-pointer transition-colors disabled:opacity-50"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)", color: "var(--text-primary)" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="py-2.5 rounded-lg text-[13px] font-semibold border-none cursor-pointer transition-opacity disabled:opacity-60"
            style={{ background: v.btnBg, color: v.btnText }}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
