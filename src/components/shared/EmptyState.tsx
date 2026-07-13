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
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <Icon className="w-10 h-10 mb-1" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</p>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{description}</p>
      {hint && <p className="text-[0.6875rem] mb-2" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {!readOnly && actionLabel && onAction && <Button icon={Plus} onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}
