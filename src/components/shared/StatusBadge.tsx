import { type StatusDef, getStatusDef } from "@/constants/statusTaxonomy";

export interface StatusBadgeProps {
  taxonomy: Record<string, StatusDef>;
  status: string;
}

export function StatusBadge({ taxonomy, status }: StatusBadgeProps) {
  const def = getStatusDef(taxonomy, status);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: def.bg, color: def.color }}
      title={def.description}
    >
      {def.label}
    </span>
  );
}
