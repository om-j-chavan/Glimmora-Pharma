"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardCheck, ClipboardList, FolderOpen, Plus, Sparkles } from "lucide-react";
import type { Finding as PrismaFinding } from "@prisma/client";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { NoSitesPopup, TabBar, PlanLimitPopup, StatusGuide } from "@/components/shared";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { FINDING_STATUSES } from "@/constants/statusTaxonomy";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { SmartRecordSearch } from "@/components/search/SmartRecordSearch";
import { buildFindingSource } from "@/lib/searchSources";
import {
  setFindings,
  type Finding,
  type FindingSeverity,
} from "@/store/findings.slice";
import { adaptFinding, type FindingWithEdits } from "./GapPage.adapter";
import type { FindingAssignee } from "@/lib/queries";
import {
  createFinding as createFindingAction,
  updateFinding as updateFindingAction,
  uploadFindingEvidence as uploadFindingEvidenceAction,
} from "@/actions/findings";
import { formatReference } from "@/lib/reference";
import { createCAPA as createCAPAAction } from "@/actions/capas";
import { linkFindingToSystem as linkFindingToSystemAction } from "@/actions/systems";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popup } from "@/components/ui/Popup";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";

import { GapSummaryTab } from "./tabs/GapSummaryTab";
import { GapRegisterTab } from "./tabs/GapRegisterTab";
import { GapEvidenceTab } from "./tabs/GapEvidenceTab";
import { AddFindingModal, type FindingForm } from "./modals/AddFindingModal";
import { EvidenceLinkModal } from "./modals/EvidenceLinkModal";

/* ── Constants ── */

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];
const DOC_TYPE_MAP: Record<string, string> = {
  p210: "Record", p11: "Audit Trail", annex11: "Audit Trail",
  annex15: "Validation", ichq9: "Report", ichq10: "Report",
  gamp5: "Validation", who: "SOP", mhra: "SOP",
};
const AREA_OPTIONS = [{ value: "", label: "All areas" }, ...AREAS.map((a) => ({ value: a, label: a }))];
const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "Critical", label: "Critical", badge: "C", badgeVariant: "red" as const },
  { value: "High", label: "High", badge: "H", badgeVariant: "amber" as const },
  { value: "Medium", label: "Medium", badge: "M", badgeVariant: "amber" as const },
  { value: "Low", label: "Low", badge: "L", badgeVariant: "green" as const },
];
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Open", label: "Open" },
  { value: "In Progress", label: "In Progress" },
  // Submit → QA-review loop states (mirror FINDING_STATUSES) so a Submitted/
  // Rework finding can be filtered, not just Open/In Progress/Closed.
  { value: "Submitted", label: "Submitted" },
  { value: "Rework", label: "Rework" },
  { value: "Closed", label: "Closed" },
];

type TabId = "summary" | "register" | "evidence";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "summary", label: "Summary", Icon: BarChart3 },
  { id: "register", label: "Findings Register", Icon: ClipboardList },
  { id: "evidence", label: "Documents Index", Icon: FolderOpen },
];

/* ── Helpers ── */

function getEvidenceStatus(f: Finding): "Complete" | "Partial" | "Missing" {
  if (f.status === "Closed" && f.evidenceLink.trim().length > 0) return "Complete";
  if (f.evidenceLink.trim().length > 0) return "Partial";
  return "Missing";
}
function getAreaStatus(rows: { status: "Complete" | "Partial" | "Missing" }[]): "Complete" | "Partial" | "Missing" {
  if (rows.length === 0) return "Complete";
  if (rows.every((r) => r.status === "Complete")) return "Complete";
  if (rows.some((r) => r.status === "Missing")) return "Missing";
  return "Partial";
}

/* ══════════════════════════════════════ */

export interface GapPageProps {
  /** Server-fetched findings (Prisma rows) — seeded into Redux on mount. */
  findings?: FindingWithEdits[];
  /** Finding IDs that have an uploaded evidence document retrievable via the
   *  download route. Used by the Evidence Index to make the link clickable. */
  evidenceDocFindingIds?: string[];
  /** SERVER-SCOPED assignee pool (tenant + the assigner's own site). */
  assignees?: FindingAssignee[];
}

export function GapPage({ findings: serverFindings, evidenceDocFindingIds, assignees = [] }: GapPageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Seed Redux from server-fetched findings on mount / when props change.
  useEffect(() => {
    if (serverFindings) {
      dispatch(setFindings(serverFindings.map(adaptFinding)));
    }
  }, [serverFindings, dispatch]);
  const { isViewOnly } = useRole();
  // Capability mirror of the server author set (COMPLIANCE_AUTHOR_ROLES) —
  // includes customer_admin, excludes non-author roles. Replaces the old
  // ad-hoc canCreateFindings = !isCustomerAdmin && !isViewer (which wrongly
  // hid customer_admin).
  const gapCan = usePermissions("gap");
  const toast = useToast();
  const { hasSites } = useSetupStatus();
  const { isAtLimit, getLimit, tenantPlan } = usePlanLimits();
  const atFindingLimit = isAtLimit("findings");

  const { findings, capas, systems } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  // Effective enabled frameworks for THIS tenant — server-resolved, non-persisted
  // (replaces the old settings.frameworks booleans; see frameworks.slice).
  const frameworkList = useAppSelector((s) => s.frameworks.list);
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const authUser = useAppSelector((s) => s.auth.user);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);

  const activeFrameworks = useMemo(
    () => frameworkList.map((f) => f.key),
    [frameworkList],
  );

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [siteFilter, setSiteFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [capaRaisedPopup, setCapaRaisedPopup] = useState(false);
  const [raisedCapaId, setRaisedCapaId] = useState("");
  // Step 5 — carryover summary (converted evidence count) for the confirmation.
  const [raisedNote, setRaisedNote] = useState("");
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(AREAS));
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceFindingId, setEvidenceFindingId] = useState("");
  const [evidenceCurrentLink, setEvidenceCurrentLink] = useState("");
  const [evidenceLinkedPopup, setEvidenceLinkedPopup] = useState(false);
  const [noSitesOpen, setNoSitesOpen] = useState(false);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  // "Ask AI" slide-out — the plain-English Findings Search (was a large card
  // atop the Register tab) now lives in a Drawer opened from the header.
  const [askAiOpen, setAskAiOpen] = useState(false);

  const isAnyFilterActive = !!(siteFilter || areaFilter || frameworkFilter || severityFilter || statusFilter);
  function clearFilters() { setSiteFilter(""); setAreaFilter(""); setFrameworkFilter(""); setSeverityFilter(""); setStatusFilter(""); }

  /* ── Open from route state ── */
  useEffect(() => {
    const openId = null /*migration: location.state removed*/;
    if (openId) {
      const found = findings.find((f) => f.id === openId);
      if (found) { setActiveTab("register"); setSelectedFinding(found); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Keep the open detail in sync with the store ──
     selectedFinding is a local snapshot. When the Redux findings list updates
     (e.g. after the router.refresh() that follows accept / rework / assign), re-
     sync it from the fresh record by id so the header status badge and other
     fields stay current — no reopen needed. If the finding is gone from the store,
     close cleanly (null) instead of showing a stale ghost; a null selection (e.g.
     after close-on-raise) is a no-op, so this never resurrects a closed modal. */
  useEffect(() => {
    setSelectedFinding((prev) => (prev ? findings.find((f) => f.id === prev.id) ?? null : prev));
  }, [findings]);

  /* ── Per-tab entrance guards (Phase 3) ──
     Tab bodies are conditionally rendered, so returning to a tab REMOUNTS it and
     would replay its entrance reveal. These refs (persisting because GapPage
     stays mounted across tab switches) suppress the replay: play a tab's reveal
     on its first mount, then never again. We flip a tab's ref when the user
     LEAVES it — not on enter — so React StrictMode's dev remount can't
     prematurely mark it seen and skip the first reveal. (The "evidence" ref keeps
     its id-based name — the tab id + file are unchanged; only the label renamed.) */
  const summaryEntranceSeen = useRef(false);
  const registerEntranceSeen = useRef(false);
  const evidenceEntranceSeen = useRef(false);
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    const left = prevTabRef.current;
    if (left !== activeTab) {
      if (left === "summary") summaryEntranceSeen.current = true;
      else if (left === "register") registerEntranceSeen.current = true;
      else if (left === "evidence") evidenceEntranceSeen.current = true;
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  /* ── Filtered ── */
  const baseFindings = useMemo(() =>
    findings.filter((f) => {
      if (siteFilter && f.siteId !== siteFilter) return false;
      if (areaFilter && f.area !== areaFilter) return false;
      if (frameworkFilter && f.framework !== frameworkFilter) return false;
      if (severityFilter && f.severity !== severityFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      return true;
    }),
  [findings, siteFilter, areaFilter, frameworkFilter, severityFilter, statusFilter]);

  /* ── Computed ── */
  const criticalCount = baseFindings.filter((f) => f.severity === "Critical").length;
  const highCount = baseFindings.filter((f) => f.severity === "High").length;
  const lowCount = baseFindings.filter((f) => f.severity === "Low").length;
  const openCount = baseFindings.filter((f) => f.status !== "Closed").length;
  const closedCount = baseFindings.filter((f) => f.status === "Closed").length;
  const overdueCount = baseFindings.filter((f) => f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs())).length;

  const topDrivers = useMemo(() => {
    const map: Record<string, { count: number; critical: number; high: number }> = {};
    baseFindings.filter((f) => f.status !== "Closed").forEach((f) => {
      if (!map[f.area]) map[f.area] = { count: 0, critical: 0, high: 0 };
      map[f.area].count++;
      if (f.severity === "Critical") map[f.area].critical++;
      if (f.severity === "High") map[f.area].high++;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [baseFindings]);

  const severityData = useMemo(
    () => [
      { name: "Critical", value: criticalCount, fill: "#ef4444" },
      { name: "High", value: highCount, fill: "#f59e0b" },
      { name: "Low", value: lowCount, fill: "#10b981" },
    ].filter((d) => d.value > 0),
    [criticalCount, highCount, lowCount],
  );

  /* ── Evidence data ── */
  // Finding IDs whose evidence is a retrievable uploaded document (vs. a typed
  // reference). Resolves the link to the in-app download route below.
  const evidenceDocIds = useMemo(
    () => new Set(evidenceDocFindingIds ?? []),
    [evidenceDocFindingIds],
  );
  // Resolve an evidence link to a clickable, viewable URL:
  //  • http(s) link → open the external URL directly
  //  • uploaded document → stream it from the authenticated download route
  //  • typed reference with no file → no href (rendered as plain text)
  function resolveEvidenceHref(findingId: string, link: string): string | undefined {
    const v = link?.trim();
    if (!v) return undefined;
    if (/^https?:\/\//i.test(v)) return v;
    if (evidenceDocIds.has(findingId)) return `/api/findings/${findingId}/evidence`;
    return undefined;
  }
  const evidenceAreas = useMemo(() =>
    AREAS.map((area) => {
      // Use baseFindings (the 5 page-level filters), NOT the raw findings list, so
      // the Evidence Index honours the same site/area/framework/severity/status
      // filters as Summary and Register instead of always showing everything.
      const areaFindings = baseFindings.filter((f) => f.area === area);
      const rows = areaFindings.map((f) => ({
        findingId: f.id, reference: formatReference("FND", f), framework: f.framework,
        docType: DOC_TYPE_MAP[f.framework] ?? "Record",
        name: f.requirement, evidenceLink: f.evidenceLink,
        evidenceHref: resolveEvidenceHref(f.id, f.evidenceLink),
        status: getEvidenceStatus(f), severity: f.severity,
        findingStatus: f.status, owner: f.owner,
        linkedCapa: capas.find((c) => c.id === f.capaId),
      }));
      return { area, rows, status: getAreaStatus(rows) };
    }).filter((a) => a.rows.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [baseFindings, capas, evidenceDocIds]);

  const allEvidenceRows = evidenceAreas.flatMap((a) => a.rows);
  const completeCount = allEvidenceRows.filter((r) => r.status === "Complete").length;
  const partialCount = allEvidenceRows.filter((r) => r.status === "Partial").length;
  const missingCount = allEvidenceRows.filter((r) => r.status === "Missing").length;

  /* ── Filter dropdowns ── */
  const siteOptions = useMemo(() => [{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))], [sites]);
  // Filter labels use the catalog display NAME (editable metadata), so a
  // Super-Admin framework rename shows here — reserved AND custom. The value
  // stays the immutable key. (frameworkLabel is still used for finding badges,
  // which only carry the stored key.)
  const fwOptions = useMemo(() => [{ value: "", label: "All frameworks" }, ...frameworkList.map((f) => ({ value: f.key, label: f.name }))], [frameworkList]);

  function renderFilters(compact = false) {
    return (
      <>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width={compact ? "w-36" : "w-44"} options={siteOptions} />
        <Dropdown placeholder="All areas" value={areaFilter} onChange={setAreaFilter} width="w-36" options={AREA_OPTIONS} />
        {!compact && <Dropdown placeholder="All frameworks" value={frameworkFilter} onChange={setFrameworkFilter} width="w-40" options={fwOptions} />}
        <Dropdown placeholder="All severities" value={severityFilter} onChange={setSeverityFilter} width="w-36" options={SEVERITY_OPTIONS} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-36" options={STATUS_OPTIONS} />
        {isAnyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </>
    );
  }

  /* ── Handlers ── */
  // CAPA risk type tolerates "Medium" too; map slice severity → server risk enum.
  function severityToRisk(s: FindingSeverity): "Critical" | "High" | "Medium" | "Low" {
    if (s === "Critical") return "Critical";
    if (s === "High") return "High";
    if (s === "Medium") return "Medium";
    return "Low";
  }

  async function handleRaiseCapa(finding: Finding) {
    const result = await createCAPAAction({
      title: finding.requirement.slice(0, 120),
      description: finding.requirement,
      source: "Gap Assessment",
      risk: severityToRisk(finding.severity),
      owner: finding.owner,
      dueDate: finding.targetDate,
      siteId: finding.siteId || undefined,
      linkedFindingId: finding.id,
      diGateRequired: ["p11", "annex11"].includes(finding.framework),
    });
    if (!result.success) {
      // The "Raise CAPA" button is hidden for non-QA (canCreateCAPA), so this
      // path is a stale-UI / race guard. Log for debugging (warn, not a red
      // error) and surface a friendly toast instead of a dead click.
      console.warn("[gap] handleRaiseCapa rejected:", result.error);
      toast.error(
        result.error === "Only QA Head can create a CAPA."
          ? "Only your QA Head can create a CAPA from this finding."
          : "Couldn't raise a CAPA from this finding. Please try again.",
      );
      return;
    }
    const capaData = result.data as { id: string; reference?: string; findingCarryover?: { convertedEvidenceCount?: number } };
    // FIX 1a — show the human reference (CAPA-…), not the raw cuid.
    setRaisedCapaId(capaData.reference ?? capaData.id);
    // Step 5 — the finding's categorized docs become real CAPA evidence on raise.
    const conv = capaData.findingCarryover?.convertedEvidenceCount ?? 0;
    setRaisedNote(conv > 0 ? ` ${conv} document${conv === 1 ? "" : "s"} carried over as evidence.` : "");
    // On a successful raise, CLOSE the finding detail. The previous in-place
    // capaId stamp left the open snapshot inconsistent — status still "Open", and
    // the just-created CAPA not yet in the Redux store (router.refresh() is async)
    // so the Linked-CAPA lookup fell back to the raw cuid — which rendered as
    // stale/invalid data until close+reopen. Closing is clean: the "CAPA raised"
    // popup confirms (and links to the Tracker), and router.refresh() repopulates
    // the register so the finding shows In Progress + linked.
    setSelectedFinding(null);
    setCapaRaisedPopup(true);
    router.refresh();
  }

  async function handleAddFinding(data: FindingForm) {
    // `raiseCapaImmediately` is intentionally left in the payload shape (see
    // AddFindingModal) but the UI never sets it — CAPAs are raised via the
    // normal disposition, so there is no create-time raise branch here.
    const { evidenceFiles, ...rest } = data;
    // BUG FIX — the Evidence Link must be ONLY what the user typed. Previously it
    // fell back to `evidenceFiles?.[0]?.name` (the uploaded file's NAME), so a
    // finding with an attached file but no typed link got its Evidence Link
    // auto-populated with the file name. The files are uploaded separately
    // (uploadFindingEvidence, post-create) and must NOT masquerade as the link.
    const evidenceReference = rest.evidenceLink?.trim() || "";
    const result = await createFindingAction({
      requirement: rest.requirement,
      purpose: rest.purpose || undefined,
      area: rest.area,
      framework: rest.framework,
      severity: rest.severity,
      // owner is server-stamped to the creator (session); not sent from the form.
      targetDate: rest.targetDate,
      siteId: rest.siteId || undefined,
      evidenceLink: evidenceReference || undefined,
      // Gap RCA (Batch B) — structured method + JSON detail + readable mirror.
      rcaMethod: rest.rcaMethod,
      rcaDetail: data.rcaDetail,
      rootCause: rest.rootCause || undefined,
    });
    if (!result.success) {
      console.error("[gap] handleAddFinding failed:", result.error);
      return;
    }
    // GAP-LINK-FIX — persist the optional finding↔system link. AddFindingModal
    // collects linkedSystemId (for CSV/IT & QC Lab areas) but it was previously
    // dropped here, so the FK was never written and the link vanished on
    // refresh. createFinding has no systemId field, so route the link through
    // the canonical linkFindingToSystem action. Best-effort: the finding is
    // already created; a link failure (e.g. the caller lacks the qa_head/admin
    // role that canManageSystemLinks requires) is logged, not fatal.
    const created = result.data as PrismaFinding | undefined;
    if (rest.linkedSystemId && created?.id) {
      const linkRes = await linkFindingToSystemAction(rest.linkedSystemId, created.id);
      if (!linkRes.success) {
        console.error("[gap] linkFindingToSystem failed:", linkRes.error);
      }
    }
    // Multi-file evidence (#2) — the create modal stages files; now that the
    // finding exists, upload each as a real linked Document (mirrors the
    // worklist FindingWorkPanel upload). Best-effort + sequential: a per-file
    // failure is logged, not fatal (the finding is already created).
    if (created?.id && evidenceFiles && evidenceFiles.length > 0) {
      for (const ev of evidenceFiles) {
        const fd = new FormData();
        fd.append("file", ev.file);
        const upRes = await uploadFindingEvidenceAction(created.id, fd);
        if (!upRes.success) console.error("[gap] uploadFindingEvidence failed:", ev.name, upRes.error);
      }
    }
    setAddOpen(false);
    setAddedPopup(true);
    router.refresh();
  }

  async function handleLinkEvidence(findingId: string, evidenceLink: string) {
    const result = await updateFindingAction(findingId, { evidenceLink });
    if (!result.success) {
      // The link action is hidden for non-QA (canEditFinding); stale-UI guard.
      // Warn (not a red error); the modal surfaces `error` inline.
      console.warn("[gap] handleLinkEvidence rejected:", result.error);
      return { ok: false, error: result.error };
    }
    setEvidenceLinkedPopup(true);
    router.refresh();
    return { ok: true };
  }

  async function handleUploadEvidence(findingId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadFindingEvidenceAction(findingId, fd);
    if (!result.success) {
      console.error("[gap] handleUploadEvidence failed:", result.error);
      return { ok: false, error: result.error };
    }
    setEvidenceLinkedPopup(true);
    router.refresh();
    return { ok: true };
  }

  function toggleArea(a: string) {
    setExpandedAreas((p) => {
      const n = new Set(p);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });
  }

  /* ══════════════════════════════════════ */

  // One-line module description for the header (the live stats now live in the
  // KPI cards on the Register tab, so the subtitle is no longer a stats line).
  const headerDescription = "Identify, track, and close compliance gaps across your GxP frameworks.";
  // Header actions — "Ask AI" (secondary) opens the Findings Search drawer;
  // "Report Gap" stays the single primary (same gates: no-sites / plan-limit).
  // ActionBar renders secondaries left of the primary, so Ask AI sits to the
  // left of Report Gap (Support-pattern header).
  const headerActions: PageAction[] = [
    { label: "Ask AI", variant: "secondary", icon: Sparkles, onClick: () => setAskAiOpen(true) },
  ];
  if (gapCan.canCreate) {
    headerActions.push({
      label: "Report Gap",
      variant: "primary",
      icon: Plus,
      onClick: () => {
        if (!hasSites) { setNoSitesOpen(true); return; }
        if (atFindingLimit) { setPlanLimitOpen(true); return; }
        setAddOpen(true);
      },
    });
  }

  return (
    <PageLayout
      title="Gap Assessment & Findings"
      titleIcon={ClipboardCheck}
      description={headerDescription}
      actions={headerActions}
      // headerRight renders LEFT of the actions cluster, so the header reads
      // [Status Guide] [Ask AI] [+ Report Gap] left→right (Report Gap stays the
      // rightmost primary).
      headerRight={<StatusGuide module="Gap Assessment" statuses={FINDING_STATUSES} />}
      className="w-full"
    >
      <div className="space-y-5">
      {/* Tab bar */}
      <TabBar tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} ariaLabel="Gap assessment sections" />

      {/* Tab panels */}
      {activeTab === "summary" && (
        <GapSummaryTab
          playEntrance={!summaryEntranceSeen.current}
          findingsTotal={findings.length} baseCount={baseFindings.length}
          criticalCount={criticalCount} highCount={highCount} lowCount={lowCount}
          openCount={openCount} closedCount={closedCount} overdueCount={overdueCount}
          topDrivers={topDrivers} severityData={severityData} renderFilters={renderFilters}
          lastClosedFinding={(() => {
            const closed = baseFindings.filter((f) => f.status === "Closed");
            if (closed.length === 0) return null;
            const latest = closed.reduce((a, b) => (dayjs(a.createdAt).isAfter(b.createdAt) ? a : b));
            return { id: formatReference("FND", latest), closedAt: latest.createdAt ? dayjs.utc(latest.createdAt).tz(timezone).format(dateFormat) : undefined };
          })()}
        />
      )}

      {activeTab === "register" && (
        <GapRegisterTab
          playEntrance={!registerEntranceSeen.current}
          filteredFindings={baseFindings} findingsTotal={findings.length}
          assignees={assignees}
          selectedFinding={selectedFinding} onSelectFinding={setSelectedFinding} isViewOnly={isViewOnly} users={users}
          timezone={timezone} dateFormat={dateFormat} capas={capas}
          agiMode={agiMode} agiCapa={agiCapa} isAnyFilterActive={isAnyFilterActive}
          renderFilters={renderFilters} onClearFilters={clearFilters}
          onAddOpen={() => setAddOpen(true)} onRaiseCapa={handleRaiseCapa}
          onNavigateCapa={() => router.push("/capa")}
          onManageEvidence={(fid, link) => { setEvidenceFindingId(fid); setEvidenceCurrentLink(link); setEvidenceModalOpen(true); }}
        />
      )}

      {activeTab === "evidence" && (
        <GapEvidenceTab
          playEntrance={!evidenceEntranceSeen.current}
          evidenceAreas={evidenceAreas} allEvidenceRows={allEvidenceRows}
          completeCount={completeCount} partialCount={partialCount} missingCount={missingCount}
          renderFilters={renderFilters} isAnyFilterActive={isAnyFilterActive}
          expandedAreas={expandedAreas} onToggleArea={toggleArea} isViewOnly={isViewOnly} users={users}
          onLinkEvidence={(fid, link) => { setEvidenceFindingId(fid); setEvidenceCurrentLink(link); setEvidenceModalOpen(true); }}
          onFindingClick={(fid) => { setActiveTab("register"); const f = findings.find((x) => x.id === fid); if (f) setSelectedFinding(f); }}
          onGoToRegister={() => setActiveTab("register")}
        />
      )}

      {/* Modals */}
      <AddFindingModal
        isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddFinding}
        sites={sites} systems={systems} activeFrameworks={activeFrameworks as string[]}
        lockedSiteId={selectedSiteId}
        currentUserName={authUser?.name ?? ""} currentUserRole={authUser?.role ?? ""}
        currentUserSiteId={users.find((u) => u.id === authUser?.id)?.assignedSites?.[0] ?? null}
        aiEnabled={agiMode !== "manual" && agiCapa}
      />

      <EvidenceLinkModal
        isOpen={evidenceModalOpen}
        onClose={() => { setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceCurrentLink(""); }}
        onSave={handleLinkEvidence}
        onUpload={handleUploadEvidence}
        findingId={evidenceFindingId} currentLink={evidenceCurrentLink}
        finding={findings.find((f) => f.id === evidenceFindingId)} />

      {/* Ask AI — the plain-English Findings Search, moved out of the Register
          tab's primary layout into a slide-out Drawer (Support-pattern). Opening
          a result jumps to the finding: switch to the Register tab (its detail
          modal lives there), select it, and close the drawer. */}
      <Drawer open={askAiOpen} onClose={() => setAskAiOpen(false)} title="Ask AI · Findings Search" width="lg">
        <SmartRecordSearch
          title="Findings Search"
          sources={[buildFindingSource(findings, sites, (fid) => {
            const f = findings.find((x) => x.id === fid);
            if (f) { setActiveTab("register"); setSelectedFinding(f); setAskAiOpen(false); }
          })]}
        />
      </Drawer>

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="Finding logged" description="Added to the register. Raise a CAPA if corrective action is needed." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={capaRaisedPopup} variant="success" title="CAPA raised"
        description={`${raisedCapaId} created and linked.${raisedNote} Go to CAPA Tracker to add RCA.`}
        onDismiss={() => setCapaRaisedPopup(false)}
        actions={[{ label: "Go to CAPA Tracker", style: "primary", onClick: () => { setCapaRaisedPopup(false); router.push("/capa"); } }]} />
      <Popup isOpen={evidenceLinkedPopup} variant="success" title="Evidence saved" description="Evidence document saved. Close the finding to mark evidence as Complete." onDismiss={() => setEvidenceLinkedPopup(false)} />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="Gap Assessment" />
      <PlanLimitPopup isOpen={planLimitOpen} onClose={() => setPlanLimitOpen(false)} resource="finding" plan={tenantPlan} limit={getLimit("findings")} />
      </div>
    </PageLayout>
  );
}