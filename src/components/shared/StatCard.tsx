import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  sub: string;
}

export function StatCard({ icon: Icon, color, label, value, sub }: StatCardProps) {
  return (
    <div className="stat-card" role="region" aria-label={label}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
        <span className="stat-label mb-0">{label}</span>
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}
