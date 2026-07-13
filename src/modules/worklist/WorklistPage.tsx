"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, Wrench, Clock, ListChecks, CalendarClock, ListTodo,
  MoreVertical, ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { StatCard, DataTable, type Column } from "@/components/shared";
import { PageLayout } from "@/components/layout/PageLayout";
import { MotionList, MotionListItem } from "@/components/motion/Motion";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant } from "@/lib/badgeVariants";
import type { Worklist, WorklistStageTask } from "@/lib/queries/worklist";
import { WorkItemModal } from "./WorkItemModal";
import { findingToWorkItem, actionToWorkItem, deviationToWorkItem, type WorkItem, type WorkSource } from "./workItem";

/** Source chip tone — Finding / CAPA / Deviation get distinct accents. */
const SOURCE_TONE: Record<WorkSource, "blue" | "purple" | "amber"> = {
  finding: "blue",
  capa: "purple",
  deviation: "amber",
};

/** Open + within the next 7 days (and not past due). */
function isDueSoon(item: WorkItem): boolean {
  if (!item.isOpen || !item.dueDate) return false;
  const d = dayjs.utc(item.dueDate);
  return d.isAfter(dayjs()) && d.isBefore(dayjs().add(7, "day"));
}
function isOverdue(item: WorkItem): boolean {
  if (!item.isOpen || !item.dueDate) return false;
  return dayjs.utc(item.dueDate).isBefore(dayjs());
}

export function WorklistPage({
  worklist,
  currentUserId,
}: {
  worklist: Worklist;
  currentUserId: string;
}) {
  const router = useRouter();
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  const timezone = org.timezone;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ── Normalize ALL assigned work (findings + CAPA actions + deviation tasks)
  //    into ONE unified list of work items via the per-source adapters. ──
  const workItems = useMemo<WorkItem[]>(() => {
    const fmt = (iso: string | null) => (iso ? dayjs.utc(iso).tz(timezone).format(dateFormat) : "—");
    return [
      ...worklist.assignedFindings.map((f) => findingToWorkItem(f, fmt)),
      ...worklist.assignedActions.map((a) => actionToWorkItem(a, fmt)),
      ...worklist.deviationTasks.map((t) => deviationToWorkItem(t, fmt)),
    ];
  }, [worklist, dateFormat, timezone]);

  const selected = workItems.find((w) => w.key === selectedKey) ?? null;

  // ── KPIs — derived from the SAME unified list the strips consume (no new
  //    query). "Total" also counts the CSV stage tasks (a 4th read-only strip);
  //    the due-based metrics are over the actionable WorkItems only. ──
  const totalCount = workItems.length + worklist.stageTasks.length;
  const overdueCount = workItems.filter(isOverdue).length;
  const dueSoonCount = workItems.filter(isDueSoon).length;
  // "Awaiting me" — open AND the worker can act on it (excludes Submitted, which
  // is awaiting QA, and Done/Closed).
  const awaitingCount = workItems.filter((i) => i.isOpen && i.canWork).length;

  // Rework first, then open before done, then soonest due.
  const sorted = useMemo(
    () =>
      [...workItems].sort((a, b) => {
        if (a.isRework !== b.isRework) return a.isRework ? -1 : 1;
        if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      }),
    [workItems],
  );
  // Each item appears in exactly ONE group: rework in its pinned section, the
  // rest in "My work" (was double-listed on the old card layout).
  const reworkItems = sorted.filter((i) => i.isRework);
  const myWorkItems = sorted.filter((i) => !i.isRework);

  const fmtDue = (i: WorkItem) => (i.dueDate ? dayjs.utc(i.dueDate).tz(timezone).format(dateFormat) : "—");

  // ── Columns shared by the rework + my-work tables (DataTableBase primitive). ──
  const workColumns: Column<WorkItem>[] = [
    { key: "source", header: "Source", render: (i) => <Badge variant={SOURCE_TONE[i.source]}>{i.sourceLabel}</Badge> },
    { key: "ref", header: "Ref", cellClassName: "font-mono text-[11px] whitespace-nowrap text-(--text-secondary)", render: (i) => i.reference },
    { key: "title", header: "Title", cellClassName: "text-[12px] text-(--text-primary)", render: (i) => <span className="line-clamp-1 block max-w-[340px]" title={i.title}>{i.title}</span> },
    { key: "status", header: "Status", render: (i) => <Badge variant={i.statusVariant}>{i.statusLabel}</Badge> },
    { key: "priority", header: "Priority", render: (i) => (i.priority ? <Badge variant={getSeverityVariant(i.priority, "generic")}>{i.priority}</Badge> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>) },
    {
      key: "due", header: "Due", cellClassName: "whitespace-nowrap text-[11px]",
      render: (i) => {
        const od = isOverdue(i);
        return (
          <span style={{ color: od ? "var(--danger)" : "var(--text-secondary)" }}>
            {fmtDue(i)}{od && <span className="block text-[9px]" style={{ color: "var(--danger)" }}>Overdue</span>}
          </span>
        );
      },
    },
    {
      key: "actions", header: "Open", srOnly: true, align: "right",
      render: (i) => <RowActions item={i} onOpen={() => setSelectedKey(i.key)} onViewSource={(href) => router.push(href)} />,
    },
  ];

  return (
    <PageLayout
      title="My Worklist"
      titleIcon={ListTodo}
      className="capa-shell"
      description="Your tasks and pending items across every compliance workflow."
    >
      {/* Phase-3 entrance sequence: KPI cards → each group section, revealed one
          after another via MotionList/MotionListItem (reduced-motion aware; tempo
          from the motion tokens). The KPI row nests its own MotionList so the 4
          cards cascade. Single-page module — framer animates on mount only, so no
          replay guard is needed. The modal stays OUTSIDE the list. */}
      <MotionList className="space-y-4">
        {/* KPI cards (inner cascade) */}
        <MotionListItem>
          <MotionList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={ListChecks} color="var(--brand)" label="Total items" value={String(totalCount)} sub="Assigned to you" /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={Clock} color="var(--danger)" label="Overdue" value={String(overdueCount)} sub="Past due, still open" /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={CalendarClock} color="var(--warning)" label="Due this week" value={String(dueSoonCount)} sub="Within the next 7 days" /></MotionListItem>
            <MotionListItem className="h-full [&>*]:h-full"><StatCard icon={Wrench} color="var(--info)" label="Awaiting me" value={String(awaitingCount)} sub="Action needed from you" /></MotionListItem>
          </MotionList>
        </MotionListItem>

        {/* Nothing assigned at all */}
        {totalCount === 0 && (
          <MotionListItem>
            <div className="card p-8 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Nothing assigned to you right now.</p>
            </div>
          </MotionListItem>
        )}

        {/* Needs rework (across all sources) — pinned, red-bordered */}
        {reworkItems.length > 0 && (
          <MotionListItem>
            <GroupSection title="Needs rework" count={reworkItems.length} icon={AlertTriangle} tone="blocked">
              <WorkTable ariaLabel="Items returned for rework" items={reworkItems} columns={workColumns} onOpen={setSelectedKey} />
            </GroupSection>
          </MotionListItem>
        )}

        {/* My work — everything else assigned */}
        {myWorkItems.length > 0 && (
          <MotionListItem>
            <GroupSection title="My work" count={myWorkItems.length} icon={ListChecks}>
              <WorkTable ariaLabel="My assigned work" items={myWorkItems} columns={workColumns} onOpen={setSelectedKey} />
            </GroupSection>
          </MotionListItem>
        )}

        {/* CSV/CSA validation stage rework tasks — read-only here; the worker acts
            on the system's Execute tab (deep-linked). A 4th work type outside the
            unified work-item/modal surface. */}
        {worklist.stageTasks.length > 0 && (
          <MotionListItem>
            <GroupSection title="Validation rework tasks" count={worklist.stageTasks.length} icon={Wrench}>
              <StageTaskTable tasks={worklist.stageTasks} onOpen={(href) => router.push(href)} timezone={timezone} />
            </GroupSection>
          </MotionListItem>
        )}
      </MotionList>

      {/* ONE shared work modal for every source (unchanged wiring). */}
      {selected && (
        <WorkItemModal
          item={selected}
          currentUserId={currentUserId}
          onClose={() => setSelectedKey(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </PageLayout>
  );
}

/* ── Group section — header (title + count + icon) wrapping one table card. The
   "blocked" tone gives the rework group its red border/heading (as the old
   pinned card did). Empty groups aren't rendered (the caller gates on count). ── */
function GroupSection({
  title, count, icon: Icon, tone, children,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  tone?: "blocked";
  children: React.ReactNode;
}) {
  const headColor = tone === "blocked" ? "var(--status-blocked)" : "var(--text-secondary)";
  const borderColor = tone === "blocked" ? "var(--status-blocked)" : "var(--card-border)";
  return (
    <section aria-label={title}>
      <h2 className="text-[12px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: headColor }}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {title} ({count})
      </h2>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: `1px solid ${borderColor}` }}>
        {children}
      </div>
    </section>
  );
}

/* ── One group's items as a compact DataTableBase. Row click opens the shared
   WorkItemModal. `data-density="compact"` sets --row-py for this table's subtree
   (the app-wide compact value) without touching the global density toggle. The
   6-col table scrolls horizontally under `minWidth` on narrow viewports. ── */
function WorkTable({
  ariaLabel, items, columns, onOpen,
}: {
  ariaLabel: string;
  items: WorkItem[];
  columns: Column<WorkItem>[];
  onOpen: (key: string) => void;
}) {
  return (
    <div data-density="compact">
      <DataTable
        ariaLabel={ariaLabel}
        caption={ariaLabel}
        data={items}
        rowKey={(i) => i.key}
        minWidth={760}
        columns={columns}
        onRowClick={(i) => onOpen(i.key)}
      />
    </div>
  );
}

/* ── ⋮ row menu (DataTableBase has no rowMenu, so it's an actions column). Uses
   ONLY existing capabilities: "Open" opens the work modal; "View …" deep-links to
   the source module (item.link). stopPropagation so the ⋮ trigger doesn't also
   fire the row's onRowClick. ── */
function RowActions({
  item, onOpen, onViewSource,
}: {
  item: WorkItem;
  onOpen: () => void;
  onViewSource: (href: string) => void;
}) {
  const options: DropdownOption[] = [
    { value: "open", label: "Open", onClick: onOpen },
    ...(item.link
      ? [{ value: "source", label: `View ${item.link.label}`, icon: ExternalLink, onClick: () => onViewSource(item.link!.href) }]
      : []),
  ];
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <Dropdown
        actionMode
        hideCaret
        width="w-9"
        menuWidth="w-52"
        triggerLabel={<MoreVertical className="w-4 h-4" aria-hidden="true" />}
        options={options}
      />
    </span>
  );
}

/* ── CSV/CSA stage tasks — read-only link-outs (no modal). Row click navigates to
   the system's Execute tab, preserving the old whole-card <Link> behavior. ── */
function StageTaskTable({
  tasks, onOpen, timezone,
}: {
  tasks: WorklistStageTask[];
  onOpen: (href: string) => void;
  timezone: string;
}) {
  const hrefFor = (t: WorklistStageTask) => `/csv-csa/systems/${t.systemReference ?? t.systemId}?tab=execute`;
  const columns: Column<WorklistStageTask>[] = [
    { key: "source", header: "Source", render: () => <Badge variant="gray">CSV/CSA</Badge> },
    { key: "ref", header: "Ref", cellClassName: "font-mono text-[11px] whitespace-nowrap text-(--text-secondary)", render: (t) => t.systemReference ?? t.systemName },
    { key: "title", header: "Task", cellClassName: "text-[12px] text-(--text-primary)", render: (t) => <span className="line-clamp-1 block max-w-[340px]" title={t.message}>{t.stageName} stage · {t.message}</span> },
    { key: "due", header: "Due", cellClassName: "whitespace-nowrap text-[11px] text-(--text-secondary)", render: (t) => (t.dueDate ? dayjs.utc(t.dueDate).tz(timezone).format("DD MMM") : "—") },
    { key: "status", header: "Status", render: (t) => <Badge variant={t.status === "submitted" ? "purple" : t.status === "rework" ? "red" : "amber"}>{t.status === "in_progress" ? "In Progress" : t.status === "submitted" ? "Submitted" : t.status === "rework" ? "Rework" : "Pending"}</Badge> },
    {
      key: "actions", header: "Open", srOnly: true, align: "right",
      render: (t) => (
        <Link href={hrefFor(t)} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] no-underline" style={{ color: "var(--brand)" }} aria-label={`Open ${t.systemReference ?? t.systemName} in CSV/CSA`}>
          Open <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </Link>
      ),
    },
  ];
  return (
    <div data-density="compact">
      <DataTable
        ariaLabel="Validation rework tasks"
        caption="CSV/CSA validation stage rework tasks"
        data={tasks}
        rowKey={(t) => t.id}
        minWidth={680}
        columns={columns}
        onRowClick={(t) => onOpen(hrefFor(t))}
      />
    </div>
  );
}
