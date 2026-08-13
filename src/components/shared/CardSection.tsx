import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";


interface CardSectionProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  /**
   * Extra classes for the BODY element, appended after `card-body`. Opt-in and
   * additive — every existing caller renders exactly as before.
   *
   * The case it exists for: a card whose content should FILL the available
   * height (a chart) rather than sit at a fixed height with dead space beneath.
   * Such a card passes a flex-column body and marks its own filling child
   * `flex-1 min-h-0`. Card-body carries a height CAP (max-h-[26rem], applied by
   * the dashboard grid) but no fixed height, so a percentage height on a child
   * cannot resolve — flex is the mechanism that works.
   */
  bodyClassName?: string;
}

export function CardSection({ icon: Icon, iconColor = "#0ea5e9", title, badge, children, bodyClassName }: CardSectionProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: iconColor }} aria-hidden="true" />
          <span className="card-title">{title}</span>
        </div>
        {badge}
      </div>
      <div className={bodyClassName ? `card-body ${bodyClassName}` : "card-body"}>{children}</div>
    </div>
  );
}
