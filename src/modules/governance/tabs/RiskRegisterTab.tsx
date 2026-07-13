"use client";

import { useRouter } from "next/navigation";
import { Eye, Pencil, Archive, ShieldAlert } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataColumn, type DataFilter, type RowMenuItem } from "@/components/table/DataTable";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { formatReference } from "@/lib/reference";
import {
  RISK_CATEGORIES,
  RISK_CATEGORY_LABEL,
  RISK_SEVERITIES,
  RISK_STATUSES,
  RISK_LIKELIHOOD_LABEL,
  RISK_STATUS_BADGE,
  type RiskCategory,
  type RiskLikelihood,
  type RiskStatus,
} from "@/constants/risk";
import type { RiskListRow } from "@/lib/queries/risks";

export interface RiskRegisterTabProps {
  risks: RiskListRow[];
  timezone: string;
  dateFormat: string;
  /** May the actor raise a new risk? (any non-viewer) */
  canCreate: boolean;
  /** May the actor archive ANY risk? (GOVERNANCE_MANAGE_ROLES) */
  canManage: boolean;
  /** Per-row edit right: manage role, or the actor created/owns this risk. */
  canEditRow: (r: RiskListRow) => boolean;
  onAdd: () => void;
  onEdit: (r: RiskListRow) => void;
  onArchive: (r: RiskListRow) => void;
}

function severityBadge(s: string) {
  return <Badge variant={getSeverityVariant(s, "generic")}>{normalizeSeverityForDisplay(s, "generic") ?? s}</Badge>;
}
function statusBadge(s: string) {
  const cls = RISK_STATUS_BADGE[s as RiskStatus] ?? "badge badge-gray";
  return <span className={cls}>{s}</span>;
}
function categoryLabel(c: string) {
  return RISK_CATEGORY_LABEL[c as RiskCategory] ?? c;
}
function likelihoodLabel(l: string) {
  return RISK_LIKELIHOOD_LABEL[l as RiskLikelihood] ?? l;
}
function riskRef(r: RiskListRow) {
  return formatReference("RISK", r);
}

/**
 * The Risk Register list. One <DataTable> in client mode, wired to its built-in
 * search / filters / export / ⋮ row menu — no bespoke toolbar.
 *
 * The rows handed in are ALREADY visibility-scoped by the server
 * (`riskVisibilityWhere`), so this component never has to hide a row: if it is
 * here, the actor may see it. What it DOES gate is per-row ACTIONS — Edit is
 * offered to a manage role or the creator/owner; Archive only to a manage role.
 * Both are mirrors of the server gates in src/actions/risks.ts, which stay
 * authoritative.
 */
export function RiskRegisterTab({
  risks, timezone, dateFormat, canCreate, canManage, canEditRow, onAdd, onEdit, onArchive,
}: RiskRegisterTabProps) {
  const router = useRouter();

  const openDetail = (r: RiskListRow) => router.push(`/governance/risks/${r.id}`);

  const columns: DataColumn<RiskListRow>[] = [
    {
      key: "reference",
      label: "Ref",
      sortable: true,
      sortValue: (r) => riskRef(r),
      exportValue: (r) => riskRef(r),
      render: (r) => (
        <span className="font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {riskRef(r)}
        </span>
      ),
    },
    {
      key: "title",
      label: "Title",
      sortable: true,
      sortValue: (r) => r.title,
      exportValue: (r) => r.title,
      render: (r) => (
        <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 280, color: "var(--text-primary)" }} title={r.title}>
          {r.title}
        </span>
      ),
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      sortValue: (r) => categoryLabel(r.category),
      exportValue: (r) => categoryLabel(r.category),
      render: (r) => <span className="badge badge-blue text-[10px]">{categoryLabel(r.category)}</span>,
    },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      // Sort by real risk order, not alphabetically.
      sortValue: (r) => RISK_SEVERITIES.indexOf(r.severity as never),
      exportValue: (r) => r.severity,
      render: (r) => severityBadge(r.severity),
    },
    {
      key: "likelihood",
      label: "Likelihood",
      sortable: true,
      sortValue: (r) => likelihoodLabel(r.likelihood),
      exportValue: (r) => likelihoodLabel(r.likelihood),
      render: (r) => <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{likelihoodLabel(r.likelihood)}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (r) => r.status,
      exportValue: (r) => r.status,
      render: (r) => statusBadge(r.status),
    },
    {
      key: "owner",
      label: "Owner",
      sortable: true,
      sortValue: (r) => r.ownerName ?? "",
      exportValue: (r) => r.ownerName ?? "",
      render: (r) => (
        <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
          {r.ownerName ?? "—"}
        </span>
      ),
    },
    {
      key: "targetDate",
      label: "Target date",
      sortable: true,
      sortValue: (r) => r.targetDate ?? "",
      exportValue: (r) => (r.targetDate ? dayjs.utc(r.targetDate).tz(timezone).format(dateFormat) : ""),
      render: (r) => {
        if (!r.targetDate) return <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>;
        const overdue = r.status !== "Closed" && r.status !== "Converted" && dayjs.utc(r.targetDate).isBefore(dayjs());
        return (
          <div className="whitespace-nowrap">
            <div className="text-[12px]" style={{ color: overdue ? "#ef4444" : "var(--text-primary)" }}>
              {dayjs.utc(r.targetDate).tz(timezone).format(dateFormat)}
            </div>
            {overdue && <div className="text-[10px] text-[#ef4444]">Overdue</div>}
          </div>
        );
      },
    },
  ];

  const filters: DataFilter<RiskListRow>[] = [
    {
      key: "category",
      label: "category",
      options: RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABEL[c] })),
      match: (r, v) => r.category === v,
    },
    {
      key: "status",
      label: "status",
      options: RISK_STATUSES.map((s) => ({ value: s, label: s })),
      match: (r, v) => r.status === v,
    },
    {
      key: "severity",
      label: "severity",
      options: RISK_SEVERITIES.map((s) => ({ value: s, label: s })),
      match: (r, v) => r.severity === v,
    },
  ];

  const rowMenu = (r: RiskListRow): RowMenuItem[] => {
    const editable = canEditRow(r) && r.status !== "Converted";
    return [
      { label: "View", icon: Eye, onClick: () => openDetail(r) },
      {
        label: "Edit",
        icon: Pencil,
        disabled: !editable,
        disabledReason: r.status === "Converted"
          ? "A converted risk can no longer be edited."
          : "Only the risk's creator, its owner, or QA Head / Customer Admin can edit it.",
        onClick: () => { if (editable) onEdit(r); },
      },
      {
        label: "Archive",
        icon: Archive,
        danger: true,
        disabled: !canManage,
        disabledReason: "Only QA Head, Customer Admin, or Super Admin can archive a risk.",
        onClick: () => { if (canManage) onArchive(r); },
      },
    ];
  };

  return (
    <div className="space-y-4">
      <DataTable<RiskListRow>
        mode="client"
        data={risks}
        rowKey={(r) => r.id}
        ariaLabel="Risk register"
        columns={columns}
        defaultSort={{ key: "reference", dir: "desc" }}
        search={{ placeholder: "Search risks…", keys: ["reference", "title", "description", "ownerName"] }}
        filters={filters}
        exportOptions={{ filename: `risk-register-${dayjs().format("YYYY-MM-DD")}`, title: "Risk Register" }}
        rowMenu={rowMenu}
        onRowClick={openDetail}
        toolbarActions={
          canCreate ? (
            <Button variant="primary" size="sm" icon={ShieldAlert} onClick={onAdd}>
              + Add Risk
            </Button>
          ) : undefined
        }
        emptyState={(ctx) =>
          ctx.isFiltered || ctx.hasSearch ? (
            <span>No risks match the current filters.</span>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <ShieldAlert className="w-10 h-10 text-[#334155]" aria-hidden="true" />
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No risks in the register yet</p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Raise your first risk to start tracking it through to mitigation.
              </p>
              {canCreate && <Button variant="primary" size="sm" icon={ShieldAlert} onClick={onAdd}>Add Risk</Button>}
            </div>
          )
        }
      />
    </div>
  );
}
