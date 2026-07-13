import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

/**
 * <DisplayId> — the standard presentation atom for readable identifier codes
 * (region REG-…, framework FMK-…, and any reference string). Applies the shared
 * `.display-id` face (a curated, legible monospace with tabular figures) so IDs
 * render consistently module-wide. Display-only: it renders whatever string it
 * is given and stores/parses nothing.
 */
export function DisplayId({
  children,
  className,
  style,
  title,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <span className={clsx("display-id", className)} style={style} title={title}>
      {children}
    </span>
  );
}
