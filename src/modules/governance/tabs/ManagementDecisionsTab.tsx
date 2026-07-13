"use client";

import { useRouter } from "next/navigation";
import { Eye, Pencil, Archive, Gavel } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn, type DataFilter, type RowMenuItem } from "@/components/table/DataTable";
import { formatReference } from "@/lib/reference";
import { DECISION_DATE_RANGES, matchesDateRange, isActionItem } from "@/constants/managementDecision";
import type { ManagementDecisionRow } from "@/lib/queries/managementDecisions";

export interface ManagementDecisionsTabProps {
  decisions: ManagementDecisionRow[];
  timezone: string;
  dateFormat: string;
  /** May the actor record a new meeting? (any non-viewer) */
  canCreate: boolean;
  /** May the actor archive ANY meeting? (GOVERNANCE_MANAGE_ROLES) */
  canManage: boolean;
  /** Per-row edit right: manage role, or the actor created this meeting. */
  canEditRow: (d: ManagementDecisionRow) => boolean;
  onAdd: () => void;
  onEdit: (d: ManagementDecisionRow) => void;
  onArchive: (d: ManagementDecisionRow) => void;
}

function decisionRef(d: ManagementDecisionRow) {
  return formatReference("MGT", d);
}

/**
 * Management Decisions register — replaces the Phase-1 placeholder.
 *
 * One <DataTable> in client mode, wired to its built-in search / filters / export
 * / ⋮ row menu. The "date-range filter" is expressed as the shared filter's
 * preset options (`DECISION_DATE_RANGES`) with a custom `match`, so no bespoke
 * date-range control is introduced.
 *
 * The rows handed in are ALREADY visibility-scoped by the server
 * (`managementDecisionVisibilityWhere`), so this component never hides a row: if
 * it is here, the actor may see it. What it DOES gate is per-row ACTIONS — Edit
 * for a manage role or the creator; Archive for a manage role only. Both mirror
 * the server gates in src/actions/management-decisions.ts, which stay
 * authoritative.
 */
export function ManagementDecisionsTab({
  decisions, timezone, dateFormat, canCreate, canManage, canEditRow, onAdd, onEdit, onArchive,
}: ManagementDecisionsTabProps) {
  const router = useRouter();
  const openDetail = (d: ManagementDecisionRow) => router.push(`/governance/decisions/${d.id}`);

  const columns: DataColumn<ManagementDecisionRow>[] = [
    {
      key: "reference",
      label: "Ref",
      sortable: true,
      sortValue: (d) => decisionRef(d),
      exportValue: (d) => decisionRef(d),
      render: (d) => (
        <span className="font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
          {decisionRef(d)}
        </span>
      ),
    },
    {
      key: "topic",
      label: "Topic",
      sortable: true,
      sortValue: (d) => d.topic,
      exportValue: (d) => d.topic,
      render: (d) => (
        <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 320, color: "var(--text-primary)" }} title={d.topic}>
          {d.topic}
        </span>
      ),
    },
    {
      key: "meetingDate",
      label: "Meeting date",
      sortable: true,
      sortValue: (d) => d.meetingDate,
      exportValue: (d) => dayjs.utc(d.meetingDate).tz(timezone).format(dateFormat),
      render: (d) => (
        <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
          {dayjs.utc(d.meetingDate).tz(timezone).format(dateFormat)}
        </span>
      ),
    },
    {
      key: "itemCount",
      label: "Decisions",
      sortable: true,
      sortValue: (d) => d.itemCount,
      exportValue: (d) => String(d.itemCount),
      render: (d) => {
        const actions = d.items.filter(isActionItem).length;
        return (
          <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
            {d.itemCount}
            {actions > 0 && (
              <span className="text-[10px] ml-1.5" style={{ color: "var(--text-muted)" }}>
                ({actions} action{actions === 1 ? "" : "s"})
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "chairedBy",
      label: "Chair",
      sortable: true,
      sortValue: (d) => d.chairedByName ?? "",
      exportValue: (d) => d.chairedByName ?? "",
      render: (d) => (
        <span className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
          {d.chairedByName ?? "—"}
        </span>
      ),
    },
  ];

  const filters: DataFilter<ManagementDecisionRow>[] = [
    {
      key: "meetingDate",
      label: "meeting date",
      options: DECISION_DATE_RANGES.map((r) => ({ value: r.value, label: r.label })),
      // The shared filter takes an arbitrary predicate, so a date RANGE needs no
      // bespoke control — just presets plus this match.
      match: (d, v) => matchesDateRange(d.meetingDate, v, new Date()),
    },
  ];

  const rowMenu = (d: ManagementDecisionRow): RowMenuItem[] => {
    const editable = canEditRow(d);
    return [
      { label: "View", icon: Eye, onClick: () => openDetail(d) },
      {
        label: "Edit",
        icon: Pencil,
        disabled: !editable,
        disabledReason: "Only the meeting's author, or QA Head / Customer Admin, can amend it.",
        onClick: () => { if (editable) onEdit(d); },
      },
      {
        label: "Archive",
        icon: Archive,
        danger: true,
        disabled: !canManage,
        disabledReason: "Only QA Head, Customer Admin, or Super Admin can archive a meeting.",
        onClick: () => { if (canManage) onArchive(d); },
      },
    ];
  };

  return (
    <div className="space-y-4">
      <DataTable<ManagementDecisionRow>
        mode="client"
        data={decisions}
        rowKey={(d) => d.id}
        ariaLabel="Management decisions register"
        columns={columns}
        defaultSort={{ key: "meetingDate", dir: "desc" }}
        search={{ placeholder: "Search meetings…", keys: ["reference", "topic", "attendees", "chairedByName"] }}
        filters={filters}
        exportOptions={{ filename: `management-decisions-${dayjs().format("YYYY-MM-DD")}`, title: "Management Decisions" }}
        rowMenu={rowMenu}
        onRowClick={openDetail}
        toolbarActions={
          canCreate ? (
            <Button variant="primary" size="sm" icon={Gavel} onClick={onAdd}>
              + Record Decision
            </Button>
          ) : undefined
        }
        emptyState={(ctx) =>
          ctx.isFiltered || ctx.hasSearch ? (
            <span>No meetings match the current filters.</span>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <Gavel className="w-10 h-10 text-[#334155]" aria-hidden="true" />
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No management decisions recorded yet</p>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Minute your first management review — the meeting, who attended, and what was decided.
              </p>
              {canCreate && <Button variant="primary" size="sm" icon={Gavel} onClick={onAdd}>Record Decision</Button>}
            </div>
          )
        }
      />
    </div>
  );
}
