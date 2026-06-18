"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardList, FolderOpen, Plus } from "lucide-react";
import type { Finding as PrismaFinding } from "@prisma/client";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { NoSitesPopup, TabBar, PlanLimitPopup, PageHeader, StatusGuide } from "@/components/shared";
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

import { GapSummaryTab } from "./tabs/GapSummaryTab";
import { GapRegisterTab } from "./tabs/GapRegisterTab";
import { GapEvidenceTab } from "./tabs/GapEvidenceTab";
import { AddFindingModal, type FindingForm } from "./modals/AddFindingModal";
import { EvidenceLinkModal } from "./modals/EvidenceLinkModal";

/** Prisma Finding plus the edit-history rows the page query includes. */
type FindingWithEdits = PrismaFinding & {
  edits?: {
    editedBy: string;
    editedByName: string;
    editedAt: Date;
    reason: string | null;
    changes: string;
  }[];
};

/* ── Adapt Prisma Finding → slice Finding shape ── */
function adaptFinding(p: FindingWithEdits): Finding {
  return {
    id: p.id,
    reference: p.reference ?? undefined,
    tenantId: p.tenantId,
    siteId: p.siteId ?? "",
    area: p.area,
    requirement: p.requirement,
    purpose: p.purpose ?? undefined,
    framework: p.framework ?? "",
    severity: p.severity as FindingSeverity,
    status: (p.status ?? "Open") as Finding["status"],
    owner: p.owner,
    targetDate: p.targetDate ? p.targetDate.toISOString() : "",
    evidenceLink: p.evidenceLink ?? "",
    rootCause: p.rootCause ?? undefined,
    rcaMethod: p.rcaMethod ?? undefined,
    rcaDetail: p.rcaDetail ?? undefined,
    capaId: p.linkedCAPAId ?? undefined,
    createdAt: p.createdAt.toISOString(),
    editHistory: p.edits?.length
      ? p.edits.map((e) => ({
          editedBy: e.editedBy,
          editedAt: e.editedAt.toISOString(),
          reason: e.reason ?? undefined,
          changes: (() => {
            try {
              return JSON.parse(e.changes) as { field: string; oldValue: unknown; newValue: unknown }[];
            } catch {
              return [];
            }
          })(),
        }))
      : undefined,
  };
}

/* ── Constants ── */

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];
const FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};
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
  { value: "Low", label: "Low", badge: "L", badgeVariant: "green" as const },
];
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Open", label: "Open" },
  { value: "In Progress", label: "In Progress" },
  { value: "Closed", label: "Closed" },
];

type TabId = "summary" | "register" | "evidence";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "summary", label: "Summary", Icon: BarChart3 },
  { id: "register", label: "Findings Register", Icon: ClipboardList },
  { id: "evidence", label: "Evidence Index", Icon: FolderOpen },
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
}

export function GapPage({ findings: serverFindings, evidenceDocFindingIds }: GapPageProps = {}) {
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
  const { hasSites } = useSetupStatus();
  const { isAtLimit, getLimit, tenantPlan } = usePlanLimits();
  const atFindingLimit = isAtLimit("findings");

  const { findings, capas, systems } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const authUser = useAppSelector((s) => s.auth.user);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);

  const activeFrameworks = useMemo(
    () => (Object.keys(frameworks) as (keyof typeof frameworks)[]).filter((k) => frameworks[k]),
    [frameworks],
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
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(AREAS));
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceFindingId, setEvidenceFindingId] = useState("");
  const [evidenceCurrentLink, setEvidenceCurrentLink] = useState("");
  const [evidenceLinkedPopup, setEvidenceLinkedPopup] = useState(false);
  const [noSitesOpen, setNoSitesOpen] = useState(false);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);

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
      const areaFindings = findings.filter((f) => f.area === area);
      const rows = areaFindings.map((f) => ({
        findingId: f.id, reference: formatReference("GAP", f), framework: f.framework,
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
  [findings, capas, evidenceDocIds]);

  const allEvidenceRows = evidenceAreas.flatMap((a) => a.rows);
  const completeCount = allEvidenceRows.filter((r) => r.status === "Complete").length;
  const partialCount = allEvidenceRows.filter((r) => r.status === "Partial").length;
  const missingCount = allEvidenceRows.filter((r) => r.status === "Missing").length;

  /* ── Filter dropdowns ── */
  const siteOptions = useMemo(() => [{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))], [sites]);
  const fwOptions = useMemo(() => [{ value: "", label: "All frameworks" }, ...activeFrameworks.map((k) => ({ value: k, label: FRAMEWORK_LABELS[k] ?? k }))], [activeFrameworks]);

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
      console.error("[gap] handleRaiseCapa failed:", result.error);
      return;
    }
    const capaData = result.data as { id: string; reference?: string };
    // FIX 1a — show the human reference (CAPA-…), not the raw cuid.
    setRaisedCapaId(capaData.reference ?? capaData.id);
    // FIX 1b — the detail modal renders from the selectedFinding snapshot; flip
    // its "Raise CAPA" button to "linked" instantly by stamping capaId. Redux
    // also refreshes via router.refresh()'s effect (kept), but the open snapshot
    // needs this direct update so it doesn't require close+reopen.
    setSelectedFinding((prev) =>
      prev && prev.id === finding.id ? { ...prev, capaId: capaData.id } : prev,
    );
    setCapaRaisedPopup(true);
    router.refresh();
  }

  async function handleAddFinding(data: FindingForm) {
    const { raiseCapaImmediately, evidenceFile, ...rest } = data;
    const evidenceReference = rest.evidenceLink?.trim() || evidenceFile?.name || "";
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
    setAddOpen(false);
    setAddedPopup(true);
    if (raiseCapaImmediately && created) {
      await handleRaiseCapa(adaptFinding(created));
    } else {
      router.refresh();
    }
  }

  async function handleLinkEvidence(findingId: string, evidenceLink: string) {
    const result = await updateFindingAction(findingId, { evidenceLink });
    if (!result.success) {
      console.error("[gap] handleLinkEvidence failed:", result.error);
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

  return (
    <main id="main-content" aria-label="GxP/GMP gap assessment and findings" className="w-full space-y-5">
      {/* Header */}
      <PageHeader
        title="Gap Assessment &amp; Findings"
        subtitle={findings.length === 0 ? "No findings logged yet" : `${findings.length} findings \u00b7 ${criticalCount} critical \u00b7 ${openCount} open`}
        actions={gapCan.canCreate ? <Button variant="primary" icon={Plus} onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } if (atFindingLimit) { setPlanLimitOpen(true); return; } setAddOpen(true); }}>Report Gap</Button> : undefined}
      />
      <StatusGuide module="Gap Assessment" statuses={FINDING_STATUSES} />

      {/* Tab bar */}
      <TabBar tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} ariaLabel="Gap assessment sections" />

      {/* Tab panels */}
      {activeTab === "summary" && (
        <GapSummaryTab
          findingsTotal={findings.length} baseCount={baseFindings.length}
          criticalCount={criticalCount} highCount={highCount} lowCount={lowCount}
          openCount={openCount} closedCount={closedCount} overdueCount={overdueCount}
          topDrivers={topDrivers} severityData={severityData} renderFilters={renderFilters}
          lastClosedFinding={(() => {
            const closed = baseFindings.filter((f) => f.status === "Closed");
            if (closed.length === 0) return null;
            const latest = closed.reduce((a, b) => (dayjs(a.createdAt).isAfter(b.createdAt) ? a : b));
            return { id: formatReference("GAP", latest), closedAt: latest.createdAt ? dayjs.utc(latest.createdAt).format("DD MMM YYYY") : undefined };
          })()}
        />
      )}

      {activeTab === "register" && (
        <div className="space-y-4">
          {/* Feature 2 — Plain-English Record Search */}
          <SmartRecordSearch
            title="Findings Search"
            sources={[buildFindingSource(findings, sites, (fid) => {
              const f = findings.find((x) => x.id === fid);
              if (f) setSelectedFinding(f);
            })]}
          />
          <GapRegisterTab
            filteredFindings={baseFindings} findingsTotal={findings.length}
            selectedFinding={selectedFinding} onSelectFinding={setSelectedFinding} isViewOnly={isViewOnly} users={users}
            timezone={timezone} dateFormat={dateFormat} capas={capas}
            agiMode={agiMode} agiCapa={agiCapa} isAnyFilterActive={isAnyFilterActive}
            renderFilters={renderFilters}
            onAddOpen={() => setAddOpen(true)} onRaiseCapa={handleRaiseCapa}
            onNavigateCapa={() => router.push("/capa")}
            onManageEvidence={(fid, link) => { setEvidenceFindingId(fid); setEvidenceCurrentLink(link); setEvidenceModalOpen(true); }}
          />
        </div>
      )}

      {activeTab === "evidence" && (
        <GapEvidenceTab
          evidenceAreas={evidenceAreas} allEvidenceRows={allEvidenceRows}
          completeCount={completeCount} partialCount={partialCount} missingCount={missingCount}
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
        aiEnabled={agiMode !== "manual" && agiCapa}
      />

      <EvidenceLinkModal
        isOpen={evidenceModalOpen}
        onClose={() => { setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceCurrentLink(""); }}
        onSave={handleLinkEvidence}
        onUpload={handleUploadEvidence}
        findingId={evidenceFindingId} currentLink={evidenceCurrentLink}
        finding={findings.find((f) => f.id === evidenceFindingId)} />

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="Finding logged" description="Added to the register. Raise a CAPA if corrective action is needed." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={capaRaisedPopup} variant="success" title="CAPA raised"
        description={`${raisedCapaId} created and linked. Go to CAPA Tracker to add RCA.`}
        onDismiss={() => setCapaRaisedPopup(false)}
        actions={[{ label: "Go to CAPA Tracker", style: "primary", onClick: () => { setCapaRaisedPopup(false); router.push("/capa"); } }]} />
      <Popup isOpen={evidenceLinkedPopup} variant="success" title="Evidence saved" description="Evidence document saved. Close the finding to mark evidence as Complete." onDismiss={() => setEvidenceLinkedPopup(false)} />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="Gap Assessment" />
      <PlanLimitPopup isOpen={planLimitOpen} onClose={() => setPlanLimitOpen(false)} resource="finding" plan={tenantPlan} limit={getLimit("findings")} />
    </main>
  );
}