"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Wrench, X, Search, Clock, ListChecks, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { PageLayout } from "@/components/layout/PageLayout";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { roleLabel } from "@/lib/labels/roles";
import type { Worklist, WorklistStageTask } from "@/lib/queries/worklist";
import { WorkItemCard } from "./WorkItemCard";
import { WorkItemModal } from "./WorkItemModal";
import { findingToWorkItem, actionToWorkItem, deviationToWorkItem, type WorkItem } from "./workItem";

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
  currentUserName,
  currentUserRole,
}: {
  worklist: Worklist;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  const timezone = org.timezone;
  const isViewer = currentUserRole === "viewer";

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // View + filters (component state only — not persisted).
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dueByFilter, setDueByFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<"" | "open" | "rework" | "dueSoon" | "overdue">("");

  // ── Normalize ALL assigned work (findings + CAPA actions + deviation tasks)
  //    into ONE unified list of Finding-style work items via the per-source
  //    adapters. Findings first, then CAPA actions, then deviation tasks. ──
  const workItems = useMemo<WorkItem[]>(() => {
    const fmt = (iso: string | null) => (iso ? dayjs.utc(iso).tz(timezone).format(dateFormat) : "—");
    return [
      ...worklist.assignedFindings.map((f) => findingToWorkItem(f, fmt)),
      ...worklist.assignedActions.map((a) => actionToWorkItem(a, fmt)),
      ...worklist.deviationTasks.map((t) => deviationToWorkItem(t, fmt)),
    ];
  }, [worklist, dateFormat, timezone]);

  const selected = workItems.find((w) => w.key === selectedKey) ?? null;

  // Summary counts — over the FULL unified list (pre-filter) so the cards agree.
  const openCount = workItems.filter((i) => i.isOpen).length;
  const reworkCount = workItems.filter((i) => i.isRework).length;
  const dueSoonCount = workItems.filter(isDueSoon).length;
  const overdueCount = workItems.filter(isOverdue).length;

  const anyFilter = !!(searchQuery || statusFilter || priorityFilter || dueByFilter || quickFilter);
  const clearFilters = () => { setSearchQuery(""); setStatusFilter(""); setPriorityFilter(""); setDueByFilter(""); setQuickFilter(""); };
  const toggleQuick = (q: typeof quickFilter) => setQuickFilter((prev) => (prev === q ? "" : q));

  const matchesQuick = (i: WorkItem): boolean => {
    switch (quickFilter) {
      case "open": return i.isOpen;
      case "rework": return i.isRework;
      case "dueSoon": return isDueSoon(i);
      case "overdue": return isOverdue(i);
      default: return true;
    }
  };
  const matches = (i: WorkItem): boolean => {
    if (statusFilter && i.statusLabel !== statusFilter) return false;
    if (priorityFilter && i.priority !== priorityFilter) return false;
    if (dueByFilter && i.dueDate && dayjs.utc(i.dueDate).isAfter(dayjs.utc(dueByFilter).endOf("day"))) return false;
    if (!matchesQuick(i)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(`${i.sourceLabel} ${i.reference} ${i.title} ${i.metaLine}`.toLowerCase().includes(q))) return false;
    }
    return true;
  };

  // Rework first, then by soonest due date; open before done.
  const visible = workItems
    .filter(matches)
    .sort((a, b) => {
      if (a.isRework !== b.isRework) return a.isRework ? -1 : 1;
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  const reworkItems = visible.filter((i) => i.isRework);

  return (
    <div className="capa-shell min-h-full">
    <div className="p-6">
      <PageLayout
        title="My Worklist"
        description={[
          "Your assigned actions, tasks, and findings across all modules.",
          currentUserName,
          roleLabel(currentUserRole),
          isViewer ? "read-only" : null,
          openCount > 0 ? `${openCount} open` : null,
          reworkCount > 0 ? `${reworkCount} need rework` : null,
        ].filter(Boolean).join(" · ")}
      >

      {/* ── Status summary cards — clickable filters (toggle) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Open tasks" value={openCount} tone="active" icon={ListChecks} active={quickFilter === "open"} onClick={() => toggleQuick("open")} />
        <SummaryCard label="Needs rework" value={reworkCount} tone="waiting" icon={Wrench} active={quickFilter === "rework"} onClick={() => toggleQuick("rework")} />
        <SummaryCard label="Due soon (7d)" value={dueSoonCount} tone="info" icon={CalendarClock} active={quickFilter === "dueSoon"} onClick={() => toggleQuick("dueSoon")} />
        <SummaryCard label="Overdue" value={overdueCount} tone="blocked" icon={Clock} active={quickFilter === "overdue"} onClick={() => toggleQuick("overdue")} />
      </div>

      {/* ── Controls: search + filters ── */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            className="input text-[12px] pl-8"
            placeholder="Search source, reference or task…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search worklist"
            style={{ width: 240 }}
          />
        </div>
        <Dropdown
          placeholder="All statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          width="w-40"
          options={[
            { value: "", label: "All statuses" },
            { value: "Not Started", label: "Not Started" },
            { value: "In Progress", label: "In Progress" },
            { value: "Returned", label: "Returned" },
            { value: "Submitted", label: "Submitted" },
            { value: "Done", label: "Done" },
          ]}
        />
        <Dropdown
          placeholder="All priorities"
          value={priorityFilter}
          onChange={setPriorityFilter}
          width="w-40"
          options={[
            { value: "", label: "All priorities" },
            { value: "Critical", label: "Critical" },
            { value: "High", label: "High" },
            { value: "Medium", label: "Medium" },
            { value: "Low", label: "Low" },
          ]}
        />
        <input
          type="date"
          className="input text-[12px]"
          value={dueByFilter}
          onChange={(e) => setDueByFilter(e.target.value)}
          aria-label="Due on or before"
          style={{ width: 150 }}
        />
        {anyFilter && (
          <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>
        )}
      </div>

      {workItems.length === 0 && worklist.stageTasks.length === 0 && (
        <div className="card p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Nothing assigned to you right now.</p>
        </div>
      )}

      {/* ── NEEDS REWORK (across all sources) ── */}
      {reworkItems.length > 0 && (
        <section className="mb-6" aria-labelledby="rework-heading">
          <h2 id="rework-heading" className="text-[12px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--status-blocked)" }}>
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Needs rework ({reworkItems.length})
          </h2>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--status-blocked)" }}>
            {reworkItems.map((i) => (
              <WorkItemCard key={i.key} item={i} onOpen={() => setSelectedKey(i.key)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Unified "My work" list — every source in the one Finding-style card ── */}
      {visible.length > 0 && (
        <section className="mb-3 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <ListChecks className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>My work ({visible.length})</h2>
          </div>
          <div>
            {visible.map((i) => (
              <WorkItemCard key={i.key} item={i} onOpen={() => setSelectedKey(i.key)} />
            ))}
          </div>
        </section>
      )}

      {/* CSV/CSA stage rework tasks — read-only here; the worker acts on the
          system's Execute tab (deep-linked). Kept as a separate section (a 4th
          work type outside the unified evidence/notes surface). */}
      {worklist.stageTasks.length > 0 && (
        <section className="mb-3 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <Wrench className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Validation rework tasks ({worklist.stageTasks.length})</h2>
          </div>
          <div>
            {worklist.stageTasks.map((t: WorklistStageTask) => (
              <Link
                key={t.id}
                href={`/csv-csa/systems/${t.systemReference ?? t.systemId}?tab=execute`}
                className="w-full text-left flex items-center gap-3 p-3 no-underline hover:bg-(--bg-hover)"
                style={{ borderBottom: "1px solid var(--bg-border)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{t.systemReference ?? t.systemName} · {t.stageName} stage</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{t.message}</p>
                </div>
                {t.dueDate && <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(t.dueDate).format("DD MMM")}</span>}
                <Badge variant={t.status === "submitted" ? "purple" : t.status === "rework" ? "red" : "amber"}>{t.status === "in_progress" ? "In Progress" : t.status === "submitted" ? "Submitted" : t.status === "rework" ? "Rework" : "Pending"}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty-after-filter hint */}
      {workItems.length > 0 && visible.length === 0 && (
        <p className="text-[12px] text-center py-6" style={{ color: "var(--text-muted)" }}>No work items match the current filters.</p>
      )}

      {/* ONE shared work modal for every source */}
      {selected && (
        <WorkItemModal
          item={selected}
          currentUserId={currentUserId}
          onClose={() => setSelectedKey(null)}
          onChanged={() => router.refresh()}
        />
      )}

      </PageLayout>
    </div>
    </div>
  );
}

const SUMMARY_TONE: Record<string, string> = {
  active: "var(--status-active)",
  waiting: "var(--status-waiting)",
  info: "var(--info)",
  blocked: "var(--status-blocked)",
};

function SummaryCard({
  label, value, tone, icon: Icon, active, onClick,
}: {
  label: string;
  value: number;
  tone: "active" | "waiting" | "info" | "blocked";
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  const color = SUMMARY_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-left rounded-xl p-3 border cursor-pointer transition-all hover:-translate-y-px"
      style={{
        background: "var(--card-bg)",
        borderColor: active ? color : "var(--card-border)",
        boxShadow: active ? `0 0 0 2px ${color}` : "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[22px] font-bold leading-none" style={{ color }}>{value}</p>
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: "var(--bg-elevated)", color }}>
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="mt-1.5 h-0.5 rounded-full" style={{ width: active ? "100%" : "0%", background: color, transition: "width .2s" }} />
    </button>
  );
}
