"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Filter, Search, LifeBuoy } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { PageHeader, DataTable } from "@/components/shared";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Pagination } from "@/components/ui/Pagination";
import type { TicketListResult } from "@/lib/queries";
import { TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES, TERMINAL_STATUSES, type TicketStatus } from "@/lib/support/constants";
import { statusBadge, priorityBadge } from "./_shared";
import { RaiseTicketModal } from "./RaiseTicketModal";

interface Props {
  result: TicketListResult;
  admin: boolean;
  tenantOptions?: { id: string; name: string; customerCode: string }[];
  assigneeOptions?: { id: string; name: string }[];
}

export function TicketQueue({ result, admin, tenantOptions = [], assigneeOptions = [] }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const { org } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const basePath = admin ? "/admin/support" : "/support";
  const [addOpen, setAddOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(sp.get("search") ?? "");

  const get = (k: string) => sp.get(k) ?? "";

  function setParams(updates: Record<string, string | undefined>) {
    const p = new URLSearchParams(sp.toString());
    if (!("page" in updates)) p.delete("page");
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${basePath}?${p.toString()}`);
  }

  const anyFilter = ["status", "priority", "category", "assigneeId", "tenantId", "dateFrom", "dateTo", "search"].some((k) => sp.get(k));
  const tenantName = (id: string) => tenantOptions.find((t) => t.id === id)?.customerCode ?? id.slice(0, 8);

  function slaCell(slaDueAt: Date | null, status: string) {
    if (!slaDueAt || TERMINAL_STATUSES.has(status as TicketStatus) || status === "Resolved") {
      return <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>—</span>;
    }
    const overdue = dayjs(slaDueAt).isBefore(dayjs());
    return (
      <span className="text-[12px]" style={{ color: overdue ? "var(--danger)" : "var(--text-secondary)" }}>
        {dayjs.utc(slaDueAt).tz(timezone).format(dateFormat)}
        {overdue && <span className="block text-[10px]" style={{ color: "var(--danger)" }}>Breached</span>}
      </span>
    );
  }

  return (
    <main id="main-content" aria-label={admin ? "Support management" : "Support"} className="w-full space-y-5">
      <PageHeader
        icon={LifeBuoy}
        title={admin ? "Support Management" : "Support"}
        subtitle={result.total === 0 ? "No tickets yet" : `${result.total} ticket${result.total === 1 ? "" : "s"}`}
        actions={!admin ? <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Raise Ticket</Button> : undefined}
      />

      {/* Search — before Filters (matches the Evidence library toolbar order). */}
      <form className="relative" onSubmit={(e) => { e.preventDefault(); setParams({ search: searchInput.trim() || undefined }); }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <input type="search" className="input w-full pl-10 text-[13px]" placeholder="Search subject / ticket ID / requester / record reference…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search tickets" />
      </form>

      {/* Filters */}
      <section aria-label="Ticket filters" className="flex items-center gap-3 flex-wrap p-3 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
        <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        <Dropdown placeholder="All statuses" value={get("status")} onChange={(v) => setParams({ status: v })} width="w-40" options={[{ value: "", label: "All statuses" }, ...TICKET_STATUSES.map((s) => ({ value: s, label: s }))]} />
        <Dropdown placeholder="All priorities" value={get("priority")} onChange={(v) => setParams({ priority: v })} width="w-36" options={[{ value: "", label: "All priorities" }, ...TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))]} />
        <Dropdown placeholder="All categories" value={get("category")} onChange={(v) => setParams({ category: v })} width="w-44" options={[{ value: "", label: "All categories" }, ...TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
        {admin && (
          <Dropdown placeholder="All assignees" value={get("assigneeId")} onChange={(v) => setParams({ assigneeId: v })} width="w-44" options={[{ value: "", label: "All assignees" }, ...assigneeOptions.map((a) => ({ value: a.id, label: a.name }))]} />
        )}
        {admin && (
          <Dropdown placeholder="All tenants" value={get("tenantId")} onChange={(v) => setParams({ tenantId: v })} width="w-44" options={[{ value: "", label: "All tenants" }, ...tenantOptions.map((t) => ({ value: t.id, label: t.name }))]} />
        )}
        <DatePicker id="t-from" value={get("dateFrom")} onChange={(v) => setParams({ dateFrom: v })} max={get("dateTo") || undefined} placeholder="From date" className="w-36" />
        <DatePicker id="t-to" value={get("dateTo")} onChange={(v) => setParams({ dateTo: v })} min={get("dateFrom") || undefined} placeholder="To date" className="w-36" />
        {anyFilter && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setSearchInput(""); router.push(basePath); }}>Clear</Button>
        )}
      </section>

      {result.rows.length === 0 ? (
        <div className="card p-10 text-center" style={{ minHeight: 360 }}>
          <LifeBuoy className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>{anyFilter ? "No tickets match the current filters" : "No tickets yet"}</p>
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>{admin ? "Tickets raised across all tenants will appear here." : "Raise a ticket and the Glimmora support team will pick it up."}</p>
          {!admin && !anyFilter && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Raise Ticket</Button>}
          {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); router.push(basePath); }}>Clear filters</Button>}
        </div>
      ) : (
        <>
          {/* Fixed-height, scrollable table area so the layout stays stable at 1
              row or many (matches the Deviation/CAPA data-table treatment). */}
          <div className="card overflow-hidden">
            <DataTable
              ariaLabel={admin ? "All-tenants ticket queue" : "My tickets"}
              caption={admin ? "Tickets across all tenants" : "Tickets you have raised"}
              data={result.rows}
              rowKey={(t) => t.id}
              onRowClick={(t) => router.push(`${basePath}/${t.id}`)}
              container="fixed"
              minHeight={360}
              maxHeight={560}
              minWidth={admin ? 1100 : 820}
              columns={[
                { key: "ticket", header: "Ticket", cellClassName: "font-mono text-[12px] font-semibold text-(--brand)", render: (t) => t.reference ?? t.id.slice(0, 8) },
                { key: "subject", header: "Subject", cellClassName: "text-[12px] max-w-[280px] truncate text-(--text-primary)", render: (t) => <span title={t.subject}>{t.subject}</span> },
                { key: "category", header: "Category", cellClassName: "text-[12px] text-(--text-secondary)", render: (t) => t.category },
                { key: "priority", header: "Priority", render: (t) => priorityBadge(t.priority) },
                { key: "status", header: "Status", render: (t) => statusBadge(t.status) },
                { key: "requester", header: "Requester", hidden: !admin, cellClassName: "text-[12px] text-(--text-secondary)", render: (t) => t.requesterName },
                { key: "assignee", header: "Assignee", hidden: !admin, cellClassName: "text-[12px]", render: (t) => <span style={{ color: t.assigneeName ? "var(--text-secondary)" : "var(--text-muted)" }}>{t.assigneeName ?? "Unassigned"}</span> },
                { key: "tenant", header: "Tenant", hidden: !admin, cellClassName: "font-mono text-[11px] text-(--text-muted)", render: (t) => tenantName(t.tenantId) },
                { key: "sla", header: "SLA due", render: (t) => slaCell(t.slaDueAt, t.status) },
                { key: "updated", header: "Updated", cellClassName: "text-[12px] text-(--text-secondary)", render: (t) => dayjs.utc(t.updatedAt).tz(timezone).format(dateFormat) },
              ]}
            />
          </div>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onChange={(p) => setParams({ page: String(p) })} itemLabel="ticket" className="mt-4" />
        </>
      )}

      {!admin && <RaiseTicketModal open={addOpen} onClose={() => setAddOpen(false)} />}
    </main>
  );
}
