"use client";

import clsx from "clsx";
import { CalendarClock, Gauge, Ban, PauseCircle } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { type AccountCardFilter } from "../helpers";

/**
 * Actionable stat cards for the accounts list. Each card is a count over the
 * full tenant list and is CLICKABLE → filters the table to that set; clicking
 * the active card again clears the filter. 0-count cards still render (greyed),
 * never hidden.
 */
interface AccountStatCardsProps {
  stats: { expiring: number; nearcap: number; noplan: number; suspended: number };
  activeFilter: AccountCardFilter | null;
  onSelect: (filter: AccountCardFilter) => void;
}

const CARDS: Array<{ key: AccountCardFilter; label: string; icon: typeof Ban; color: string; sub: string }> = [
  { key: "expiring", label: "Expiring soon", icon: CalendarClock, color: "var(--warning)", sub: "Plan expiry within 30 days" },
  { key: "nearcap", label: "Near cap", icon: Gauge, color: "var(--warning)", sub: "≥ 80% of user or site cap" },
  { key: "noplan", label: "No plan", icon: Ban, color: "var(--text-muted)", sub: "No plan assigned" },
  { key: "suspended", label: "Suspended", icon: PauseCircle, color: "var(--danger)", sub: "Lifecycle suspended" },
];

export function AccountStatCards({ stats, activeFilter, onSelect }: AccountStatCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {CARDS.map((c) => {
        const count = stats[c.key];
        const active = activeFilter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            aria-pressed={active}
            className={clsx(
              "w-full h-full text-left rounded-xl transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)",
              active && "ring-2 ring-(--brand)",
              count === 0 && "opacity-60",
            )}
          >
            <StatCard icon={c.icon} color={c.color} label={c.label} value={String(count)} sub={c.sub} />
          </button>
        );
      })}
    </div>
  );
}
