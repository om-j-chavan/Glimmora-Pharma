import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeVariant = "red" | "amber" | "green" | "blue" | "gray" | "purple";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={clsx("badge", `badge-${variant}`)}>
      {children}
    </span>
  );
}
