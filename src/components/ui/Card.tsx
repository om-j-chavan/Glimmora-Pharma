import { type ReactNode } from "react";
import clsx from "clsx";

/**
 * Generic surface wrapper — the component form of the global `.card` class.
 * Reuses the same design tokens (--card-bg / --card-border / --shadow-card)
 * and `.card` / `.card-header` / `.card-body` geometry so swapping inline
 * `.card` markup for <Card> is visually identical. Dumb: layout only.
 */
type CardPadding = "none" | "sm" | "md";

export interface CardProps {
  children: ReactNode;
  /** Optional header row (matches `.card-header`: flex, space-between, divider). */
  header?: ReactNode;
  /** Optional footer row with a top divider. */
  footer?: ReactNode;
  className?: string;
  /** Body padding. 'md' (default) matches `.card-body`'s p-5. */
  padding?: CardPadding;
}

const BODY_PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
};

export function Card({ children, header, footer, className, padding = "md" }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl overflow-hidden bg-(--card-bg) border border-(--card-border) shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {header && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--card-border)">
          {header}
        </div>
      )}
      <div className={BODY_PADDING[padding]}>{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-(--card-border)">{footer}</div>
      )}
    </div>
  );
}
