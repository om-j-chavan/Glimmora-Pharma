import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface CardSectionProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}

export function CardSection({ icon: Icon, iconColor = "#0ea5e9", title, badge, children }: CardSectionProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: iconColor }} aria-hidden="true" />
          <span className="card-title">{title}</span>
        </div>
        {badge}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}
