import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Optional leading icon (brand-tinted), matching the hand-rolled headers in
   *  Change Control / Deviation. Omitted = the original title-only header. */
  icon?: LucideIcon;
}

export function PageHeader({ title, subtitle, actions, icon: Icon }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </header>
  );
}
