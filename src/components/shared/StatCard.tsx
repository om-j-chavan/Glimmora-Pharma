import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface StatCardProps {
  icon: LucideIcon;
  color: string;
  label: string;
  value: string;
  sub: string;
  /**
   * Optional deep link — when set the whole card becomes a keyboard-focusable
   * link (a Dashboard KPI jumping to its owning module or Governance scorecard
   * section). Omit for a plain, non-interactive stat card (unchanged behaviour).
   *
   * The role-based dashboard STRIPS this prop when the viewer may not open the
   * target module, so an absent href is a deliberate authorisation outcome as
   * well as a styling choice.
   */
  href?: string;
}

export function StatCard({ icon: Icon, color, label, value, sub, href }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5" style={{ color }} aria-hidden="true" />
        <span className="stat-label mb-0">{label}</span>
      </div>
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        // Announce the metric and its context rather than naming one specific
        // destination — KPI cards now link to whichever module owns the metric.
        aria-label={`${label}: ${value}. ${sub}`}
        className="stat-card block no-underline transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--brand)"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="stat-card" role="region" aria-label={label}>
      {body}
    </div>
  );
}
