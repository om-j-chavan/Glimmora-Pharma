"use client";

import { MapPin, Users, CreditCard, CheckCircle2 } from "lucide-react";
import { planLabel } from "@/lib/plans";
import dayjs from "@/lib/dayjs";
import { type PlanConfig } from "@/store/auth.slice";

/**
 * Container-level summary for the super_admin detail view: utilisation against
 * the plan cap (Users X / cap, Sites X / cap), the plan tier, and validity
 * (with days remaining). Aggregate counts only — no individual user/site
 * details (the bright line). Caps shown here are USAGE-vs-cap; the Plan Details
 * card shows the cap SPEC — complementary, not duplicate.
 */
interface DetailSummaryCardsProps {
  userCount: number;
  siteCount: number;
  plan: PlanConfig | null;
  planExpired: boolean;
}

export function DetailSummaryCards({ userCount, siteCount, plan, planExpired }: DetailSummaryCardsProps) {
  const daysRemaining = plan ? Math.max(0, dayjs.utc(plan.expiryDate).diff(dayjs(), "day")) : null;

  const cards: Array<{ label: string; value: string; icon: typeof Users; color: string; valueClassName?: string }> = [
    { label: "Users", value: `${userCount} / ${plan ? plan.maxUsers : "—"}`, icon: Users, color: "var(--success)" },
    { label: "Sites", value: `${siteCount} / ${plan ? plan.maxSites : "—"}`, icon: MapPin, color: "var(--brand)" },
    { label: "Plan", value: plan ? planLabel(plan.tier, plan.displayName) : "None", icon: CreditCard, color: "var(--warning)" },
    {
      label: "Plan validity",
      value: !plan ? "No plan" : planExpired ? "Expired" : `Valid · ${daysRemaining} days`,
      icon: CheckCircle2,
      color: !plan ? "var(--text-muted)" : planExpired ? "var(--danger)" : "var(--success)",
      valueClassName: "text-[14px]",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map((stat) => (
        <div key={stat.label} className="stat-card flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: stat.color + "15" }}
          >
            <stat.icon className="w-5 h-5" style={{ color: stat.color }} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="stat-label">{stat.label}</p>
            <p className={`font-bold truncate ${stat.valueClassName ?? "text-[20px]"}`} style={{ color: "var(--card-text)" }}>{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
