"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Badge } from "@/components/ui/Badge";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn } from "@/components/table/DataTable";
import { loadSupportTickets } from "@/actions/support";
import type { TicketQueueRow, TicketStats } from "@/lib/queries/support";
import { TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES, TERMINAL_STATUSES, type TicketStatus } from "@/lib/support/constants";
import { statusBadge, priorityBadge } from "./_shared";
import { RaiseTicketModal } from "./RaiseTicketModal";
import { SupportStatCards } from "./SupportStatCards";

export type SupportView = "requester" | "ca" | "sa";

interface Props {
  view: SupportView;
  initialData: { rows: TicketQueueRow[]; total: number };
  stats: TicketStats;
  tenantOptions?: { id: string; name: string; customerCode: string }[];
}

const PAGE_SIZE = 15;

export function SupportQueue({ view, initialData, stats, tenantOptions = [] }: Props) {
  const router = useRouter();
  const { org, tenantName } = useTenantConfig();
  const tz = org.timezone;
  const df = org.dateFormat;
  const isSA = view === "sa";
  const isHandler = view === "ca" || view === "sa";
  const basePath = isSA ? "/admin/support" : "/support";
  const [addOpen, setAddOpen] = useState(false);

  const tenantCode = (id: string) => tenantOptions.find((t) => t.id === id)?.customerCode ?? id.slice(0, 8);

  // Routing/tier badge — the handler view reads the CA↔SA tier; the requester
  // sees only a neutral "With Support" while the ticket is open.
  function tierCell(t: TicketQueueRow) {
    if (view === "requester") {
      return TERMINAL_STATUSES.has(t.status as TicketStatus)
        ? <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>
        : <Badge variant="blue">With Support</Badge>;
    }
    if (view === "ca") {
      return t.currentHandler === "customer_admin" ? <Badge variant="green">With me</Badge> : <Badge variant="amber">Escalated</Badge>;
    }
    // SA
    return t.currentHandler === "super_admin" ? <Badge variant="amber">Escalated</Badge> : <Badge variant="gray">With CA</Badge>;
  }

  function slaCell(t: TicketQueueRow) {
    if (!t.slaDueAt || TERMINAL_STATUSES.has(t.status as TicketStatus) || t.status === "Resolved") {
      return <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>;
    }
    const overdue = dayjs(t.slaDueAt).isBefore(dayjs());
    return (
      <span className="text-[12px]" style={{ color: overdue ? "var(--danger)" : "var(--text-secondary)" }}>
        {dayjs.utc(t.slaDueAt).tz(tz).format(df)}
        {overdue && <span className="block text-[10px]" style={{ color: "var(--danger)" }}>Breached</span>}
      </span>
    );
  }

  // Plain-text mirrors of the badge/JSX cells for CSV/PDF/Excel export.
  function tierText(t: TicketQueueRow): string {
    if (view === "requester") return TERMINAL_STATUSES.has(t.status as TicketStatus) ? "—" : "With Support";
    if (view === "ca") return t.currentHandler === "customer_admin" ? "With me" : "Escalated";
    return t.currentHandler === "super_admin" ? "Escalated" : "With CA";
  }
  function slaText(t: TicketQueueRow): string {
    if (!t.slaDueAt || TERMINAL_STATUSES.has(t.status as TicketStatus) || t.status === "Resolved") return "—";
    const overdue = dayjs(t.slaDueAt).isBefore(dayjs());
    return dayjs.utc(t.slaDueAt).tz(tz).format(df) + (overdue ? " (Breached)" : "");
  }

  const columns: DataColumn<TicketQueueRow>[] = [
    { key: "ticket", label: "Ticket", width: "w-[12%]", exportValue: (t) => t.reference ?? t.id.slice(0, 8), render: (t) => <span className="font-mono text-[12px] font-semibold text-(--brand)">{t.reference ?? t.id.slice(0, 8)}</span> },
    { key: "subject", label: "Subject", exportValue: (t) => t.subject, render: (t) => <span className="text-[12px] text-(--text-primary) line-clamp-1" title={t.subject}>{t.subject}</span> },
    { key: "category", label: "Category", width: "w-[12%]", exportValue: (t) => t.category, render: (t) => <span className="text-[12px] text-(--text-secondary)">{t.category}</span> },
    { key: "priority", label: "Priority", width: "w-[9%]", exportValue: (t) => t.priority, render: (t) => priorityBadge(t.priority) },
    { key: "status", label: "Status", width: "w-[10%]", exportValue: (t) => t.status, render: (t) => statusBadge(t.status) },
    { key: "handler", label: view === "requester" ? "Support" : "Handler", width: "w-[10%]", exportValue: (t) => tierText(t), render: (t) => tierCell(t) },
    ...(isHandler ? [{ key: "requester", label: "Requester", width: "w-[12%]", exportValue: (t: TicketQueueRow) => t.requesterName, render: (t: TicketQueueRow) => <span className="text-[12px] text-(--text-secondary)">{t.requesterName}</span> }] : []),
    ...(isSA ? [{ key: "tenant", label: "Tenant", width: "w-[8%]", exportValue: (t: TicketQueueRow) => tenantCode(t.tenantId), render: (t: TicketQueueRow) => <span className="font-mono text-[11px] text-(--text-muted)">{tenantCode(t.tenantId)}</span> }] : []),
    { key: "sla", label: "SLA due", width: "w-[10%]", exportValue: (t) => slaText(t), render: (t) => slaCell(t) },
    { key: "updated", label: "Updated", width: "w-[10%]", exportValue: (t) => dayjs.utc(t.updatedAt).tz(tz).format(df), render: (t) => <span className="text-[12px] text-(--text-secondary)">{dayjs.utc(t.updatedAt).tz(tz).format(df)}</span> },
  ];

  // Toolbar filters. `routedToMe` is the Phase-B tier queue (CA "Routed to me" /
  // SA "Escalated to me"); the DataTable sends its value to the server fetcher.
  const filters = [
    { key: "status", label: "statuses", options: TICKET_STATUSES.map((s) => ({ value: s, label: s })) },
    { key: "priority", label: "priorities", options: TICKET_PRIORITIES.map((p) => ({ value: p, label: p })) },
    { key: "category", label: "categories", options: TICKET_CATEGORIES.map((c) => ({ value: c, label: c })) },
    ...(view === "ca" ? [{ key: "routedToMe", label: "tickets", options: [{ value: "1", label: "Routed to me" }] }] : []),
    ...(isSA ? [{ key: "routedToMe", label: "queues", options: [{ value: "1", label: "Escalated to me" }] }] : []),
    ...(isSA ? [{ key: "tenantId", label: "tenants", options: tenantOptions.map((t) => ({ value: t.id, label: t.name })) }] : []),
  ];

  const title = view === "sa" ? "Support (all tenants)" : view === "ca" ? `Support — ${tenantName}` : "Support";
  const description =
    view === "sa"
      ? "Every tenant's tickets. Filter the escalated queue — the Customer-Admin → platform handoff."
      : view === "ca"
        ? "Your organisation's support tickets. First-line ones show “With me”; escalated ones are with platform support."
        : "Raise a ticket and the Glimmora support team will help. Track its status here.";

  const actions: PageAction[] = isSA ? [] : [{ label: "Raise Ticket", variant: "primary", icon: Plus, onClick: () => setAddOpen(true) }];

  return (
    <PageLayout title={title} description={description} actions={actions}>
      <SupportStatCards stats={stats} view={view} />
      <DataTable<TicketQueueRow>
        mode="server"
        fetcher={loadSupportTickets}
        initialData={initialData}
        rowKey={(t) => t.id}
        ariaLabel={isSA ? "All-tenants ticket queue" : "Ticket queue"}
        columns={columns}
        pageSize={PAGE_SIZE}
        search={{ placeholder: "Search subject / ticket ID / requester / record…" }}
        filters={filters}
        exportOptions={{ filename: `support-tickets-${dayjs().format("YYYY-MM-DD")}`, title: isSA ? "Support tickets (all tenants)" : "Support tickets" }}
        onRowClick={(t) => router.push(`${basePath}/${t.id}`)}
        emptyState={isHandler ? "No tickets in this queue." : "You haven't raised any tickets yet."}
      />

      {!isSA && <RaiseTicketModal open={addOpen} onClose={() => setAddOpen(false)} />}
    </PageLayout>
  );
}
