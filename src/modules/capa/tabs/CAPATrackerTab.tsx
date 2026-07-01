import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/hooks/useAppSelector";
import { ClipboardCheck, Plus, Search, ChevronRight, Link2, CheckCircle2, Sparkles, RotateCcw, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA, CAPARisk } from "@/store/capa.slice";
import { isOverdue, STATUS_LABEL, type CAPAStatus } from "@/types/capa";
import type { AuthUser } from "@/store/auth.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { displayUserName, displaySiteName } from "@/lib/identity-display";
import { usePermissions } from "@/hooks/usePermissions";
import { StatusPill, CAPA_STATUS_TOKEN } from "../lib/statusTokens";

/* ── Helpers ── */
const SOURCE_LABEL: Record<string, string> = { "483": "FDA 483 Observation", "Gap Assessment": "Gap Assessment Finding", Deviation: "Deviation Report", "Internal Audit": "Internal Audit", Complaint: "Complaint", OOS: "OOS", "Change Control": "Change Control" };
function sourceLabel(s: string) { return SOURCE_LABEL[s] ?? s; }
function riskBadge(r: CAPARisk) { return <Badge variant={getSeverityVariant(r, "generic")}>{normalizeSeverityForDisplay(r, "generic") ?? r}</Badge>; }
// Phase C — status rendered as a semantic token pill (never brand gold).
function capaStatusBadge(s: CAPAStatus) { return <StatusPill token={CAPA_STATUS_TOKEN[s]}>{STATUS_LABEL[s]}</StatusPill>; }
function ownerName(uid: string, users: UserConfig[]) { return displayUserName(uid, users); }

interface SiteOption {
  id: string;
  name: string;
}

interface CAPATrackerTabProps {
  capas: CAPA[];
  filteredCAPAs: CAPA[];
  selectedCAPA: CAPA | null;
  onSelectCAPA: (c: CAPA | null) => void;
  isDark: boolean;
  isViewOnly: boolean;
  users: UserConfig[];
  user: AuthUser | null;
  sites: SiteOption[];
  timezone: string;
  dateFormat: string;
  onAddOpen: () => void;
  /** AI CAPA modal trigger — optional. CAPAPage passes this only when
   *  the current user is allowed to use AI CAPA generation. */
  onAiOpen?: () => void;
  /** RUNG 3D-CAPA — reopen a closed/rejected CAPA. Passed only when the
   *  current user may reopen (QA Head / admin); undefined hides the control. */
  onReopen?: (id: string) => void;
  onNavigateCapa: () => void;
  /** Phase 6 — detail moved to /capa/[id]; these are no longer consumed by the
   *  tracker (kept optional so any stale caller stays type-safe). */
  onEditOpen?: () => void;
  onSignOpen?: (override?: { reason: string }) => void;
  onSubmitForReview?: (id: string) => void;
  onNavigateGap?: (findingId: string) => void;
  /** Phase 6 — closed CAPAs whose 90-day effectiveness check is due. */
  effectivenessDue?: {
    id: string;
    reference: string | null;
    description: string;
    risk: string;
    effectivenessDate: string | null;
  }[];
}

/** An action item is overdue when its due date has passed and it isn't
 *  complete/skipped. CAPA rows carry actionItems from getCAPAs. */
function hasOverdueActionItem(c: CAPA): boolean {
  return (c.actionItems ?? []).some(
    (a) => a.status !== "complete" && a.status !== "skipped" && dayjs.utc(a.dueDate).isBefore(dayjs()),
  );
}
function hasReworkItem(c: CAPA): boolean {
  return (c.actionItems ?? []).some((a) => a.status === "rework");
}

export function CAPATrackerTab({
  capas, filteredCAPAs, selectedCAPA, onSelectCAPA,
  isDark, isViewOnly, users, user, sites, timezone, dateFormat,
  onAddOpen, onReopen,
  onNavigateCapa, effectivenessDue = [],
}: CAPATrackerTabProps) {
  // Phase A — onAiOpen intentionally not consumed (AI CAPA hidden in Phase 1);
  // kept optional on the interface so CAPAPage's call site is unchanged.
  // Phase 6 — onEditOpen/onSignOpen/onSubmitForReview/onNavigateGap are no
  // longer consumed here (detail moved to /capa/[id]); kept on the interface
  // so CAPAPage's call site is unchanged.
  const router = useRouter();
  // Capability mirror of the server (excludes super_admin from authoring).
  const capaCan = usePermissions("capa");
  const [assignedFilter, setAssignedFilter] = useState("");
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const showSiteColumn = !selectedSiteId && sites.length > 1;
  const siteName = (id: string) => displaySiteName(id, sites);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const anyFilterActive = !!(search || siteFilter || statusFilter || riskFilter || sourceFilter || assignedFilter);
  function clearFilters() { setSearch(""); setSiteFilter(""); setStatusFilter(""); setRiskFilter(""); setSourceFilter(""); setAssignedFilter(""); }

  // Phase 6 — distinct CAPA owners (drivers) for the "assigned" filter dropdown.
  const assignedOptions = Array.from(new Set(capas.map((c) => c.owner).filter(Boolean)))
    .map((uid) => ({ value: uid, label: ownerName(uid, users) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  /* ── Phase 6 queues (role-aware) ── */
  const canApprove = capaCan.canApprove; // qa_head (+reg for Critical) — also verifier-eligible
  const myId = user?.id;
  // WAITING ON YOU: approver/verifier roles see review/verification queues;
  // everyone sees CAPAs they drive that carry rework items. (The "ready to
  // submit / allMet" sub-bullet is computed on the detail page where the
  // readiness inputs are loaded — not duplicated here.)
  const waitingPendingReview = canApprove ? capas.filter((c) => c.status === "pending_qa_review") : [];
  const waitingRework = capas.filter((c) => c.status === "in_progress" && hasReworkItem(c) && (c.owner === myId || capaCan.canEdit));
  const waitingOnYou = [
    ...waitingPendingReview.map((c) => ({ c, why: "Awaiting your QA review" })),
    ...waitingRework.map((c) => ({ c, why: "Has items in rework" })),
  ];
  // OVERDUE: CAPA past due, or any of its action items overdue.
  const overdueQueue = capas.filter((c) => c.status !== "closed" && (isOverdue(c) || hasOverdueActionItem(c)));

  // Defense-in-depth: dedupe by id alongside the filter pass. The slice's
  // addCAPA reducer already upserts on id (see capa.slice.ts), so dupes
  // shouldn't reach here — but per the AI integration spec a table-level
  // Set guard is mandated as a belt-and-braces against any future regression.
  const seenIds = new Set<string>();
  const displayed = filteredCAPAs.filter((c) => {
    if (siteFilter && c.siteId !== siteFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (riskFilter && c.risk !== riskFilter) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (assignedFilter && c.owner !== assignedFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      // Match against the human-readable reference first (what users see),
      // the raw cuid (for copy-paste from logs), and the description.
      const referenceMatch = c.reference?.toLowerCase().includes(q) ?? false;
      const idMatch = c.id.toLowerCase().includes(q);
      const descriptionMatch = c.description.toLowerCase().includes(q);
      if (!referenceMatch && !idMatch && !descriptionMatch) return false;
    }
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  const go = (id: string) => router.push(`/capa/${id}`);

  return (
    <div role="tabpanel" id="panel-tracker" aria-labelledby="tab-tracker" tabIndex={0}>
      {/* ── Queues (always shown, each with its own empty state) ── */}
      <div className="grid gap-3 mb-5 md:grid-cols-3">
        <QueueCard title="Waiting on you" Icon={Clock} tone="waiting" count={waitingOnYou.length} emptyText="Nothing waiting on you.">
          {waitingOnYou.slice(0, 6).map(({ c, why }) => (
            <QueueRow key={`w-${c.id}-${why}`} label={c.reference ?? c.id.slice(0, 8)} sub={why} onClick={() => go(c.id)} />
          ))}
        </QueueCard>
        <QueueCard title="Effectiveness checks due" Icon={TrendingUp} tone="active" count={effectivenessDue.length} emptyText="No effectiveness checks due.">
          {effectivenessDue.slice(0, 6).map((e) => (
            <QueueRow key={e.id} label={e.reference ?? e.id.slice(0, 8)}
              sub={`Due ${e.effectivenessDate ? dayjs.utc(e.effectivenessDate).tz(timezone).format("DD MMM") : "—"}`}
              onClick={() => go(e.id)} />
          ))}
        </QueueCard>
        <QueueCard title="Overdue" Icon={AlertTriangle} tone="blocked" count={overdueQueue.length} emptyText="Nothing overdue.">
          {overdueQueue.slice(0, 6).map((c) => (
            <QueueRow key={c.id} label={c.reference ?? c.id.slice(0, 8)}
              sub={isOverdue(c) ? "CAPA past due" : "Action item overdue"} onClick={() => go(c.id)} />
          ))}
        </QueueCard>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search CAPAs…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search CAPAs" />
        </div>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-40" options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, { value: "open", label: STATUS_LABEL.open }, { value: "in_progress", label: STATUS_LABEL.in_progress }, { value: "pending_qa_review", label: STATUS_LABEL.pending_qa_review }, { value: "closed", label: STATUS_LABEL.closed }]} />
        <Dropdown placeholder="All risks" value={riskFilter} onChange={setRiskFilter} width="w-32" options={[{ value: "", label: "All risks" }, { value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />
        <Dropdown placeholder="All sources" value={sourceFilter} onChange={setSourceFilter} width="w-40" options={[{ value: "", label: "All sources" }, { value: "483", label: "483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />
        <Dropdown placeholder="Anyone assigned" value={assignedFilter} onChange={setAssignedFilter} width="w-44" options={[{ value: "", label: "Anyone assigned" }, ...assignedOptions]} />
        {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        {/* Phase A — duplicate "New CAPA" removed (the top-right header button is
            the single create entry); "AI CAPA" hidden (no AI agents in Phase 1). */}
      </div>

      {/* Table — always full width (Phase D: framed in a card) */}
      <div className="capa-card overflow-x-auto" style={{ padding: 0 }}>
        {displayed.length === 0 ? (
          <div className="card p-8 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            {capas.length === 0 ? (
              <>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No CAPAs raised yet</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>CAPAs are raised from Gap Assessment findings, or you can create one manually.</p>
                <div className="flex gap-3 justify-center mt-3">
                  {!isViewOnly && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Create CAPA</Button>}
                  <Button variant="ghost" onClick={onNavigateCapa}>Go to Gap Assessment</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No CAPAs match the current filters</p>
                {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2">Clear filters</Button>}
              </>
            )}
          </div>
        ) : (
          <DataTable
            ariaLabel="CAPA register"
            caption="Corrective and preventive actions with RCA, status and closure tracking"
            data={displayed}
            rowKey={(c) => c.id}
            onRowClick={(c) => { onSelectCAPA(c); go(c.id); }}
            rowClassName={() => "cursor-pointer transition-colors hover:bg-(--bg-hover)"}
            rowStyle={(c) => selectedCAPA?.id === c.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}
            columns={[
              {
                key: "reference",
                header: "Reference",
                render: (c) => {
                  // Mirrors the CAPA detail page: prefer the per-tenant reference;
                  // fall back to a stable legacy label rather than exposing the
                  // raw cuid, which carries no domain meaning. The cuid stays
                  // available on hover (title) for support / log lookups.
                  const referenceDisplay = c.reference ?? `CAPA-LEGACY-${c.id.slice(0, 8)}`;
                  return (
                    <>
                      <div
                        className="font-mono text-[11px] font-semibold"
                        style={{ color: "var(--text-primary)" }}
                        title={c.id}
                      >
                        {referenceDisplay}
                      </div>
                      {/* Readable source reference (gap / deviation), not the raw cuid. */}
                      {(c.findingId || c.deviation) && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Link2 className="w-3 h-3" style={{ color: "var(--brand)" }} aria-hidden="true" />
                          <span className="text-[10px]" style={{ color: "var(--brand)" }}>
                            {c.findingId ? (c.finding?.reference ?? c.findingId) : (c.deviation?.reference ?? "Deviation")}
                          </span>
                        </div>
                      )}
                    </>
                  );
                },
              },
              {
                key: "site",
                header: "Site",
                hidden: !showSiteColumn,
                cellClassName: "text-[12px] whitespace-nowrap text-(--text-secondary)",
                render: (c) => siteName(c.siteId),
              },
              { key: "source", header: "Source", render: (c) => <Badge variant="gray">{sourceLabel(c.source)}</Badge> },
              { key: "title", header: "Title", render: (c) => <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }}>{c.title}</span> },
              { key: "risk", header: "Risk", render: (c) => riskBadge(c.risk) },
              {
                key: "status",
                header: "Status",
                render: (c) => (
                  <>
                    {capaStatusBadge(c.status)}
                    {/* Phase 4 — hint that an in-progress CAPA was bounced back
                        by QA and has action items awaiting rework. */}
                    {c.status === "in_progress" && (c.actionItems ?? []).some((a) => a.status === "rework") && (
                      <StatusPill token="blocked">Rework</StatusPill>
                    )}
                  </>
                ),
              },
              {
                key: "owner",
                header: "Owner",
                cellClassName: "text-[12px] whitespace-nowrap text-(--text-secondary)",
                render: (c) => ownerName(c.owner, users),
              },
              {
                key: "due",
                header: "Due date",
                cellClassName: "whitespace-nowrap",
                render: (c) => (
                  <>
                    <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(c.dueDate).tz(timezone).format(dateFormat)}</div>
                    {isOverdue(c) && <div className="text-[10px] font-medium" style={{ color: "var(--status-blocked)" }}>Overdue</div>}
                  </>
                ),
              },
              {
                key: "effectiveness",
                header: "Effectiveness",
                render: (c) => c.effectivenessCheck ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--status-done)" }} aria-label="Effectiveness check planned" /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>,
              },
              {
                key: "open",
                header: "Open",
                srOnly: true,
                render: (c) => {
                  const referenceDisplay = c.reference ?? `CAPA-LEGACY-${c.id.slice(0, 8)}`;
                  return (
                    <div className="flex items-center justify-end gap-1">
                      {/* AI Lifecycle — opens /ai-capa/<reference> in the
                          AI-managed lifecycle dashboard. stopPropagation so
                          the row's onClick (which opens the detail modal)
                          doesn't fire as well. The button is shown for every
                          row; if the CAPA isn't AI-tracked the lifecycle page
                          surfaces an empty-state for the missing record. */}
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={Sparkles}
                        aria-label={`Open ${referenceDisplay} in AI lifecycle`}
                        title="Open AI lifecycle"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/ai-capa/${encodeURIComponent(c.reference ?? c.id)}`);
                        }}
                      />
                      {onReopen && (c.status === "closed" || c.status === "rejected") && (
                        <Button variant="ghost" size="xs" icon={RotateCcw} aria-label={`Reopen ${referenceDisplay}`} title="Reopen CAPA" onClick={(e) => { e.stopPropagation(); onReopen(c.id); }} />
                      )}
                      <Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View ${referenceDisplay} detail`} />
                    </div>
                  );
                },
              },
            ] satisfies Column<CAPA>[]}
          />
        )}
      </div>

      {/* Phase 6 — detail is now a full page at /capa/[id]; the modal is
       *  retired. Row + queue clicks navigate there. */}
    </div>
  );
}

/* ── Phase 6 queue card + row ── */
// Queue cards keep their identity via STATUS tokens (no brand gold): waiting-on-you
// → waiting (amber), effectiveness → active (blue), overdue → blocked (red). The
// tone is a subtle accent (left border + icon tint), not a heavy fill.
const QUEUE_TONE: Record<"waiting" | "active" | "blocked", { fg: string; bg: string }> = {
  waiting: { fg: "var(--status-waiting)", bg: "var(--status-waiting-bg)" },
  active: { fg: "var(--status-active)", bg: "var(--status-active-bg)" },
  blocked: { fg: "var(--status-blocked)", bg: "var(--status-blocked-bg)" },
};

function QueueCard({
  title, Icon, tone, count, emptyText, children,
}: {
  title: string;
  Icon: LucideIcon;
  tone: "waiting" | "active" | "blocked";
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  const t = QUEUE_TONE[tone];
  return (
    <section className="capa-card overflow-hidden flex flex-col" aria-label={title} style={{ padding: 0, borderLeft: `3px solid ${t.fg}` }}>
      {/* Header: icon (tinted) + title + big count */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--card-border, var(--bg-border))" }}>
        <span className="w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0" style={{ background: t.bg }}>
          <Icon className="w-4 h-4" style={{ color: t.fg }} aria-hidden="true" />
        </span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        <span className="ml-auto text-[18px] font-bold leading-none" style={{ color: count > 0 ? t.fg : "var(--text-muted)" }}>{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-[11px] px-3 py-5 text-center" style={{ color: "var(--text-muted)" }}>{emptyText}</p>
      ) : (
        <ul className="list-none p-1.5 m-0 space-y-0.5">{children}</ul>
      )}
    </section>
  );
}

function QueueRow({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md border-none cursor-pointer bg-transparent transition-colors hover:bg-(--bg-hover)"
      >
        <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border, var(--bg-border))", background: "var(--bg-elevated)" }}>{label}</span>
        <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{sub}</span>
        <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      </button>
    </li>
  );
}
