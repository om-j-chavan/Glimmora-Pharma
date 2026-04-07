import { useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAppSelector } from "@/hooks/useAppSelector";

export type PopupVariant =
  | "success"
  | "error"
  | "warning"
  | "confirmation"
  | "progress";

export interface PopupAction {
  label: string;
  onClick: () => void;
  style?: "primary" | "ghost";
}

export interface PopupProps {
  isOpen: boolean;
  variant: PopupVariant;
  title: string;
  description?: string;
  actions?: PopupAction[];
  progress?: number;
  progressLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

const CONFIG = {
  success: {
    Icon: CheckCircle2,
    iconColor: "#10b981",
    iconBg: {
      dark: "bg-[rgba(16,185,129,0.12)]",
      light: "bg-[#f0fdf4]",
    },
    border: {
      dark: "border-[rgba(16,185,129,0.25)]",
      light: "border-[#a7f3d0]",
    },
    timerColor: "bg-[#10b981]",
  },
  error: {
    Icon: AlertCircle,
    iconColor: "#ef4444",
    iconBg: {
      dark: "bg-[rgba(239,68,68,0.12)]",
      light: "bg-[#fef2f2]",
    },
    border: {
      dark: "border-[rgba(239,68,68,0.25)]",
      light: "border-[#fca5a5]",
    },
    primaryBtn: {
      dark: "bg-[#ef4444] hover:bg-[#dc2626] text-white",
      light: "bg-[#dc2626] hover:bg-[#b91c1c] text-white",
    },
  },
  warning: {
    Icon: AlertTriangle,
    iconColor: "#f59e0b",
    iconBg: {
      dark: "bg-[rgba(245,158,11,0.12)]",
      light: "bg-[#fffbeb]",
    },
    border: {
      dark: "border-[rgba(245,158,11,0.25)]",
      light: "border-[#fcd34d]",
    },
    primaryBtn: {
      dark: "bg-[#f59e0b] hover:bg-[#d97706] text-[#0a1628]",
      light: "bg-[#d97706] hover:bg-[#b45309] text-white",
    },
    ghostBtn: {
      dark: "bg-[rgba(245,158,11,0.08)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)] hover:bg-[rgba(245,158,11,0.14)]",
      light:
        "bg-[#fffbeb] text-[#92400e] border border-[#fcd34d] hover:bg-[#fef3c7]",
    },
  },
  confirmation: {
    Icon: AlertTriangle,
    iconColor: "#ef4444",
    iconBg: {
      dark: "bg-[rgba(239,68,68,0.1)]",
      light: "bg-[#fef2f2]",
    },
    border: {
      dark: "border-[rgba(239,68,68,0.2)]",
      light: "border-[#fca5a5]",
    },
    primaryBtn: {
      dark: "bg-[#ef4444] hover:bg-[#dc2626] text-white",
      light: "bg-[#dc2626] hover:bg-[#b91c1c] text-white",
    },
    ghostBtn: {
      dark: "bg-[rgba(255,255,255,0.04)] text-[#94a3b8] border border-[#1e3a5a] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e2e8f0]",
      light:
        "bg-[#f3f4f6] text-[#374151] border border-[#d1d5db] hover:bg-[#e5e7eb] hover:text-[#111827]",
    },
  },
  progress: {
    Icon: Loader2,
    iconColor: "#6366f1",
    iconBg: {
      dark: "bg-[rgba(99,102,241,0.12)]",
      light: "bg-[#eef2ff]",
    },
    border: {
      dark: "border-[rgba(99,102,241,0.25)]",
      light: "border-[#c4b5fd]",
    },
    barColor: "bg-[#6366f1]",
    trackColor: { dark: "bg-[#0a1f38]", light: "bg-[#eef2ff]" },
    progressValColor: { dark: "text-[#818cf8]", light: "text-[#4f46e5]" },
  },
} as const;

export function Popup({
  isOpen,
  variant,
  title,
  description,
  actions,
  progress,
  progressLabel,
  onDismiss,
  className,
}: PopupProps) {
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const m = isDark ? "dark" : "light";
  const cfg = CONFIG[variant];
  const { Icon } = cfg;
  const panelRef = useRef<HTMLDivElement>(null);

  // Success auto-dismiss
  useEffect(() => {
    if (variant !== "success" || !isOpen) return;
    const t = setTimeout(() => onDismiss?.(), 1500);
    return () => clearTimeout(t);
  }, [variant, isOpen, onDismiss]);

  // Escape key to dismiss
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && variant !== "progress") onDismiss?.();
    },
    [onDismiss, variant],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Focus the panel on open
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const resolvedActions: PopupAction[] =
    actions ??
    (variant === "error"
      ? [{ label: "Dismiss", style: "primary", onClick: () => onDismiss?.() }]
      : variant === "warning"
        ? [
            { label: "Later", style: "ghost", onClick: () => onDismiss?.() },
            { label: "View", style: "primary", onClick: () => onDismiss?.() },
          ]
        : variant === "confirmation"
          ? [
              { label: "Cancel", style: "ghost", onClick: () => onDismiss?.() },
              { label: "Confirm", style: "primary", onClick: () => onDismiss?.() },
            ]
          : []);

  const showClose =
    variant === "error" ||
    variant === "warning" ||
    variant === "confirmation";

  const showActions =
    resolvedActions.length > 0 &&
    variant !== "success" &&
    variant !== "progress";

  const primaryBtnCls = (cfg as Record<string, unknown>).primaryBtn as
    | Record<string, string>
    | undefined;
  const ghostBtnCls = (cfg as Record<string, unknown>).ghostBtn as
    | Record<string, string>
    | undefined;
  const progressCfg = variant === "progress" ? CONFIG.progress : null;

  const canDismissBackdrop = variant !== "progress";

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={canDismissBackdrop ? () => onDismiss?.() : undefined}
    >
      {/* Backdrop */}
      <div
        className={clsx(
          "absolute inset-0",
          isDark ? "bg-[rgba(0,0,0,0.6)]" : "bg-[rgba(0,0,0,0.3)]",
        )}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role={
          variant === "error" || variant === "warning"
            ? "alert"
            : variant === "confirmation"
              ? "dialog"
              : "status"
        }
        aria-modal={variant === "confirmation" ? true : undefined}
        aria-live={
          variant === "error" || variant === "warning" ? "assertive" : "polite"
        }
        aria-labelledby="popup-title"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "relative rounded-xl overflow-hidden w-full max-w-[380px] border shadow-2xl",
          "animate-[popupIn_0.15s_ease-out]",
          isDark ? "bg-[#071526]" : "bg-white",
          cfg.border[m],
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-4 pt-4 pb-3">
          <div
            className={clsx(
              "w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0",
              cfg.iconBg[m],
            )}
          >
            <Icon
              className={clsx(
                "w-4 h-4",
                variant === "progress" && "animate-spin",
              )}
              style={{ color: cfg.iconColor }}
              strokeWidth={2.5}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p
              id="popup-title"
              className={clsx(
                "text-[13px] font-semibold leading-snug",
                isDark ? "text-[#e2e8f0]" : "text-[#111827]",
              )}
            >
              {title}
            </p>
            {description && (
              <p
                className={clsx(
                  "text-[12px] mt-1 leading-relaxed",
                  isDark ? "text-[#8899b8]" : "text-[#6b7280]",
                  variant === "progress" && "animate-pulse",
                )}
              >
                {description}
              </p>
            )}
          </div>

          {showClose && (
            <button
              type="button"
              onClick={() => onDismiss?.()}
              aria-label="Dismiss"
              className="w-5 h-5 flex items-center justify-center shrink-0 border-none bg-transparent outline-none cursor-pointer rounded p-0 opacity-40 hover:opacity-100 transition-opacity duration-150"
            >
              <X
                className="w-3.5 h-3.5"
                style={{ stroke: isDark ? "#94a3b8" : "#374151" }}
                strokeWidth={2.5}
              />
            </button>
          )}
        </div>

        {/* Success timer bar */}
        {variant === "success" && (
          <div
            className={clsx(
              "h-[2px] overflow-hidden",
              isDark
                ? "bg-[rgba(255,255,255,0.05)]"
                : "bg-[rgba(0,0,0,0.06)]",
            )}
          >
            <div
              className={clsx(
                "h-full",
                (cfg as typeof CONFIG.success).timerColor,
              )}
              style={{ animation: "shrink 1.5s linear forwards" }}
            />
          </div>
        )}

        {/* Progress bar */}
        {variant === "progress" && progressCfg && (
          <div className="px-4 pb-4">
            <div
              className={clsx(
                "h-1 rounded-full overflow-hidden",
                progressCfg.trackColor[m],
              )}
            >
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-300",
                  progressCfg.barColor,
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, progress ?? 0))}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span
                className={clsx(
                  "text-[10px]",
                  isDark ? "text-[#6b7fa3]" : "text-[#9ca3af]",
                )}
              >
                {progressLabel ?? "Processing..."}
              </span>
              <span className={clsx("text-[10px]", progressCfg.progressValColor[m])}>
                {Math.round(progress ?? 0)}%
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {showActions && (
          <div className="flex items-center justify-end gap-2 px-4 pb-4">
            {resolvedActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={action.onClick}
                className={clsx(
                  "px-5 py-2 rounded-lg text-[12px] font-semibold",
                  "min-w-[90px] cursor-pointer border-none",
                  "transition-all duration-150 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-offset-2",
                  action.style === "ghost"
                    ? ghostBtnCls?.[m]
                    : primaryBtnCls?.[m],
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
