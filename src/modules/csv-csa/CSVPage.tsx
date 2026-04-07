import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import clsx from "clsx";
import { Database, Server, GitBranch, Plus, Info } from "lucide-react";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup, TabBar, PageHeader } from "@/components/shared";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import {
  addSystem, updateSystem, removeSystem, addActivity,
  type GxPSystem, type RoadmapActivity,
} from "@/store/systems.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { SystemInventoryTab } from "./tabs/SystemInventoryTab";
import { SystemDetailTab } from "./tabs/SystemDetailTab";
import { CSVRoadmapTab } from "./tabs/CSVRoadmapTab";
import { AddSystemModal, type SystemForm } from "./modals/AddSystemModal";
import { EditSystemModal, type SystemForm as EditSystemForm } from "./modals/EditSystemModal";
import { AddActivityModal, type ActivityForm } from "./modals/AddActivityModal";

/* ── Constants ── */

type TabId = "inventory" | "detail" | "roadmap";
type DetailTab = "overview" | "risk" | "validation" | "di";

const TABS: { id: TabId; label: string; Icon: typeof Database }[] = [
  { id: "inventory", label: "System Inventory", Icon: Database },
  { id: "detail", label: "System Detail", Icon: Server },
  { id: "roadmap", label: "CSV Roadmap", Icon: GitBranch },
];

/* ══════════════════════════════════════ */

export function CSVPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isViewOnly, role } = useRole();

  /* ── Redux ── */
  const { systems, roadmap, findings, capas, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { hasSites } = useSetupStatus();

  const showPart11 = frameworks.p11;
  const showAnnex11 = frameworks.annex11;
  const showGAMP5 = frameworks.gamp5;

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const selectedSystem = selectedSystemId ? systems.find((s) => s.id === selectedSystemId) ?? null : null;
  const setSelectedSystem = (sys: GxPSystem | null) => setSelectedSystemId(sys?.id ?? null);
  const [siteFilter, setSiteFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [valFilter, setValFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [rmSysFilter, setRmSysFilter] = useState("");
  const [rmTypeFilter, setRmTypeFilter] = useState("");
  const [rmStatusFilter, setRmStatusFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [editSavedPopup, setEditSavedPopup] = useState(false);
  const [removePopup, setRemovePopup] = useState(false);
  const [systemToRemove, setSystemToRemove] = useState<string | null>(null);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [activityAddedPopup, setActivityAddedPopup] = useState(false);
  const [riskFactorsSaved, setRiskFactorsSaved] = useState(false);
  const [actionsSaved, setActionsSaved] = useState(false);
  const [noSitesOpen, setNoSitesOpen] = useState(false);

  const location = useLocation();
  useEffect(() => {
    const sid = (location.state as { systemId?: string } | null)?.systemId;
    if (sid) {
      const found = systems.find((s) => s.id === sid);
      if (found) { setSelectedSystemId(found.id); setActiveTab("detail"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anyFilter = !!(siteFilter || typeFilter || riskFilter || valFilter || searchQ);
  function clearFilters() { setSiteFilter(""); setTypeFilter(""); setRiskFilter(""); setValFilter(""); setSearchQ(""); }

  /* ── Computed ── */
  const highRisk = systems.filter((s) => s.riskLevel === "HIGH").length;
  const valOverdue = systems.filter((s) => s.validationStatus === "Overdue").length;
  const nonCompliant = systems.filter((s) => s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant").length;

  const filteredSystems = useMemo(() => {
    return systems.filter((s) => {
      if (siteFilter && s.siteId !== siteFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      if (riskFilter && s.riskLevel !== riskFilter) return false;
      if (valFilter && s.validationStatus !== valFilter) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.vendor.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [systems, siteFilter, typeFilter, riskFilter, valFilter, searchQ]);

  const filteredRoadmap = useMemo(() => {
    return roadmap.filter((a) => {
      if (rmSysFilter && a.systemId !== rmSysFilter) return false;
      if (rmTypeFilter && a.type !== rmTypeFilter) return false;
      if (rmStatusFilter && a.status !== rmStatusFilter) return false;
      return true;
    });
  }, [roadmap, rmSysFilter, rmTypeFilter, rmStatusFilter]);

  const roadmapGrouped = useMemo(() => {
    const groups: { system: GxPSystem; activities: RoadmapActivity[] }[] = [];
    const sysMap = new Map<string, RoadmapActivity[]>();
    filteredRoadmap.forEach((a) => {
      if (!sysMap.has(a.systemId)) sysMap.set(a.systemId, []);
      sysMap.get(a.systemId)!.push(a);
    });
    sysMap.forEach((acts, sysId) => {
      const sys = systems.find((s) => s.id === sysId);
      if (sys) groups.push({ system: sys, activities: acts.sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate))) });
    });
    return groups;
  }, [filteredRoadmap, systems]);

  /* ── Handlers ── */
  function onAddSave(data: SystemForm) {
    const id = crypto.randomUUID();
    dispatch(addSystem({ ...data, id, gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "", riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "", lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "", nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "", createdAt: "", tenantId: tenantId ?? "" }));
    auditLog({ action: "SYSTEM_ADDED", module: "csv-csa", recordId: id, newValue: data });
    setAddOpen(false); setAddedPopup(true);
  }

  function onEditSave(data: EditSystemForm) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { ...data, gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "", riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "", lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "", nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "" } }));
    auditLog({ action: "SYSTEM_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: data });
    setEditOpen(false); setEditSavedPopup(true);
  }

  function onActivitySave(data: ActivityForm) {
    const newAct: RoadmapActivity = { ...data, id: crypto.randomUUID(), startDate: dayjs(data.startDate).utc().toISOString(), endDate: dayjs(data.endDate).utc().toISOString() };
    dispatch(addActivity({ ...newAct, tenantId: tenantId ?? "" }));
    auditLog({ action: "ROADMAP_ACTIVITY_ADDED", module: "csv-csa", recordId: newAct.id, newValue: newAct });
    setAddActivityOpen(false); setActivityAddedPopup(true);
  }

  function handleSaveRiskFactors(text: string) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { riskFactors: text } }));
    auditLog({ action: "SYSTEM_RISK_FACTORS_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { riskFactors: text } });
    setRiskFactorsSaved(true);
  }

  function handleSavePlannedActions(text: string) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { plannedActions: text } }));
    auditLog({ action: "SYSTEM_PLANNED_ACTIONS_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { plannedActions: text } });
    setActionsSaved(true);
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="CSV/CSA and systems risk register" className="w-full space-y-5">
      {/* Header */}
      <PageHeader
        title="CSV/CSA &amp; Systems Risk"
        subtitle={systems.length === 0 ? "No systems registered yet" : `${systems.length} systems \u00b7 ${highRisk} high risk \u00b7 ${valOverdue} validation overdue`}
        actions={!isViewOnly ? <Button variant="primary" icon={Plus} onClick={() => { if (!hasSites) { setNoSitesOpen(true); return; } setAddOpen(true); }}>Add system</Button> : undefined}
      />

      {/* Framework banner */}
      {!showPart11 && !showAnnex11 && !showGAMP5 && (
        <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
          <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-[12px] font-medium text-[#f59e0b]">No compliance frameworks active</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Enable Part 11, Annex 11, or GAMP 5 in Settings &rarr; Frameworks to show compliance columns.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>Go to Settings</Button>
        </div>
      )}

      {/* Tabs */}
      <TabBar tabs={TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} ariaLabel="CSV/CSA sections" />

      {/* ═══════════ INVENTORY TAB ═══════════ */}
      <div role="tabpanel" id="panel-inventory" aria-labelledby="tab-inventory" tabIndex={0} hidden={activeTab !== "inventory"}>
        <SystemInventoryTab
          systems={systems} filteredSystems={filteredSystems}
          highRisk={highRisk} valOverdue={valOverdue} nonCompliant={nonCompliant}
          sites={sites} users={users} timezone={timezone} dateFormat={dateFormat}
          isDark={isDark} showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
          isViewOnly={isViewOnly} role={role}
          siteFilter={siteFilter} typeFilter={typeFilter} riskFilter={riskFilter} valFilter={valFilter} searchQ={searchQ} anyFilter={anyFilter}
          onSiteFilterChange={setSiteFilter} onTypeFilterChange={setTypeFilter} onRiskFilterChange={setRiskFilter} onValFilterChange={setValFilter} onSearchChange={setSearchQ}
          onClearFilters={clearFilters}
          onAddOpen={() => setAddOpen(true)}
          onSelectSystem={(sys) => { setSelectedSystem(sys); setActiveTab("detail"); setDetailTab("overview"); }}
          onEditSystem={(sys) => { setSelectedSystem(sys); setEditOpen(true); }}
          onRemoveSystem={(id) => { setSystemToRemove(id); setRemovePopup(true); }}
        />
      </div>

      {/* ═══════════ DETAIL TAB ═══════════ */}
      <div role="tabpanel" id="panel-detail" aria-labelledby="tab-detail" tabIndex={0} hidden={activeTab !== "detail"}>
        <SystemDetailTab
          selectedSystem={selectedSystem} systems={systems} roadmap={roadmap}
          findings={findings} capas={capas}
          sites={sites} users={users} timezone={timezone} dateFormat={dateFormat}
          isDark={isDark} isViewOnly={isViewOnly} role={role}
          showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
          detailTab={detailTab} onDetailTabChange={setDetailTab}
          onBack={() => { setSelectedSystem(null); setActiveTab("inventory"); }}
          onEdit={() => setEditOpen(true)}
          onGoToInventory={() => setActiveTab("inventory")}
          onNavigateSettings={() => navigate("/settings")}
          onNavigateGap={(fid) => navigate("/gap-assessment", { state: { openFindingId: fid } })}
          onNavigateCapa={(cid) => navigate("/capa", { state: { openCapaId: cid } })}
          onSaveRiskFactors={handleSaveRiskFactors}
          onSavePlannedActions={handleSavePlannedActions}
        />
      </div>

      {/* ═══════════ ROADMAP TAB ═══════════ */}
      <div role="tabpanel" id="panel-roadmap" aria-labelledby="tab-roadmap" tabIndex={0} hidden={activeTab !== "roadmap"}>
        <CSVRoadmapTab
          systems={systems} roadmap={roadmap} roadmapGrouped={roadmapGrouped} users={users}
          isDark={isDark} role={role}
          rmSysFilter={rmSysFilter} rmTypeFilter={rmTypeFilter} rmStatusFilter={rmStatusFilter}
          onRmSysFilterChange={setRmSysFilter} onRmTypeFilterChange={setRmTypeFilter} onRmStatusFilterChange={setRmStatusFilter}
          onClearRoadmapFilters={() => { setRmSysFilter(""); setRmTypeFilter(""); setRmStatusFilter(""); }}
          onAddActivityOpen={() => setAddActivityOpen(true)}
          onGoToInventory={() => setActiveTab("inventory")}
        />
      </div>

      {/* ── Modals ── */}
      <AddSystemModal open={addOpen} sites={sites} users={users} onSave={onAddSave} onClose={() => setAddOpen(false)} />
      <EditSystemModal open={editOpen} system={selectedSystem} sites={sites} users={users} onSave={onEditSave} onClose={() => setEditOpen(false)} />
      <AddActivityModal open={addActivityOpen} systems={systems} users={users} onSave={onActivitySave} onClose={() => setAddActivityOpen(false)} />

      {/* ── Popups ── */}
      <Popup isOpen={addedPopup} variant="success" title="System added" description="Added to the inventory. Part 11 / Annex 11 columns appear based on active frameworks in Settings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={editSavedPopup} variant="success" title="System updated" description="Changes saved to the system record." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={riskFactorsSaved} variant="success" title="Risk factors saved" description="Risk factors updated. Visible in system detail and inspector review." onDismiss={() => setRiskFactorsSaved(false)} />
      <Popup isOpen={actionsSaved} variant="success" title="Planned actions saved" description="Validation plan updated." onDismiss={() => setActionsSaved(false)} />
      <Popup isOpen={removePopup} variant="confirmation" title="Remove this system?" description="The system will be removed from the inventory. Existing findings and CAPAs are not affected." onDismiss={() => { setRemovePopup(false); setSystemToRemove(null); }} actions={[{ label: "Cancel", style: "ghost", onClick: () => { setRemovePopup(false); setSystemToRemove(null); } }, { label: "Yes, remove", style: "primary", onClick: () => { if (systemToRemove) dispatch(removeSystem(systemToRemove)); if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null); setRemovePopup(false); setSystemToRemove(null); } }]} />
      <Popup isOpen={activityAddedPopup} variant="success" title="Activity added" description="Roadmap activity added. It will appear in the system's Validation tab and CSV Roadmap timeline." onDismiss={() => setActivityAddedPopup(false)} />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="CSV / CSA" />
    </main>
  );
}
