"use client";

// NOTE: Content-hash chain + append-only enforcement is a planned future
// feature (AUDIT-GLOBAL-PATTERNS.md Finding #7). This view provides actor
// identity, timestamp, and tenant-scoped persistence — do NOT add
// tamper-evidence / immutable UI claims until the schema supports them.

import { useState } from "react";
import { Bot, ScrollText } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Badge } from "@/components/ui/Badge";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable, type DataColumn, type DataFilter } from "@/components/table/DataTable";
import { roleLabel } from "@/lib/labels/roles";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { moduleLabel } from "@/lib/labels/modules";
import { loadAuditTrail } from "@/actions/auditLogs";
import type { AuditTrailRow, AuditTrailFilterOptions, PlatformAuditRow } from "@/lib/queries";
// Reuse the humanised, read-only detail modal built for the #4 Framework
// Activity surface (field-level before/after diff, meaningful IP, target as a
// reference — never a raw CUID) rather than forking a second one.
import { AuditDetailModal } from "@/modules/admin/platform-audit/_components/AuditDetailModal";
import { SEVERITY_VARIANT, severityOf, type Severity } from "./audit-helpers";
import { AiActivityPanel } from "./AiActivityPanel";

// MUST match the route's getAuditTrailPage pageSize — the route seeds page 1 as
// initialData, and Show More requests page 2 at this size.
const PAGE_SIZE = 25;

/** Compact severity tag beside the action label (no tag for routine events, to
 *  keep the column quiet). */
const SEVERITY_TAG: Record<Severity, string | null> = {
  critical: "Critical",
  status_change: "Status",
  create: "New",
  other: null,
};

/** ::1 / 127.0.0.1 → "Localhost (server)"; null → "—". Mirrors the reused
 *  AuditDetailModal's IP presentation for the table cell (item 6). */
function ipLabel(ip: string | null): string {
  if (!ip) return "—";
  const v = ip.trim();
  if (v === "::1" || v === "127.0.0.1" || v === "::ffff:127.0.0.1") return "Localhost (server)";
  return v;
}

interface Props {
  initialData: { rows: AuditTrailRow[]; total: number };
  options: AuditTrailFilterOptions;
}

type TrailTab = "actions" | "ai";

export function AuditTrailPage({ initialData, options }: Props) {
  const { org } = useTenantConfig();
  const tz = org.timezone;
  const [detailRow, setDetailRow] = useState<AuditTrailRow | null>(null);
  // Two trails, one page. The application trail (Prisma AuditLog) records what
  // people did to records; the AI trail (the AI service's ai_audit_trail)
  // records what the AI was asked and what it answered. Both are needed to
  // reconstruct an AI-assisted decision, and the AI one had no reader at all
  // until now.
  const [tab, setTab] = useState<TrailTab>("actions");

  const columns: DataColumn<AuditTrailRow>[] = [
    {
      key: "timestamp",
      label: "Timestamp",
      sortable: true,
      exportValue: (e) => dayjs.utc(e.createdAt).tz(tz).format("YYYY-MM-DD HH:mm:ss"),
      render: (e) => (
        <time
          dateTime={dayjs(e.createdAt).toISOString()}
          title={dayjs.utc(e.createdAt).tz(tz).format("DD MMM YYYY HH:mm:ss")}
          className="font-mono text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {dayjs.utc(e.createdAt).tz(tz).format("DD MMM YYYY, HH:mm")}
        </time>
      ),
    },
    {
      key: "action",
      label: "Action",
      sortable: true,
      exportValue: (e) => auditEventLabel(e.action),
      render: (e) => {
        const sev = severityOf(e.action);
        const tag = SEVERITY_TAG[sev];
        return (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</span>
            {tag && <Badge variant={SEVERITY_VARIANT[sev]}>{tag}</Badge>}
          </div>
        );
      },
    },
    {
      key: "module",
      label: "Module",
      sortable: true,
      exportValue: (e) => moduleLabel(e.module),
      render: (e) => <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{moduleLabel(e.module)}</span>,
    },
    {
      key: "actor",
      label: "Actor",
      sortable: true,
      exportValue: (e) => (e.userRole ? `${e.userName} (${roleLabel(e.userRole)})` : e.userName),
      render: (e) => (
        <div className="text-[12px]">
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>{e.userName}</p>
          {e.userRole && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{roleLabel(e.userRole)}</p>}
        </div>
      ),
    },
    {
      key: "target",
      label: "Target",
      exportValue: (e) => e.displayId,
      render: (e) => (
        <span
          className="font-mono text-[12px] block truncate max-w-[240px]"
          style={{ color: "var(--text-secondary)" }}
          title={e.recordTitle && e.recordTitle !== e.displayId ? `${e.displayId} · ${e.recordTitle}` : e.displayId}
        >
          {e.displayId}
        </span>
      ),
    },
    {
      key: "ip",
      label: "IP",
      exportValue: (e) => ipLabel(e.ipAddress),
      render: (e) => <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{ipLabel(e.ipAddress)}</span>,
    },
  ];

  // Toolbar filters. Module/action/actor options come from the DB-distinct
  // values (labels humanised client-side); "time" is a rolling-window preset the
  // server maps to a dateFrom. Every filter re-queries the server via the
  // fetcher — so a filter narrows the WHOLE trail, not just the loaded page.
  const filters: DataFilter<AuditTrailRow>[] = [
    { key: "module", label: "modules", options: options.modules.map((m) => ({ value: m, label: moduleLabel(m) })) },
    { key: "action", label: "actions", options: options.actions.map((a) => ({ value: a, label: auditEventLabel(a) })) },
    { key: "actor", label: "actors", options: options.actors.map((n) => ({ value: n, label: n })) },
    {
      key: "period",
      label: "time",
      options: [
        { value: "24h", label: "Last 24 hours" },
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "90d", label: "Last 90 days" },
      ],
    },
  ];

  // Adapt the enriched trail row to the shape the reused (platform) modal wants:
  // actor falls back to the denormalised userName (username left null); this is a
  // single-tenant view, so there's no affected-account name — the modal then
  // shows the resolved reference (displayId) as the Target, with the raw
  // recordId only as a hover tooltip.
  const modalRow: PlatformAuditRow | null = detailRow
    ? {
        ...detailRow,
        username: null,
        accountName: null,
        recordTitle: detailRow.displayId !== "—" ? detailRow.displayId : detailRow.recordTitle,
      }
    : null;

  return (
    <PageLayout
      title="Audit Log"
      titleIcon={ScrollText}
      description="Every recorded action in your organisation — actor, timestamp, and the affected record (21 CFR Part 11). Read-only."
    >
      <div
        role="tablist"
        aria-label="Audit trail source"
        className="flex items-center gap-1 rounded-lg p-0.5 mb-4 w-fit"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        {([
          { value: "actions", label: "Record actions", icon: ScrollText },
          { value: "ai", label: "AI activity", icon: Bot },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={tab === opt.value}
            onClick={() => setTab(opt.value)}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md cursor-pointer border-0 inline-flex items-center gap-1.5"
            style={{
              background: tab === opt.value ? "var(--brand)" : "transparent",
              color: tab === opt.value ? "#fff" : "var(--text-secondary)",
            }}
          >
            <opt.icon className="w-3.5 h-3.5" aria-hidden="true" />
            {opt.label}
          </button>
        ))}
      </div>

      {tab === "ai" ? (
        <AiActivityPanel />
      ) : (
      <DataTable<AuditTrailRow>
        mode="server"
        fetcher={loadAuditTrail}
        initialData={initialData}
        rowKey={(e) => e.id}
        ariaLabel="Audit trail"
        columns={columns}
        pageSize={PAGE_SIZE}
        defaultSort={{ key: "timestamp", dir: "desc" }}
        search={{ placeholder: "Search action, actor, record…" }}
        filters={filters}
        exportOptions={{ filename: `audit-trail-${dayjs().format("YYYY-MM-DD")}`, title: "Audit Log" }}
        onRowClick={(e) => setDetailRow(e)}
        emptyState="No audit events match the current filters."
      />
      )}

      <AuditDetailModal row={modalRow} onClose={() => setDetailRow(null)} />
    </PageLayout>
  );
}
