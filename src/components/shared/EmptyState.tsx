import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  readOnly?: boolean;
}

export function EmptyState({ icon: Icon, title, description, hint, actionLabel, onAction, readOnly }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <Icon className="w-12 h-12 mb-1" style={{ color: "#334155" }} aria-hidden="true" />
      <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{description}</p>
      {hint && <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {!readOnly && actionLabel && onAction && <Button icon={Plus} onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
