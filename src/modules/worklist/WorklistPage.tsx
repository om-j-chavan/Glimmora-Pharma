"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, Send, Wrench, LayoutGrid, List, X, Search, Clock, ListChecks, CalendarClock, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant } from "@/lib/badgeVariants";
import { submitForReview } from "@/actions/capas";
import type { Worklist, WorklistGroup, WorklistItem, WorklistDeviationTask, WorklistFinding } from "@/lib/queries/worklist";
import { EvidenceCollectionPanel } from "@/modules/capa/tabs/EvidenceCollectionPanel";
import { TaskPanel } from "./TaskPanel";
import { DeviationTaskPanel } from "./DeviationTaskPanel";
import { FindingWorkPanel } from "./FindingWorkPanel";
import { StatusPill, ACTION_STATUS_TOKEN } from "@/modules/capa/lib/statusTokens";

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
  rework: "Rework",
};
// Stage 4 (deviation redesign) — low-priority deviation-task row labels.
const DEV_TASK_ROW_LABEL: Record<string, string> = {
  pending: "Pending", in_progress: "In Progress", submitted: "Submitted", rework: "Rework",
};
const ROLE_LABEL: Record<string, string> = {
  qa_head: "QA Head",
  qc_lab_director: "QC Lab Director",
  regulatory_affairs: "Regulatory Affairs",
  customer_admin: "Administrator",
  csv_val_lead: "CSV Validation Lead",
  operations_head: "Operations Head",
  it_cdo: "IT / CDO",
  viewer: "Viewer",
};

function overdueDays(dueIso: string, status: string): number | null {
  if (status === "complete" || status === "skipped") return null;
  const d = dayjs.utc(dueIso);
  if (d.isAfter(dayjs())) return null;
  return dayjs().diff(d, "day");
}

// Statuses that still need the assignee's attention — shared by CAPA action
// items and deviation tasks ("submitted"/"complete"/"skipped" are done-by-worker,
// so they don't count as open / due-soon / overdue).
const ACTIONABLE_STATUSES = new Set(["pending", "in_progress", "rework"]);
function isOverdueEntry(status: string, dueIso: string | null): boolean {
  if (!ACTIONABLE_STATUSES.has(status) || !dueIso) return false;
  return dayjs.utc(dueIso).isBefore(dayjs());
}
function isDueSoonEntry(status: string, dueIso: string | null): boolean {
  if (!ACTIONABLE_STATUSES.has(status) || !dueIso) return false;
  const d = dayjs.utc(dueIso);
  return d.isAfter(dayjs()) && d.isBefore(dayjs().add(7, "day"));
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
  const capaCan = usePermissions("capa");
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  const isViewer = currentUserRole === "viewer";
  const canWrite = !isViewer;

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // Stage 4 (deviation redesign) — open low-priority deviation-task panel.
  const [selectedDevTaskId, setSelectedDevTaskId] = useState<string | null>(null);
  // Gap Step 3 — open the assigned-finding work panel.
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [busyCapa, setBusyCapa] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // View + filters (component state only — not persisted).
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState(""); // CAPA risk = priority proxy
  const [dueByFilter, setDueByFilter] = useState("");
  // Quick filter driven by the clickable summary cards (toggle on/off).
  const [quickFilter, setQuickFilter] = useState<"" | "open" | "rework" | "dueSoon" | "overdue">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (capaId: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(capaId)) n.delete(capaId); else n.add(capaId); return n; });
  const toggleQuick = (q: typeof quickFilter) => setQuickFilter((prev) => (prev === q ? "" : q));

  const anyFilter = !!(searchQuery || statusFilter || priorityFilter || dueByFilter || quickFilter);
  const clearFilters = () => { setSearchQuery(""); setStatusFilter(""); setPriorityFilter(""); setDueByFilter(""); setQuickFilter(""); };
  const itemMatchesQuick = (item: WorklistItem): boolean => {
    switch (quickFilter) {
      case "open": return item.status === "pending" || item.status === "in_progress";
      case "rework": return item.status === "rework";
      case "dueSoon": {
        const d = dayjs.utc(item.dueDate);
        return (item.status === "pending" || item.status === "in_progress" || item.status === "rework") && d.isAfter(dayjs()) && d.isBefore(dayjs().add(7, "day"));
      }
      case "overdue": return overdueDays(item.dueDate, item.status) !== null;
      default: return true;
    }
  };
  const matchesFilters = (item: WorklistItem, group: WorklistGroup): boolean => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (dueByFilter && dayjs.utc(item.dueDate).isAfter(dayjs.utc(dueByFilter).endOf("day"))) return false;
    if (!itemMatchesQuick(item)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inItem = item.description.toLowerCase().includes(q);
      const inCapa = (group.capa.reference ?? "").toLowerCase().includes(q) || group.capa.title.toLowerCase().includes(q);
      if (!inItem && !inCapa) return false;
    }
    return true;
  };
  // Deviation-task filter — mirrors matchesFilters/itemMatchesQuick so the
  // search box, the status/priority/dueBy dropdowns, and the quick-filters all
  // reach the deviation-tasks section too (it's no longer an unfiltered island).
  const devTaskMatchesQuick = (t: WorklistDeviationTask): boolean => {
    switch (quickFilter) {
      case "open": return t.status === "pending" || t.status === "in_progress";
      case "rework": return t.status === "rework";
      case "dueSoon": return isDueSoonEntry(t.status, t.dueDate);
      case "overdue": return isOverdueEntry(t.status, t.dueDate);
      default: return true;
    }
  };
  const devTaskMatches = (t: WorklistDeviationTask): boolean => {
    // Deviation tasks are always Low priority; the priority dropdown filters on that.
    if (priorityFilter && (t.context.priority ?? "") !== priorityFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (dueByFilter && t.dueDate && dayjs.utc(t.dueDate).isAfter(dayjs.utc(dueByFilter).endOf("day"))) return false;
    if (!devTaskMatchesQuick(t)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hit = t.message.toLowerCase().includes(q)
        || t.deviationTitle.toLowerCase().includes(q)
        || (t.deviationReference ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  };

  // Gap finding filter — mirrors devTaskMatches so the search box, the
  // status/priority/dueBy dropdowns, and the quick-filters all reach the gap
  // findings section too (not an island). The PRIORITY dropdown filters findings
  // by SEVERITY (same Critical/High/Medium/Low value set); the STATUS dropdown
  // maps pending→Open, in_progress→In Progress (findings have no rework yet).
  const findingActionStatus = (f: WorklistFinding): string => {
    switch (f.status) {
      case "In Progress": return "in_progress";
      case "Submitted": return "submitted"; // awaiting QA — not actionable/open
      case "Rework": return "rework";
      default: return "pending"; // Open
    }
  };
  const findingMatchesQuick = (f: WorklistFinding): boolean => {
    switch (quickFilter) {
      case "open": return f.status === "Open" || f.status === "In Progress";
      case "rework": return f.status === "Rework";
      case "dueSoon": return isDueSoonEntry(findingActionStatus(f), f.targetDate);
      case "overdue": return isOverdueEntry(findingActionStatus(f), f.targetDate);
      default: return true;
    }
  };
  const findingMatches = (f: WorklistFinding): boolean => {
    if (priorityFilter && f.severity !== priorityFilter) return false;
    if (statusFilter) {
      const wanted = statusFilter === "in_progress" ? "In Progress" : statusFilter === "pending" ? "Open" : statusFilter === "rework" ? "Rework" : null;
      if (wanted === null || f.status !== wanted) return false;
    }
    if (dueByFilter && f.targetDate && dayjs.utc(f.targetDate).isAfter(dayjs.utc(dueByFilter).endOf("day"))) return false;
    if (!findingMatchesQuick(f)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hit = f.requirement.toLowerCase().includes(q)
        || (f.reference ?? "").toLowerCase().includes(q)
        || (f.framework ?? "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  };

  // Summary counts — SINGLE SOURCE OF TRUTH: all four derive from ONE combined
  // set (CAPA action items + deviation tasks + gap findings), over the full
  // worklist (pre-filter), so the cards always agree and include every source.
  const allItems = worklist.groups.flatMap((g) => g.items);
  const countEntries: { status: string; dueDate: string | null }[] = [
    ...allItems.map((i) => ({ status: i.status, dueDate: i.dueDate })),
    ...worklist.deviationTasks.map((t) => ({ status: t.status, dueDate: t.dueDate })),
    // Findings map to the action-status vocabulary so they count as open +
    // due-soon/overdue (by targetDate), and never as rework.
    ...worklist.assignedFindings.map((f) => ({ status: findingActionStatus(f), dueDate: f.targetDate })),
  ];
  const openCount = countEntries.filter((e) => ACTIONABLE_STATUSES.has(e.status)).length;
  const reworkCount = countEntries.filter((e) => e.status === "rework").length;
  const dueSoonCount = countEntries.filter((e) => isDueSoonEntry(e.status, e.dueDate)).length;
  const overdueCount = countEntries.filter((e) => isOverdueEntry(e.status, e.dueDate)).length;

  // Rework + visible deviation tasks (filter-aware, mirroring the CAPA side).
  const reworkItems: { item: WorklistItem; group: WorklistGroup }[] = worklist.groups.flatMap((g) =>
    (priorityFilter && g.capa.risk !== priorityFilter ? [] : g.items)
      .filter((i) => i.status === "rework" && matchesFilters(i, g))
      .map((item) => ({ item, group: g })),
  );
  // Deviation rework tasks join the "Needs rework" section (CAPA rework already
  // shows in both that section AND its group, so this mirrors that).
  const reworkDevTasks = worklist.deviationTasks.filter((t) => t.status === "rework" && devTaskMatches(t));
  const reworkTotal = reworkItems.length + reworkDevTasks.length;
  // Deviation-tasks section respects the active search + filters.
  const visibleDevTasks = worklist.deviationTasks.filter(devTaskMatches);
  // Gap-findings section respects the active search + filters too.
  const visibleFindings = worklist.assignedFindings.filter(findingMatches);

  async function handleSubmit(capaId: string) {
    setBusyCapa(capaId);
    const res = await submitForReview(capaId);
    setBusyCapa(null);
    if (!res.success) { setBanner(res.error || "Submit failed"); return; }
    setBanner("Submitted for QA review.");
    router.refresh();
  }


  return (
    <div className="capa-shell min-h-full">
    <div className="p-6">
      {/* ── Title section ── */}
      <div className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>My Worklist</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {currentUserName} · {ROLE_LABEL[currentUserRole] ?? currentUserRole}
          {isViewer && " · read-only"}
          {(openCount > 0 || reworkCount > 0) && (
            <span style={{ color: "var(--text-muted)" }}>
              {" "}· {openCount} open
              {reworkCount > 0 && <> · <span style={{ color: "var(--status-blocked)" }}>{reworkCount} need rework</span></>}
            </span>
          )}
        </p>
      </div>

      {/* ── Status summary cards — clickable filters (toggle) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Open tasks" value={openCount} tone="active" icon={ListChecks} active={quickFilter === "open"} onClick={() => toggleQuick("open")} />
        <SummaryCard label="Needs rework" value={reworkCount} tone="waiting" icon={Wrench} active={quickFilter === "rework"} onClick={() => toggleQuick("rework")} />
        <SummaryCard label="Due soon (7d)" value={dueSoonCount} tone="info" icon={CalendarClock} active={quickFilter === "dueSoon"} onClick={() => toggleQuick("dueSoon")} />
        <SummaryCard label="Overdue" value={overdueCount} tone="blocked" icon={Clock} active={quickFilter === "overdue"} onClick={() => toggleQuick("overdue")} />
      </div>

      {/* ── Controls: search + filters + view toggle ── */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input
            type="search"
            className="input text-[12px] pl-8"
            placeholder="Search CAPA or task…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search worklist"
            style={{ width: 220 }}
          />
        </div>
        <Dropdown
          placeholder="All statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          width="w-40"
          options={[
            { value: "", label: "All statuses" },
            { value: "rework", label: "Rework" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In Progress" },
            { value: "complete", label: "Complete" },
            { value: "skipped", label: "Skipped" },
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
        <div className="inline-flex rounded-lg border overflow-hidden ml-auto" style={{ borderColor: "var(--card-border)" }} role="group" aria-label="View mode">
          {(["list", "grid"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              aria-pressed={viewMode === m}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border-none cursor-pointer"
              style={{
                background: viewMode === m ? "var(--brand-muted)" : "transparent",
                color: viewMode === m ? "var(--brand)" : "var(--text-secondary)",
              }}
            >
              {m === "list" ? <List className="w-3.5 h-3.5" aria-hidden="true" /> : <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />}
              {m === "list" ? "List" : "Grid"}
            </button>
          ))}
        </div>
        {anyFilter && (
          <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>
        )}
      </div>

      {banner && (
        <div role="status" className="alert alert-info mb-4 flex items-center justify-between">
          <span className="text-[12px]">{banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-[11px] underline bg-transparent border-none cursor-pointer">Dismiss</button>
        </div>
      )}

      {worklist.groups.length === 0 && worklist.deviationTasks.length === 0 && worklist.assignedFindings.length === 0 && (
        <div className="card p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Nothing assigned to you right now.</p>
        </div>
      )}

      {/* ── NEEDS REWORK (across all CAPAs + deviation tasks) ── */}
      {reworkTotal > 0 && (
        <section className="mb-6" aria-labelledby="rework-heading">
          <h2 id="rework-heading" className="text-[12px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--status-blocked)" }}>
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Needs rework ({reworkTotal})
          </h2>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--status-blocked)" }}>
            {reworkItems.map(({ item, group }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedTaskId(item.id)}
                className="w-full text-left flex items-start gap-3 p-3 border-none cursor-pointer"
                style={{ background: "var(--status-blocked-bg)", borderBottom: "1px solid var(--bg-border)" }}
              >
                <Wrench className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--status-blocked)" }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.description}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {group.capa.reference ?? group.capa.id.slice(0, 8)} · due {dayjs.utc(item.dueDate).format(dateFormat)}
                  </p>
                  {item.reworkReason && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--status-blocked)" }}>Returned: {item.reworkReason}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              </button>
            ))}
            {/* Deviation tasks returned for rework — open the deviation-task panel. */}
            {reworkDevTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedDevTaskId(t.id)}
                className="w-full text-left flex items-start gap-3 p-3 border-none cursor-pointer"
                style={{ background: "var(--status-blocked-bg)", borderBottom: "1px solid var(--bg-border)" }}
              >
                <Wrench className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--status-blocked)" }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{t.deviationTitle}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {t.deviationReference ?? t.deviationId.slice(0, 8)} · deviation task{t.dueDate ? ` · due ${dayjs.utc(t.dueDate).format(dateFormat)}` : ""}
                  </p>
                  {t.reworkReason && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--status-blocked)" }}>Returned: {t.reworkReason}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Per-CAPA cards (expandable, collapsed by default) ── */}
      {worklist.groups.map((group) => {
        const openItems = group.items.filter((i) => (i.status === "pending" || i.status === "in_progress") && matchesFilters(i, group));
        const doneItems = group.items.filter((i) => (i.status === "complete" || i.status === "skipped") && matchesFilters(i, group));
        const reworkInGroup = group.items.filter((i) => i.status === "rework" && matchesFilters(i, group));
        const hasMatches = openItems.length > 0 || doneItems.length > 0 || reworkInGroup.length > 0;
        // Priority (CAPA risk) is a group-level filter.
        if (priorityFilter && group.capa.risk !== priorityFilter) return null;
        // When filtering, hide groups with no matching items unless the viewer
        // drives the CAPA (keep the driver cockpit visible).
        if (anyFilter && !group.capa.isAssignee && !hasMatches) return null;
        const r = group.readiness;
        const taskCount = openItems.length + reworkInGroup.length;
        // Collapsed by default; auto-open while a filter is active so matches show.
        const isOpen = expanded.has(group.capa.id) || anyFilter;
        const readinessPct = r ? Math.round((r.metCount / Math.max(1, r.total)) * 100) : 0;
        return (
          <section
            key={group.capa.id}
            className="mb-3 rounded-xl overflow-hidden"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))" }}
          >
            {/* Card header (always visible) */}
            <div className="p-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(group.capa.id)}
                  aria-expanded={isOpen}
                  className="flex-1 text-left bg-transparent border-none cursor-pointer p-0 min-w-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] font-bold px-2 py-0.5 rounded-md" style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}>
                      {group.capa.reference ?? group.capa.id.slice(0, 8)}
                    </span>
                    <Badge variant={getSeverityVariant(group.capa.risk, "generic")}>{group.capa.risk}</Badge>
                    {group.capa.isAssignee && <Badge variant="blue">Assigned to you</Badge>}
                    {taskCount > 0 && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{taskCount} open task{taskCount === 1 ? "" : "s"}</span>}
                  </div>
                  <p className="text-[13px] font-semibold mt-1 truncate" style={{ color: "var(--text-primary)" }}>{group.capa.title}</p>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {group.capa.isAssignee && canWrite && (
                    <Button
                      variant="primary"
                      size="xs"
                      icon={Send}
                      disabled={!r?.allMet || busyCapa === group.capa.id}
                      loading={busyCapa === group.capa.id}
                      onClick={() => void handleSubmit(group.capa.id)}
                      title={r?.allMet ? "Submit for QA review" : "Resolve all readiness conditions first"}
                    >
                      Submit
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleExpand(group.capa.id)}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    className="p-1 bg-transparent border-none cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Readiness progress bar (driver) — bar on the card; conditions on expand */}
              {group.capa.isAssignee && r && (
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span style={{ color: "var(--text-muted)" }}>Readiness</span>
                    <span style={{ color: r.allMet ? "var(--status-done)" : "var(--text-secondary)" }}>{readinessPct}% · {r.metCount} of {r.total} conditions</span>
                  </div>
                  <ProgressBar met={r.metCount} total={r.total} tone={r.allMet ? "done" : "waiting"} aria-label="CAPA readiness" />
                </div>
              )}
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
                {/* Assignee: readiness conditions + the evidence panel in
                    assignee mode (upload-with-category + propose-N/A; QA reviews
                    and marks complete / rejects per category over on /capa). The
                    panel self-loads and auto-seeds the 7 categories. */}
                {group.capa.isAssignee && (
                  <div className="mt-3 space-y-3">
                    {r && !r.allMet && (
                      <ul className="list-none p-0 m-0 space-y-1">
                        {r.conditions.map((c) => (
                          <li key={c.key} className="flex items-start gap-1.5 text-[11px]">
                            {c.met
                              ? <CheckCircle2 className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--status-done)" }} aria-hidden="true" />
                              : <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: "var(--status-waiting)" }} aria-hidden="true" />}
                            <span style={{ color: c.met ? "var(--text-muted)" : "var(--text-secondary)" }}>
                              {c.label}{!c.met && c.detail ? ` — ${c.detail}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canWrite && (
                      <EvidenceCollectionPanel capaId={group.capa.id} capaStatus={group.capa.status} assigneeMode />
                    )}
                  </div>
                )}

                {/* Rows — rework first, then open. List = rows; grid = cards. */}
                <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3" : "mt-2"}>
                  {reworkInGroup.map((item) => (
                    <Row key={item.id} item={item} grid={viewMode === "grid"} onOpen={() => setSelectedTaskId(item.id)} />
                  ))}
                  {openItems.map((item) => (
                    <Row key={item.id} item={item} grid={viewMode === "grid"} onOpen={() => setSelectedTaskId(item.id)} />
                  ))}
                  {group.items.length === 0 && (
                    <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No action items assigned to you on this CAPA.</p>
                  )}
                </div>

                {doneItems.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}>{doneItems.length} done / awaiting</summary>
                    <div className="mt-1">
                      {doneItems.map((item) => (
                        <Row key={item.id} item={item} onOpen={() => setSelectedTaskId(item.id)} muted />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Stage 4 (deviation redesign) — low-priority deviation tasks assigned
          to the user (UNION source alongside the CAPA groups above). Now
          filter-aware: hidden when the active search/filters exclude them all. */}
      {visibleDevTasks.length > 0 && (
        <section className="mb-3 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <ListChecks className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Deviation tasks ({visibleDevTasks.length})</h2>
          </div>
          <div>
            {visibleDevTasks.map((t) => (
              <button key={t.id} type="button" onClick={() => setSelectedDevTaskId(t.id)} className="w-full text-left flex items-center gap-3 p-3 border-none cursor-pointer bg-transparent hover:bg-(--bg-hover)" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{t.deviationReference ?? t.deviationId.slice(0, 8)} · {t.deviationTitle}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{t.message}</p>
                </div>
                {t.dueDate && <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(t.dueDate).format("DD MMM")}</span>}
                <Badge variant={t.status === "submitted" ? "purple" : t.status === "rework" ? "red" : "amber"}>{DEV_TASK_ROW_LABEL[t.status] ?? t.status}</Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Gap Step 2 — gap-assessment findings assigned to the user (UNION source).
          Read-only surface for now; the worker panel (docs, rework thread) comes
          in later steps. Filter-aware, mirroring the deviation-tasks section. */}
      {visibleFindings.length > 0 && (
        <section className="mb-3 rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--card-border)" }}>
            <ClipboardList className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Gap findings ({visibleFindings.length})</h2>
          </div>
          <div>
            {visibleFindings.map((f) => (
              <button key={f.id} type="button" onClick={() => setSelectedFindingId(f.id)} className="w-full text-left flex items-center gap-3 p-3 border-none cursor-pointer bg-transparent hover:bg-(--bg-hover)" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {f.reference ?? f.id.slice(0, 8)} · {f.requirement}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                    {[f.framework, f.area].filter(Boolean).join(" · ")}
                    {f.targetDate ? ` · target ${dayjs.utc(f.targetDate).format(dateFormat)}` : ""}
                  </p>
                </div>
                <Badge variant={getSeverityVariant(f.severity, "generic")}>{f.severity}</Badge>
                <Badge variant={f.status === "Submitted" ? "purple" : f.status === "Rework" ? "red" : f.status === "In Progress" ? "amber" : "blue"}>{f.status}</Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Task panel */}
      {selectedTaskId && (
        <TaskPanel
          actionItemId={selectedTaskId}
          currentUserId={currentUserId}
          isAuthor={capaCan.canEdit}
          isViewer={isViewer}
          onClose={() => setSelectedTaskId(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* Deviation task panel (assignee: start / upload / submit) */}
      {selectedDevTaskId && (() => {
        const t = worklist.deviationTasks.find((d) => d.id === selectedDevTaskId);
        return t ? (
          <DeviationTaskPanel task={t} onClose={() => setSelectedDevTaskId(null)} onChanged={() => router.refresh()} />
        ) : null;
      })()}

      {/* Gap Step 3 — assigned-finding work panel (categorized doc upload + notes). */}
      {selectedFindingId && (() => {
        const f = worklist.assignedFindings.find((x) => x.id === selectedFindingId);
        return f ? (
          <FindingWorkPanel finding={f} onClose={() => setSelectedFindingId(null)} onChanged={() => router.refresh()} />
        ) : null;
      })()}

    </div>
    </div>
  );
}

const SUMMARY_TONE: Record<string, string> = {
  active: "var(--status-active)", // blue — Open
  waiting: "var(--status-waiting)", // orange/amber — Rework
  info: "var(--info)", // teal — Due soon (no purple token; teal is the distinct accent)
  blocked: "var(--status-blocked)", // red — Overdue
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
      {/* active indicator bar */}
      <div className="mt-1.5 h-0.5 rounded-full" style={{ width: active ? "100%" : "0%", background: color, transition: "width .2s" }} />
    </button>
  );
}

function Row({ item, onOpen, muted, grid }: { item: WorklistItem; onOpen: () => void; muted?: boolean; grid?: boolean }) {
  const od = overdueDays(item.dueDate, item.status);
  const dateFormat = useTenantConfig().org.dateFormat;
  const due = (
    <span style={{ color: od !== null ? "var(--status-blocked)" : "var(--text-muted)" }}>
      Due {dayjs.utc(item.dueDate).format(dateFormat)}{od !== null && ` · Overdue ${od}d`}
    </span>
  );
  const pill = <StatusPill token={ACTION_STATUS_TOKEN[item.status] ?? "pending"}>{ITEM_STATUS_LABEL[item.status] ?? item.status}</StatusPill>;

  if (grid) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-left flex flex-col gap-2 p-3 rounded-lg border cursor-pointer bg-transparent hover:bg-(--bg-hover)"
        style={{ borderColor: "var(--card-border)", opacity: muted ? 0.6 : 1 }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.description}</p>
          {pill}
        </div>
        <p className="text-[11px]">{due}</p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 border-none cursor-pointer bg-transparent hover:bg-(--bg-hover)"
      style={{ borderBottom: "1px solid var(--bg-border)", opacity: muted ? 0.6 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate" style={{ color: "var(--text-primary)" }}>{item.description}</p>
        <p className="text-[11px]">{due}</p>
      </div>
      {pill}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
    </button>
  );
}
