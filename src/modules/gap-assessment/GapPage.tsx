import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ClipboardList, FolderOpen, Plus } from "lucide-react";
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
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  addFinding, updateFinding,
  type Finding,
} from "@/store/findings.slice";
import { addCAPA } from "@/store/capa.slice";
import { addDocument, type DocArea, type DocType } from "@/store/evidence.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popup } from "@/components/ui/Popup";

import { GapSummaryTab } from "./tabs/GapSummaryTab";
import { GapRegisterTab } from "./tabs/GapRegisterTab";
import { GapEvidenceTab } from "./tabs/GapEvidenceTab";
import { AddFindingModal, type FindingForm } from "./modals/AddFindingModal";
import { EvidenceLinkModal } from "./modals/EvidenceLinkModal";

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

export function GapPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isViewOnly } = useRole();
  const { canCreateFindings, isCustomerAdmin } = usePermissions();
  const { hasSites } = useSetupStatus();
  const { isAtLimit, getLimit, tenantPlan } = usePlanLimits();
  const atFindingLimit = isAtLimit("findings");

  const { findings, capas, systems, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);
  const user = useAppSelector((s) => s.auth.user);

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
  const [exportPopup, setExportPopup] = useState(false);
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
  const evidenceAreas = useMemo(() =>
    AREAS.map((area) => {
      const areaFindings = findings.filter((f) => f.area === area);
      const rows = areaFindings.map((f) => ({
        findingId: f.id, framework: f.framework,
        docType: DOC_TYPE_MAP[f.framework] ?? "Record",
        name: f.requirement, evidenceLink: f.evidenceLink,
        status: getEvidenceStatus(f), severity: f.severity,
        findingStatus: f.status, owner: f.owner,
        linkedCapa: capas.find((c) => c.id === f.capaId),
      }));
      return { area, rows, status: getAreaStatus(rows) };
    }).filter((a) => a.rows.length > 0),
  [findings, capas]);

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
        {isAnyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
      </>
    );
  }

  /* ── Handlers ── */
  function handleRaiseCapa(finding: Finding) {
    const capaId = `CAPA-${String(Date.now()).slice(-4)}`;
    dispatch(updateFinding({ id: finding.id, patch: { capaId } }));
    dispatch(addCAPA({
      id: capaId, findingId: finding.id, source: "Gap Assessment",
      risk: finding.severity, owner: finding.owner, dueDate: finding.targetDate,
      status: "Open", description: finding.requirement,
      rca: finding.rootCause ?? "", rcaMethod: undefined, correctiveActions: "",
      effectivenessCheck: finding.severity !== "Low",
      evidenceLinks: [], diGate: ["p11", "annex11"].includes(finding.framework), createdAt: new Date().toISOString(),
      tenantId: tenantId ?? "", siteId: finding.siteId,
      linkedSystemId: finding.linkedSystemId,
      linkedSystemName: finding.linkedSystemName,
    }));
    auditLog({ action: "CAPA_RAISED_FROM_FINDING", module: "gap-assessment", recordId: finding.id, newValue: { capaId, findingId: finding.id } });
    setSelectedFinding((prev) => prev ? { ...prev, capaId } : null);
    setRaisedCapaId(capaId);
    setCapaRaisedPopup(true);
  }

  function handleAddFinding(data: FindingForm) {
    const { raiseCapaImmediately, evidenceFile, ...rest } = data;
    const createdAt = new Date().toISOString();
    const evidenceReference = rest.evidenceLink?.trim() || evidenceFile?.name || "";
    const nf: Finding = {
      ...rest,
      id: `FIND-${String(findings.length + 1).padStart(3, "0")}`,
      status: "Open",
      evidenceLink: evidenceReference,
      rootCause: rest.rootCause ?? "",
      createdAt,
      capaId: undefined,
      agiSummary: undefined,
      tenantId: tenantId ?? "",
    };
    dispatch(addFinding(nf));
    if (evidenceFile && evidenceReference) {
      dispatch(addDocument({
        id: `evidence-${Date.now()}`,
        tenantId: tenantId ?? "",
        siteId: nf.siteId,
        title: nf.requirement,
        reference: evidenceReference,
        type: (DOC_TYPE_MAP[nf.framework] as DocType | undefined) ?? evidenceFile.type,
        area: nf.area as DocArea,
        findingId: nf.id,
        version: "1.0",
        status: "Under Review",
        author: user?.name ?? "",
        effectiveDate: createdAt,
        tags: [nf.framework, nf.severity, "Gap Assessment"],
        sizeKb: evidenceFile.sizeKb,
        complianceTags: [nf.framework],
        createdAt,
      }));
    }
    auditLog({ action: "FINDING_CREATED", module: "gap-assessment", recordId: nf.id, newValue: nf });
    setAddOpen(false);
    setAddedPopup(true);
    if (raiseCapaImmediately) {
      // Auto-raise CAPA linked to the new finding
      handleRaiseCapa(nf);
    }
  }

  function handleLinkEvidence(findingId: string, evidenceLink: string) {
    dispatch(updateFinding({ id: findingId, patch: { evidenceLink } }));
    auditLog({ action: "EVIDENCE_LINKED", module: "gap-assessment", recordId: findingId, newValue: { evidenceLink } });
    setEvidenceLinkedPopup(true);
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
        actions={canCreateFindings ? <Button variant="primary" icon={Plus} onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } if (atFindingLimit) { setPlanLimitOpen(true); return; } setAddOpen(true); }}>Report Gap</Button> : isCustomerAdmin ? <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Contact QA Head or team member to log findings</p> : undefined}
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
            return { id: latest.id, closedAt: latest.createdAt ? dayjs.utc(latest.createdAt).format("DD MMM YYYY") : undefined };
          })()}
        />
      )}

      {activeTab === "register" && (
        <GapRegisterTab
          filteredFindings={baseFindings} findingsTotal={findings.length}
          selectedFinding={selectedFinding} onSelectFinding={setSelectedFinding} isViewOnly={isViewOnly || isCustomerAdmin} users={users}
          timezone={timezone} dateFormat={dateFormat} capas={capas}
          agiMode={agiMode} agiCapa={agiCapa} isAnyFilterActive={isAnyFilterActive}
          renderFilters={renderFilters}
          onAddOpen={() => setAddOpen(true)} onRaiseCapa={handleRaiseCapa}
          onNavigateCapa={(capaId) => router.push("/capa", { state: { openCapaId: capaId } })}
        />
      )}

      {activeTab === "evidence" && (
        <GapEvidenceTab
          evidenceAreas={evidenceAreas} allEvidenceRows={allEvidenceRows}
          completeCount={completeCount} partialCount={partialCount} missingCount={missingCount}
          expandedAreas={expandedAreas} onToggleArea={toggleArea} isViewOnly={isViewOnly} users={users}
          onLinkEvidence={(fid, link) => { setEvidenceFindingId(fid); setEvidenceCurrentLink(link); setEvidenceModalOpen(true); }}
          onFindingClick={(fid) => { setActiveTab("register"); const f = findings.find((x) => x.id === fid); if (f) setSelectedFinding(f); }}
          onExport={() => setExportPopup(true)}
          onGoToRegister={() => setActiveTab("register")}
        />
      )}

      {/* Modals */}
      <AddFindingModal
        isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddFinding}
        sites={sites} users={complianceUsers} systems={systems} activeFrameworks={activeFrameworks as string[]}
        lockedSiteId={selectedSiteId}
      />

      <EvidenceLinkModal
        isOpen={evidenceModalOpen}
        onClose={() => { setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceCurrentLink(""); }}
        onSave={handleLinkEvidence}
        findingId={evidenceFindingId} currentLink={evidenceCurrentLink}
        finding={findings.find((f) => f.id === evidenceFindingId)} />

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="Finding logged" description="Added to the register. Raise a CAPA if corrective action is needed." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={capaRaisedPopup} variant="success" title="CAPA raised"
        description={`${raisedCapaId} created and linked. Go to CAPA Tracker to add RCA.`}
        onDismiss={() => setCapaRaisedPopup(false)}
        actions={[{ label: "Go to CAPA Tracker", style: "primary", onClick: () => { setCapaRaisedPopup(false); router.push("/capa", { state: { openCapaId: raisedCapaId } }); } }]} />
      <Popup isOpen={evidenceLinkedPopup} variant="success" title="Evidence linked" description="Document reference saved. Close the finding to mark evidence as Complete." onDismiss={() => setEvidenceLinkedPopup(false)} />
      <Popup isOpen={exportPopup} variant="success" title="Evidence pack exported"
        description={`${allEvidenceRows.length} evidence items across ${evidenceAreas.length} areas. ${missingCount > 0 ? `${missingCount} items still missing.` : "All areas have evidence linked."}`}
        onDismiss={() => setExportPopup(false)} />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="Gap Assessment" />
      <PlanLimitPopup isOpen={planLimitOpen} onClose={() => setPlanLimitOpen(false)} resource="finding" plan={tenantPlan} limit={getLimit("findings")} />
    </main>
  );
}
