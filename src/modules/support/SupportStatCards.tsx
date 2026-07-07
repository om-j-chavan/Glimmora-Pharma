"use client";

import { Inbox, Loader, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import type { TicketStats } from "@/lib/queries";

/**
 * Support header stat cards. Counts are role-scoped upstream in getTicketStats
 * (super_admin = all tenants, customer_admin = own tenant, requester = own
 * tickets), so the cards always agree with the queue the viewer can see. The
 * sub-labels shift slightly by view (e.g. "Escalated to platform" vs "Escalated
 * to me" for a super_admin).
 */
interface Props {
  stats: TicketStats;
  view: "requester" | "ca" | "sa";
}

export function SupportStatCards({ stats, view }: Props) {
  const escalatedSub =
    view === "sa" ? "Escalated to platform (yours to handle)" : "Escalated to platform support";

  const cards = [
    { label: "Open", value: stats.open, icon: Inbox, color: "var(--brand)", sub: "New & awaiting first action" },
    { label: "In Progress", value: stats.inProgress, icon: Loader, color: "var(--warning)", sub: "Being worked / awaiting reply" },
    { label: "Escalated", value: stats.escalated, icon: ArrowUpCircle, color: "var(--danger)", sub: escalatedSub },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "var(--success)", sub: "Resolved & closed" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <StatCard key={c.label} icon={c.icon} color={c.color} label={c.label} value={String(c.value)} sub={c.sub} />
      ))}
    </div>
  );
}
