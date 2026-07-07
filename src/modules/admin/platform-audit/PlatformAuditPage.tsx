"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import type { PlatformAuditResult, PlatformAuditRow } from "@/lib/queries";
import { PlatformAuditTable } from "./_components/PlatformAuditTable";
import { AuditDetailModal } from "./_components/AuditDetailModal";

interface PlatformAuditPageProps {
  result: PlatformAuditResult;
  /** Distinct audit action strings present, for the Action filter. */
  actionOptions: string[];
  /** Tenants for the Account Name filter (id → name). */
  tenantOptions: { id: string; name: string }[];
}

const BASE_PATH = "/admin/audit";
const FILTER_KEYS = ["action", "username", "accountId", "dateFrom", "dateTo", "search"] as const;

export function PlatformAuditPage({ result, actionOptions, tenantOptions }: PlatformAuditPageProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";

  // Free-text + actor inputs commit on submit/blur; everything else on change.
  const [searchInput, setSearchInput] = useState(sp.get("search") ?? "");
  const [actorInput, setActorInput] = useState(sp.get("username") ?? "");
  const [selected, setSelected] = useState<PlatformAuditRow | null>(null);

  // URL is the source of truth (server-side filter + pagination). Changing any
  // filter resets to page 1; page changes keep the filters.
  function setParams(updates: Record<string, string | undefined>) {
    const p = new URLSearchParams(sp.toString());
    if (!("page" in updates)) p.delete("page");
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    router.push(`${BASE_PATH}?${p.toString()}`);
  }

  const anyFilter = FILTER_KEYS.some((k) => sp.get(k));
  const clearAll = () => { setSearchInput(""); setActorInput(""); router.push(BASE_PATH); };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>Platform Audit</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Platform-level events — account, plan, and security changes
        </p>
      </div>

      {/* Search — free-text across target / action / actor. */}
      <form
        className="relative max-w-lg mb-4"
        onSubmit={(e) => { e.preventDefault(); setParams({ search: searchInput.trim() || undefined }); }}
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <input
          type="search"
          className="input w-full pl-9 text-[13px]"
          placeholder="Search target, action, or actor…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search audit events"
        />
      </form>

      {/* Filters — action, actor, account, date range. All server-side; AND-combined. */}
      <section
        aria-label="Audit filters"
        className="flex items-center gap-3 flex-wrap p-3 rounded-xl mb-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <Filter className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>

        <Dropdown
          placeholder="All actions"
          value={get("action")}
          onChange={(v) => setParams({ action: v || undefined })}
          width="w-56"
          searchable
          options={[{ value: "", label: "All actions" }, ...actionOptions.map((a) => ({ value: a, label: auditEventLabel(a) }))]}
        />

        <input
          type="text"
          className="input w-44 text-[13px]"
          placeholder="Username / actor"
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
          onBlur={() => { if ((actorInput.trim() || undefined) !== (sp.get("username") ?? undefined)) setParams({ username: actorInput.trim() || undefined }); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setParams({ username: actorInput.trim() || undefined }); } }}
          aria-label="Filter by username or actor"
        />

        <Dropdown
          placeholder="All accounts"
          value={get("accountId")}
          onChange={(v) => setParams({ accountId: v || undefined })}
          width="w-52"
          searchable
          options={[{ value: "", label: "All accounts" }, ...tenantOptions.map((t) => ({ value: t.id, label: t.name }))]}
        />

        <DatePicker id="audit-from" value={get("dateFrom")} onChange={(v) => setParams({ dateFrom: v || undefined })} max={get("dateTo") || undefined} placeholder="From date" className="w-36" />
        <DatePicker id="audit-to" value={get("dateTo")} onChange={(v) => setParams({ dateTo: v || undefined })} min={get("dateFrom") || undefined} placeholder="To date" className="w-36" />

        {anyFilter && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={clearAll}>Clear</Button>
        )}
      </section>

      {result.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title={anyFilter ? "No events match the current filters" : "No platform events yet"}
            description={anyFilter
              ? "Try a different search term or clear the active filters."
              : "Account, plan, and MFA changes you make from the console will appear here."}
          />
        </Card>
      ) : (
        <>
          <Card
            padding="none"
            header={
              <>
                <span className="card-title">Events</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {result.total} total
                </span>
              </>
            }
          >
            <PlatformAuditTable rows={result.rows} onView={setSelected} />
          </Card>

          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onChange={(p) => setParams({ page: String(p) })}
            itemLabel="event"
            className="mt-4"
          />
        </>
      )}

      {/* Read-only single-record detail (immutable — no edit/delete). */}
      <AuditDetailModal row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
