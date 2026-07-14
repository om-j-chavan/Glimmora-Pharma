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
   * link (used to jump from a Dashboard KPI to its Governance scorecard
   * section). Omit for a plain, non-interactive stat card (unchanged behaviour).
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
        aria-label={`${label}: ${value}. View in Governance scorecard`}
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
