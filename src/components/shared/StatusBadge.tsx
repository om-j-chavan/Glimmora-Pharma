import {
  Circle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Hourglass,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";
import { type StatusDef, getStatusDef } from "@/constants/statusTaxonomy";

export interface StatusBadgeProps {
  taxonomy: Record<string, StatusDef>;
  status: string;
}

/** Fixed icon per status semantic — a non-color cue so statuses are
 *  distinguishable without relying on hue (color-blind safety, grayscale
 *  print, Windows High Contrast). A taxonomy entry can override via
 *  StatusDef.icon; otherwise we derive one from the label keywords. */
const STATUS_ICONS = {
  done: CheckCircle2,
  rejected: XCircle,
  alert: AlertTriangle,
  pending: Hourglass,
  progress: Clock,
  none: MinusCircle,
  neutral: Circle,
} satisfies Record<string, LucideIcon>;

function statusIconKey(def: StatusDef): keyof typeof STATUS_ICONS {
  const s = `${def.value} ${def.label}`.toLowerCase();
  if (/closed|complete|approved|acknowledged|submitted/.test(s)) return "done";
  if (/rejected|warning letter/.test(s)) return "rejected";
  if (/overdue|response due|blocked/.test(s)) return "alert";
  if (/pending|verification/.test(s)) return "pending";
  if (/progress|investigation|review|draft|linked/.test(s)) return "progress";
  if (/not started|skipped/.test(s)) return "none";
  return "neutral";
}

export function StatusBadge({ taxonomy, status }: StatusBadgeProps) {
  const def = getStatusDef(taxonomy, status);
  // Property-access lookup (not a call) so it reads as a static component ref.
  const Icon = def.icon ?? STATUS_ICONS[statusIconKey(def)];
  return (
    <span
      className="status-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold whitespace-nowrap"
      // Background is derived from this text color via color-mix in index.css
      // (.status-badge), so the pill adapts to light/dark surfaces.
      style={{ color: def.color }}
      title={def.description}
      data-status={def.label}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" strokeWidth={2.5} />
      {def.label}
    </span>
  );
}
