import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Badge } from "@/components/ui/Badge";

interface PlanLimitUsageBarProps {
  icon: LucideIcon;
  label: string;
  count: number;
  limit: number;
  plan: string;
  atLimit: boolean;
  nearLimit: boolean;
}

export function PlanLimitUsageBar({ icon: Icon, label, count, limit, plan, atLimit, nearLimit }: PlanLimitUsageBarProps) {
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const color = atLimit ? "#ef4444" : nearLimit ? "#f59e0b" : "#0ea5e9";
  const pct = limit === -1 ? 100 : Math.min(Math.round((count / limit) * 100), 100);
  const remaining = limit === -1 ? -1 : limit - count;

  return (
    <div className={clsx("flex items-center gap-4 p-4 rounded-xl border", atLimit ? isDark ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border-[#fca5a5]" : nearLimit ? isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]" : "bg-[#fffbeb] border-[#fde68a]" : isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color }} aria-hidden="true" />
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{label}</span>
            <Badge variant={atLimit ? "red" : nearLimit ? "amber" : "blue"}>{plan}</Badge>
          </div>
          <span className="text-[13px] font-semibold" style={{ color }}>{count}{limit !== -1 ? ` / ${limit}` : " / \u221E"}</span>
        </div>
        <div className={clsx("h-1.5 rounded-full", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
          {limit !== -1 ? (
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
          ) : (
            <div className="h-full rounded-full w-full" style={{ background: "linear-gradient(90deg, #0ea5e940, #0ea5e9)" }} />
          )}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: atLimit ? "#ef4444" : nearLimit ? "#f59e0b" : "var(--text-muted)" }}>
          {atLimit ? `${label} limit reached \u2014 contact Pharma Glimmora to increase your limit` : limit === -1 ? `Unlimited ${label.toLowerCase()} on your plan` : `${remaining} slot${remaining !== 1 ? "s" : ""} remaining`}
        </p>
      </div>
    </div>
  );
}
