import { type ButtonHTMLAttributes } from "react";
import { type LucideIcon } from "lucide-react";
import clsx from "clsx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-ghost";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export type IconPosition = "left" | "right";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: IconPosition;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-(--brand) text-white hover:bg-(--brand-hover) focus-visible:ring-(--brand) disabled:opacity-40",
  secondary:
    "bg-(--bg-elevated) text-(--text-primary) border border-(--bg-border) hover:bg-(--bg-hover) focus-visible:ring-(--brand) disabled:opacity-50",
  ghost:
    "bg-transparent text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary) focus-visible:ring-(--brand) disabled:text-(--text-muted)",
  danger:
    "bg-(--danger) text-white hover:brightness-110 focus-visible:ring-(--danger) disabled:opacity-40",
  "danger-ghost":
    "bg-transparent text-(--danger) border border-(--danger-bg) hover:bg-(--danger-bg) focus-visible:ring-(--danger) disabled:opacity-40",
};

// Font sizes in rem so they honor the user's browser font-size / zoom setting
// (px would stay fixed). Heights stay in Tailwind's spacing scale.
const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[0.6875rem] gap-1.5 rounded-md",
  sm: "h-8 px-3 text-xs gap-2 rounded-lg",
  md: "h-9 px-4 text-[0.8125rem] gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2.5 rounded-xl",
};

const ICON_SIZES: Record<ButtonSize, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-[18px] h-[18px]",
};

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  xs: "w-7 p-0",
  sm: "w-8 p-0",
  md: "w-9 p-0",
  lg: "w-11 p-0",
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const isIconOnly = !children;

  return (
    <button
      {...props}
      disabled={isDisabled}
      suppressHydrationWarning
      className={clsx(
        "inline-flex items-center justify-center",
        "font-semibold whitespace-nowrap",
        "border-none outline-none",
        "transition-all duration-150",
        "cursor-pointer",
        "disabled:cursor-not-allowed",
        "focus-visible:ring-2 focus-visible:ring-offset-2",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        isIconOnly && ICON_ONLY_SIZES[size],
        className,
      )}
    >
      {loading && (
        <svg
          className={clsx(ICON_SIZES[size], "animate-spin shrink-0")}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {Icon && iconPosition === "left" && !loading && (
        <Icon className={clsx(ICON_SIZES[size], "shrink-0")} aria-hidden="true" strokeWidth={2} />
      )}
      {children && <span>{children}</span>}
      {Icon && iconPosition === "right" && (
        <Icon className={clsx(ICON_SIZES[size], "shrink-0")} aria-hidden="true" strokeWidth={2} />
      )}
    </button>
  );
}
