"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { DataTable, type Column } from "@/components/shared";
import { EmptyState } from "@/components/shared/EmptyState";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { loadFrameworkAuditLogs } from "@/actions/frameworks";
import type { FrameworkAuditResult, FrameworkAuditRow, FrameworkAuditScope, PlatformAuditRow } from "@/lib/queries";
import { AuditDetailModal } from "@/modules/admin/platform-audit/_components/AuditDetailModal";
import dayjs from "@/lib/dayjs";

const EMPTY: FrameworkAuditResult = { rows: [], total: 0, page: 1, pageSize: 25 };

const SCOPE_OPTIONS: { value: FrameworkAuditScope; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "platform", label: "Platform catalog" },
  { value: "tenant", label: "Tenant enablement" },
];

/** Actor label — join username → captured display name → "System". */
function actorOf(e: FrameworkAuditRow): string {
  return e.username ?? (e.userName?.trim() || null) ?? "System";
}

/**
 * Framework Activity — a read-only view of the immutable audit log scoped to the
 * five framework action codes (platform catalog + per-tenant enablement). Rows
 * are newest-first; a light action-type filter narrows to platform-only or
 * tenant-only events. Clicking a row opens the SHARED AuditDetailModal (reused,
 * not forked). Nothing here mutates or creates audit data — display only.
 */
export function FrameworkActivityPanel() {
  const [scope, setScope] = useState<FrameworkAuditScope>("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<FrameworkAuditResult>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlatformAuditRow | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadFrameworkAuditLogs({ page, scope })
      .then((res) => { if (live) setResult(res); })
      .catch(() => { if (live) setResult(EMPTY); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, scope]);

  const onScopeChange = (v: string) => { setScope(v as FrameworkAuditScope); setPage(1); };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Dropdown
          value={scope}
          onChange={onScopeChange}
          width="w-56"
          options={SCOPE_OPTIONS}
        />
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Read-only history of framework catalog and per-tenant changes.
        </span>
      </div>

      {!loading && result.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={History}
            title="No framework activity yet"
            description="Adding, enabling, or disabling frameworks — platform-wide or per tenant — will appear here."
          />
        </Card>
      ) : (
        <>
          <Card
            padding="none"
            header={
              <>
                <span className="card-title">Activity</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {loading ? "Loading…" : `${result.total} total`}
                </span>
              </>
            }
          >
            <DataTable
              ariaLabel="Framework activity events"
              data={result.rows}
              rowKey={(e) => e.id}
              minWidth={840}
              onRowClick={(e) => setSelected(e)}
              rowClassName={() => "cursor-pointer hover:bg-(--bg-hover)"}
              emptyState={
                <p className="text-center text-[13px] py-8" style={{ color: "var(--text-muted)" }}>
                  {loading ? "Loading…" : "No framework activity matches the current filter."}
                </p>
              }
              columns={[
                {
                  key: "when",
                  header: "When",
                  render: (e) => (
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {dayjs(e.createdAt).format("DD MMM YYYY, HH:mm")}
                    </span>
                  ),
                },
                {
                  key: "event",
                  header: "Event",
                  render: (e) => {
                    const tenantEvent = e.action.startsWith("TENANT_FRAMEWORK");
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</span>
                        <Badge variant={tenantEvent ? "blue" : "gray"}>{tenantEvent ? "Tenant" : "Platform"}</Badge>
                      </div>
                    );
                  },
                },
                {
                  key: "framework",
                  header: "Framework",
                  render: (e) => (
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{e.frameworkName}</span>
                  ),
                },
                {
                  key: "tenant",
                  header: "Tenant",
                  render: (e) => (
                    <span className="text-[12px]" style={{ color: e.tenantName ? "var(--text-secondary)" : "var(--text-muted)" }}>
                      {e.tenantName ?? "Platform-wide"}
                    </span>
                  ),
                },
                {
                  key: "actor",
                  header: "Actor",
                  render: (e) => (
                    <div className="text-[12px]">
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>{actorOf(e)}</p>
                      {e.userRole && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roleLabel(e.userRole)}</p>}
                    </div>
                  ),
                },
              ] satisfies Column<FrameworkAuditRow>[]}
            />
          </Card>

          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            onChange={setPage}
            itemLabel="event"
            className="mt-4"
          />
        </>
      )}

      {/* Read-only single-record detail — the shared, immutable audit modal. */}
      <AuditDetailModal row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
