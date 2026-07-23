"use client";

/**
 * AIButton — the ONE entry point control for every AI feature.
 *
 * Every AI trigger in the product must render through this component. It owns
 * the whole AI visual language so no module re-invents it:
 *   • the Sparkles icon (baked in — callers cannot pass a different icon, which
 *     is what let Play / Bot / ShieldAlert / ArrowRight / FileUp all end up
 *     labelling AI actions)
 *   • the indigo --ai-* accent (identical across all 14 brand themes)
 *   • hover elevation + glow on a 200ms transition
 *   • the loading contract: spinner + "Analyzing…" + disabled, so a second
 *     click can never fire a duplicate (and duplicately-billed) AI call
 *
 * Styling lives in index.css (.btn-ai / .btn-ai-subtle / .btn-ai-quiet /
 * .btn-ai-xs / .btn-ai-sm / .btn-ai-icon) — never inline. That keeps a single
 * source of truth for the accent and means a token change repaints every AI
 * surface at once.
 *
 * Variants:
 *   solid  — primary AI action ("AI Suggestion", "AI Draft"). Default.
 *   subtle — secondary AI action inside a panel ("Generate AI brief").
 *   quiet  — inline text affordance ("Regenerate", "Retry").
 */

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import clsx from "clsx";

export type AIButtonVariant = "solid" | "subtle" | "quiet";
export type AIButtonSize = "xs" | "sm" | "md";

export interface AIButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: AIButtonVariant;
  size?: AIButtonSize;
  /** Disables the button and swaps the icon for a spinner. */
  loading?: boolean;
  /** Copy shown while `loading`. The AI spec's default is "Analyzing…". */
  loadingLabel?: string;
  /**
   * Escape hatch for the few AI controls whose meaning is carried by another
   * glyph (e.g. Regenerate's RotateCcw). Use sparingly: Sparkles is what makes
   * an AI control recognisable as AI. Ignored while `loading`.
   */
  icon?: LucideIcon;
  /** Icon-only control. Pass an aria-label — there is no visible text. */
  iconOnly?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<AIButtonVariant, string | null> = {
  solid: null, // .btn-ai base only
  subtle: "btn-ai-subtle",
  quiet: "btn-ai-quiet",
};

const SIZE_CLASS: Record<AIButtonSize, string | null> = {
  xs: "btn-ai-xs",
  sm: "btn-ai-sm",
  md: null, // .btn-ai base is md
};

/** Matches the Button component's spinner so AI and non-AI loading agree. */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("animate-spin shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const SPINNER_SIZE: Record<AIButtonSize, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
};

export function AIButton({
  variant = "solid",
  size = "md",
  loading = false,
  loadingLabel = "Analyzing…",
  icon,
  iconOnly = false,
  disabled,
  className,
  children,
  ...props
}: AIButtonProps) {
  // Loading always disables: every AI call is a billed network round-trip, so a
  // double-click must never dispatch two.
  const isDisabled = disabled || loading;
  const Icon = icon ?? Sparkles;

  return (
    <button
      type="button"
      {...props}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        "btn-ai",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        iconOnly && "btn-ai-icon",
        className,
      )}
    >
      {loading ? (
        <Spinner className={SPINNER_SIZE[size]} />
      ) : (
        <Icon aria-hidden="true" />
      )}
      {!iconOnly && <span>{loading ? loadingLabel : children}</span>}
    </button>
  );
}
