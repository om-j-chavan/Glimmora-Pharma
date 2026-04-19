<<<<<<< HEAD
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import clsx from "clsx";
import { Database, GitBranch, Plus, Info, X, Link2 } from "lucide-react";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup, TabBar, PageHeader } from "@/components/shared";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  addSystem, updateSystem, removeSystem, addActivity, updateActivity,
  type GxPSystem, type RoadmapActivity, type ValidationStageKey, type ValidationStage,
  VALIDATION_STAGE_LABELS, VALIDATION_STAGE_KEYS,
} from "@/store/systems.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { SystemInventoryTab } from "./tabs/SystemInventoryTab";
import { SystemDetailTab } from "./tabs/SystemDetailTab";
import { CSVRoadmapTab } from "./tabs/CSVRoadmapTab";
import { RTMTab } from "./tabs/RTMTab";
import { AddSystemModal, type SystemForm } from "./modals/AddSystemModal";
import { EditSystemModal, type SystemForm as EditSystemForm } from "./modals/EditSystemModal";
import { AddActivityModal, type ActivityForm } from "./modals/AddActivityModal";

/* ── Constants ── */

type TabId = "inventory" | "roadmap" | "rtm";
type DetailTab = "overview" | "risk" | "validation" | "di";

const TABS: { id: TabId; label: string; Icon: typeof Database }[] = [
  { id: "inventory", label: "System Inventory", Icon: Database },
  { id: "roadmap", label: "CSV Roadmap", Icon: GitBranch },
  { id: "rtm", label: "RTM", Icon: Link2 },
];

/* ══════════════════════════════════════ */

export function CSVPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isViewOnly, role } = useRole();

  /* ── Redux ── */
  const { systems, roadmap, findings, capas, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { hasSites } = useSetupStatus();

  const showPart11 = frameworks.p11;
  const showAnnex11 = frameworks.annex11;
  const showGAMP5 = frameworks.gamp5;

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
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
  const [remediationSaved, setRemediationSaved] = useState(false);
  const [roadmapSynced, setRoadmapSynced] = useState("");
  const [autoRoadmapPrompt, setAutoRoadmapPrompt] = useState<{ systemId: string; stageKey: ValidationStageKey } | null>(null);

  const location = useLocation();
  useEffect(() => {
    const sid = (location.state as { systemId?: string } | null)?.systemId;
    if (sid) {
      const found = systems.find((s) => s.id === sid);
      if (found) { setSelectedSystemId(found.id); setDetailDrawerOpen(true); setDetailTab("overview"); }
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
    dispatch(addSystem({
      ...data, id,
      gxpScope: data.gxpScope ?? "",
      criticalFunctions: data.criticalFunctions ?? "",
      riskFactors: data.riskFactors ?? "",
      plannedActions: data.plannedActions ?? "",
      lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "",
      nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "",
      createdAt: "", tenantId: tenantId ?? "",
    }));
    auditLog({ action: "SYSTEM_ADDED", module: "csv-csa", recordId: id, newValue: data });
    setAddOpen(false); setAddedPopup(true);
  }

  function onEditSave(data: EditSystemForm) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: {
      name: data.name, type: data.type, vendor: data.vendor, version: data.version,
      gxpRelevance: data.gxpRelevance, riskLevel: data.riskLevel,
      part11Status: data.part11Status, annex11Status: data.annex11Status,
      gamp5Category: data.gamp5Category, validationStatus: data.validationStatus,
      patientSafetyRisk: data.patientSafetyRisk,
      productQualityImpact: data.productQualityImpact,
      regulatoryExposure: data.regulatoryExposure,
      diImpact: data.diImpact,
      siteId: data.siteId, owner: data.owner,
      intendedUse: data.intendedUse,
      gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "",
      riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "",
      lastValidated: data.lastValidated?.trim() ? dayjs(data.lastValidated).utc().toISOString() : "",
      nextReview: data.nextReview?.trim() ? dayjs(data.nextReview).utc().toISOString() : "",
    } }));
    auditLog({ action: "SYSTEM_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: data });
    setEditOpen(false); setEditSavedPopup(true);
  }

  function onActivitySave(data: ActivityForm) {
    const newAct: RoadmapActivity = { ...data, id: crypto.randomUUID(), startDate: dayjs(data.startDate).utc().toISOString(), endDate: dayjs(data.endDate).utc().toISOString(), tenantId: tenantId ?? "" };
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

  function handleSaveStage(stage: ValidationStage) {
    if (!selectedSystem) return;
    const existing = selectedSystem.validationStages ?? [];
    // Replace or append; preserve order based on VALIDATION_STAGE_KEYS
    const others = existing.filter((s) => s.key !== stage.key);
    const merged = [...others, stage];
    const ORDER = VALIDATION_STAGE_KEYS;
    merged.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

    // Auto-update validationStatus based on aggregate stage state
    const allDone = merged.length >= ORDER.length
      && merged.every((s) => s.status === "complete" || s.status === "skipped");
    const anyProgress = merged.some((s) => s.status === "complete" || s.status === "in-progress");

    const patch: Partial<GxPSystem> = { validationStages: merged };
    if (allDone) {
      patch.validationStatus = "Validated";
      patch.lastValidated = dayjs().utc().toISOString();
    } else if (anyProgress && selectedSystem.validationStatus !== "Validated") {
      patch.validationStatus = "In Progress";
    }

    dispatch(updateSystem({ id: selectedSystem.id, patch }));
    auditLog({ action: "SYSTEM_VALIDATION_STAGE_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: stage });

    // Bidirectional sync with CSV Roadmap
    if (stage.status === "complete") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (matchingActivity && matchingActivity.status !== "Complete") {
        dispatch(updateActivity({ id: matchingActivity.id, patch: { status: "Complete" } }));
        setRoadmapSynced(`${stage.key} roadmap activity marked Complete.`);
      }
    } else if (stage.status === "in-progress") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (!matchingActivity) {
        setAutoRoadmapPrompt({ systemId: selectedSystem.id, stageKey: stage.key });
      }
    }
  }

  function handleConfirmAutoRoadmap() {
    if (!autoRoadmapPrompt) return;
    const sys = systems.find((s) => s.id === autoRoadmapPrompt.systemId);
    if (!sys) { setAutoRoadmapPrompt(null); return; }
    const shortName = autoRoadmapPrompt.stageKey;
    const newAct: RoadmapActivity = {
      id: crypto.randomUUID(),
      tenantId: tenantId ?? "",
      systemId: sys.id,
      title: `${sys.name} ${shortName} execution`,
      type: shortName,
      status: "In Progress",
      startDate: dayjs().utc().toISOString(),
      endDate: dayjs().add(30, "day").utc().toISOString(),
      owner: sys.owner,
    };
    dispatch(addActivity(newAct));
    auditLog({ action: "ROADMAP_ACTIVITY_ADDED", module: "csv-csa", recordId: newAct.id, newValue: newAct });
    setAutoRoadmapPrompt(null);
    setRoadmapSynced(`${shortName} added to CSV Roadmap.`);
  }

  function handleCompleteActivity(activityId: string) {
    const activity = roadmap.find((a) => a.id === activityId);
    if (!activity) return;
    dispatch(updateActivity({ id: activityId, patch: { status: "Complete" } }));
    auditLog({ action: "ROADMAP_ACTIVITY_COMPLETED", module: "csv-csa", recordId: activityId });

    // Sync the matching validation stage
    const sys = systems.find((s) => s.id === activity.systemId);
    if (!sys) return;
    const isStageKey = (VALIDATION_STAGE_KEYS as readonly string[]).includes(activity.type);
    if (!isStageKey) return;
    const stageKey = activity.type as ValidationStageKey;
    const existing = sys.validationStages ?? [];
    const current = existing.find((s) => s.key === stageKey);
    if (current?.status === "complete") return;
    const patchedStage: ValidationStage = { ...current, key: stageKey, status: "complete", date: dayjs().utc().toISOString() };
    const merged = [...existing.filter((s) => s.key !== stageKey), patchedStage];
    merged.sort((a, b) => VALIDATION_STAGE_KEYS.indexOf(a.key) - VALIDATION_STAGE_KEYS.indexOf(b.key));
    const allDone = merged.length >= VALIDATION_STAGE_KEYS.length
      && merged.every((s) => s.status === "complete" || s.status === "skipped");
    const patch: Partial<GxPSystem> = { validationStages: merged };
    if (allDone) {
      patch.validationStatus = "Validated";
      patch.lastValidated = dayjs().utc().toISOString();
    }
    dispatch(updateSystem({ id: sys.id, patch }));
    setRoadmapSynced(`${VALIDATION_STAGE_LABELS[stageKey]} stage marked Complete in Validation.`);
  }

  function handleSaveNextReview(iso: string) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { nextReview: iso } }));
    auditLog({ action: "SYSTEM_NEXT_REVIEW_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { nextReview: iso } });
  }

  function handleSaveRiskClassification(patch: import("@/modules/csv-csa/detail/RiskControlsPanel").RiskClassificationPatch) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch }));
    auditLog({ action: "SYSTEM_RISK_CLASSIFICATION_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: patch });
  }

  function handleSaveRemediation(patch: { remediationTargetDate?: string; remediationNotes?: string }) {
    if (!selectedSystem) return;
    const normalized = {
      remediationTargetDate: patch.remediationTargetDate?.trim() ? dayjs(patch.remediationTargetDate).utc().toISOString() : undefined,
      remediationNotes: patch.remediationNotes?.trim() || undefined,
    };
    dispatch(updateSystem({ id: selectedSystem.id, patch: normalized }));
    auditLog({ action: "SYSTEM_REMEDIATION_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: normalized });
    setRemediationSaved(true);
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
          onSelectSystem={(sys) => { setSelectedSystem(sys); setDetailDrawerOpen(true); setDetailTab("overview"); }}
          onEditSystem={(sys) => { setSelectedSystem(sys); setEditOpen(true); }}
          onRemoveSystem={(id) => { setSystemToRemove(id); setRemovePopup(true); }}
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
          onCompleteActivity={handleCompleteActivity}
        />
      </div>

      {/* ═══ RTM TAB ═══ */}
      <div role="tabpanel" id="panel-rtm" aria-labelledby="tab-rtm" tabIndex={0} hidden={activeTab !== "rtm"}>
        <RTMTab isDark={isDark} />
      </div>

      {/* ═══════════ SYSTEM DETAIL DRAWER ═══════════ */}
      {detailDrawerOpen && selectedSystem && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedSystem.name} detail`}
          onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          {/* Drawer panel — slides in from right */}
          <div
            className="relative ml-auto w-full max-w-[720px] h-full flex flex-col shadow-2xl animate-[popupIn_0.2s_ease-out]"
            style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--bg-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
              aria-label="Close system detail"
              className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150 z-10"
            >
              <X className="w-4 h-4 text-(--text-muted)" aria-hidden="true" />
            </button>
            {/* Drawer content — scrollable */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] mb-3">
                <button
                  type="button"
                  onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                  className="bg-transparent border-none cursor-pointer p-0 hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                >
                  CSV / CSA
                </button>
                <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>&rsaquo;</span>
                <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{selectedSystem.name}</span>
              </nav>
              <SystemDetailTab
                selectedSystem={selectedSystem} systems={systems} roadmap={roadmap}
                findings={findings} capas={capas}
                sites={sites} users={users} timezone={timezone} dateFormat={dateFormat}
                isDark={isDark} isViewOnly={isViewOnly} role={role}
                showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
                detailTab={detailTab} onDetailTabChange={setDetailTab}
                onBack={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onEdit={() => setEditOpen(true)}
                onGoToInventory={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onNavigateSettings={() => navigate("/settings")}
                onNavigateGap={(fid) => navigate("/gap-assessment", { state: { openFindingId: fid } })}
                onNavigateCapa={(cid) => navigate("/capa", { state: { openCapaId: cid } })}
                onSaveRemediation={handleSaveRemediation}
                onSaveRiskFactors={handleSaveRiskFactors}
                onSavePlannedActions={handleSavePlannedActions}
                onSaveStage={handleSaveStage}
                onSaveNextReview={handleSaveNextReview}
                onSaveRiskClassification={handleSaveRiskClassification}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <AddSystemModal open={addOpen} sites={sites} users={complianceUsers} onSave={onAddSave} onClose={() => setAddOpen(false)} lockedSiteId={selectedSiteId} />
      <EditSystemModal open={editOpen} system={selectedSystem} sites={sites} users={complianceUsers} onSave={onEditSave} onClose={() => setEditOpen(false)} />
      <AddActivityModal open={addActivityOpen} systems={systems} users={users} onSave={onActivitySave} onClose={() => setAddActivityOpen(false)} />

      {/* ── Popups ── */}
      <Popup isOpen={addedPopup} variant="success" title="System added" description="Added to the inventory. Part 11 / Annex 11 columns appear based on active frameworks in Settings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={editSavedPopup} variant="success" title="System updated" description="Changes saved to the system record." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={riskFactorsSaved} variant="success" title="Risk factors saved" description="Risk factors updated. Visible in system detail and inspector review." onDismiss={() => setRiskFactorsSaved(false)} />
      <Popup isOpen={actionsSaved} variant="success" title="Planned actions saved" description="Validation plan updated." onDismiss={() => setActionsSaved(false)} />
      <Popup isOpen={removePopup} variant="confirmation" title="Remove this system?" description="The system will be removed from the inventory. Existing findings and CAPAs are not affected." onDismiss={() => { setRemovePopup(false); setSystemToRemove(null); }} actions={[{ label: "Cancel", style: "ghost", onClick: () => { setRemovePopup(false); setSystemToRemove(null); } }, { label: "Yes, remove", style: "primary", onClick: () => { if (systemToRemove) dispatch(removeSystem(systemToRemove)); if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null); setRemovePopup(false); setSystemToRemove(null); } }]} />
      <Popup isOpen={activityAddedPopup} variant="success" title="Activity added" description="Roadmap activity added. It will appear in the system's Validation tab and CSV Roadmap timeline." onDismiss={() => setActivityAddedPopup(false)} />
      <Popup isOpen={remediationSaved} variant="success" title="Remediation details saved" description="Visible in the DI &amp; Audit Trail tab and inspector review." onDismiss={() => setRemediationSaved(false)} />
      <Popup isOpen={!!roadmapSynced} variant="success" title="Roadmap synced" description={roadmapSynced} onDismiss={() => setRoadmapSynced("")} />
      <Popup
        isOpen={!!autoRoadmapPrompt}
        variant="confirmation"
        title={autoRoadmapPrompt ? `Add ${autoRoadmapPrompt.stageKey} to CSV Roadmap?` : ""}
        description={autoRoadmapPrompt ? `Create a roadmap activity for ${VALIDATION_STAGE_LABELS[autoRoadmapPrompt.stageKey]} so it shows up in the validation schedule.` : ""}
        onDismiss={() => setAutoRoadmapPrompt(null)}
        actions={[
          { label: "Skip", style: "ghost", onClick: () => setAutoRoadmapPrompt(null) },
          { label: "Add to roadmap", style: "primary", onClick: handleConfirmAutoRoadmap },
        ]}
      />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="CSV / CSA" />
    </main>
  );
}
=======
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import clsx from "clsx";
import { Database, GitBranch, Plus, Info, X } from "lucide-react";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup, TabBar, PageHeader } from "@/components/shared";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  addSystem, updateSystem, removeSystem, addActivity, updateActivity,
  type GxPSystem, type RoadmapActivity, type ValidationStageKey, type ValidationStage,
  VALIDATION_STAGE_LABELS, VALIDATION_STAGE_KEYS,
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

type TabId = "inventory" | "roadmap";
type DetailTab = "overview" | "risk" | "validation" | "di";

const TABS: { id: TabId; label: string; Icon: typeof Database }[] = [
  { id: "inventory", label: "System Inventory", Icon: Database },
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
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const frameworks = useAppSelector((s) => s.settings.frameworks);  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { hasSites } = useSetupStatus();

  const showPart11 = frameworks.p11;
  const showAnnex11 = frameworks.annex11;
  const showGAMP5 = frameworks.gamp5;

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
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
  const [remediationSaved, setRemediationSaved] = useState(false);
  const [roadmapSynced, setRoadmapSynced] = useState("");
  const [autoRoadmapPrompt, setAutoRoadmapPrompt] = useState<{ systemId: string; stageKey: ValidationStageKey } | null>(null);

  const location = useLocation();
  useEffect(() => {
    const sid = (location.state as { systemId?: string } | null)?.systemId;
    if (sid) {
      const found = systems.find((s) => s.id === sid);
      if (found) { setSelectedSystemId(found.id); setDetailDrawerOpen(true); setDetailTab("overview"); }
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
    dispatch(addSystem({
      ...data, id,
      gxpScope: data.gxpScope ?? "",
      criticalFunctions: data.criticalFunctions ?? "",
      riskFactors: data.riskFactors ?? "",
      plannedActions: data.plannedActions ?? "",
      lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "",
      nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "",
      createdAt: "", tenantId: tenantId ?? "",
    }));
    auditLog({ action: "SYSTEM_ADDED", module: "csv-csa", recordId: id, newValue: data });
    setAddOpen(false); setAddedPopup(true);
  }

  function onEditSave(data: EditSystemForm) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: {
      name: data.name, type: data.type, vendor: data.vendor, version: data.version,
      gxpRelevance: data.gxpRelevance, riskLevel: data.riskLevel,
      part11Status: data.part11Status, annex11Status: data.annex11Status,
      gamp5Category: data.gamp5Category, validationStatus: data.validationStatus,
      patientSafetyRisk: data.patientSafetyRisk,
      productQualityImpact: data.productQualityImpact,
      regulatoryExposure: data.regulatoryExposure,
      diImpact: data.diImpact,
      siteId: data.siteId, owner: data.owner,
      intendedUse: data.intendedUse,
      gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "",
      riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "",
      lastValidated: data.lastValidated?.trim() ? dayjs(data.lastValidated).utc().toISOString() : "",
      nextReview: data.nextReview?.trim() ? dayjs(data.nextReview).utc().toISOString() : "",
    } }));
    auditLog({ action: "SYSTEM_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: data });
    setEditOpen(false); setEditSavedPopup(true);
  }

  function onActivitySave(data: ActivityForm) {
    const newAct: RoadmapActivity = { ...data, id: crypto.randomUUID(), startDate: dayjs(data.startDate).utc().toISOString(), endDate: dayjs(data.endDate).utc().toISOString(), tenantId: tenantId ?? "" };
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

  function handleSaveStage(stage: ValidationStage) {
    if (!selectedSystem) return;
    const existing = selectedSystem.validationStages ?? [];
    // Replace or append; preserve order based on VALIDATION_STAGE_KEYS
    const others = existing.filter((s) => s.key !== stage.key);
    const merged = [...others, stage];
    const ORDER = VALIDATION_STAGE_KEYS;
    merged.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

    // Auto-update validationStatus based on aggregate stage state
    const allDone = merged.length >= ORDER.length
      && merged.every((s) => s.status === "complete" || s.status === "skipped");
    const anyProgress = merged.some((s) => s.status === "complete" || s.status === "in-progress");

    const patch: Partial<GxPSystem> = { validationStages: merged };
    if (allDone) {
      patch.validationStatus = "Validated";
      patch.lastValidated = dayjs().utc().toISOString();
    } else if (anyProgress && selectedSystem.validationStatus !== "Validated") {
      patch.validationStatus = "In Progress";
    }

    dispatch(updateSystem({ id: selectedSystem.id, patch }));
    auditLog({ action: "SYSTEM_VALIDATION_STAGE_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: stage });

    // Bidirectional sync with CSV Roadmap
    if (stage.status === "complete") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (matchingActivity && matchingActivity.status !== "Complete") {
        dispatch(updateActivity({ id: matchingActivity.id, patch: { status: "Complete" } }));
        setRoadmapSynced(`${stage.key} roadmap activity marked Complete.`);
      }
    } else if (stage.status === "in-progress") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (!matchingActivity) {
        setAutoRoadmapPrompt({ systemId: selectedSystem.id, stageKey: stage.key });
      }
    }
  }

  function handleConfirmAutoRoadmap() {
    if (!autoRoadmapPrompt) return;
    const sys = systems.find((s) => s.id === autoRoadmapPrompt.systemId);
    if (!sys) { setAutoRoadmapPrompt(null); return; }
    const shortName = autoRoadmapPrompt.stageKey;
    const newAct: RoadmapActivity = {
      id: crypto.randomUUID(),
      tenantId: tenantId ?? "",
      systemId: sys.id,
      title: `${sys.name} ${shortName} execution`,
      type: shortName,
      status: "In Progress",
      startDate: dayjs().utc().toISOString(),
      endDate: dayjs().add(30, "day").utc().toISOString(),
      owner: sys.owner,
    };
    dispatch(addActivity(newAct));
    auditLog({ action: "ROADMAP_ACTIVITY_ADDED", module: "csv-csa", recordId: newAct.id, newValue: newAct });
    setAutoRoadmapPrompt(null);
    setRoadmapSynced(`${shortName} added to CSV Roadmap.`);
  }

  function handleCompleteActivity(activityId: string) {
    const activity = roadmap.find((a) => a.id === activityId);
    if (!activity) return;
    dispatch(updateActivity({ id: activityId, patch: { status: "Complete" } }));
    auditLog({ action: "ROADMAP_ACTIVITY_COMPLETED", module: "csv-csa", recordId: activityId });

    // Sync the matching validation stage
    const sys = systems.find((s) => s.id === activity.systemId);
    if (!sys) return;
    const isStageKey = (VALIDATION_STAGE_KEYS as readonly string[]).includes(activity.type);
    if (!isStageKey) return;
    const stageKey = activity.type as ValidationStageKey;
    const existing = sys.validationStages ?? [];
    const current = existing.find((s) => s.key === stageKey);
    if (current?.status === "complete") return;
    const patchedStage: ValidationStage = { ...current, key: stageKey, status: "complete", date: dayjs().utc().toISOString() };
    const merged = [...existing.filter((s) => s.key !== stageKey), patchedStage];
    merged.sort((a, b) => VALIDATION_STAGE_KEYS.indexOf(a.key) - VALIDATION_STAGE_KEYS.indexOf(b.key));
    const allDone = merged.length >= VALIDATION_STAGE_KEYS.length
      && merged.every((s) => s.status === "complete" || s.status === "skipped");
    const patch: Partial<GxPSystem> = { validationStages: merged };
    if (allDone) {
      patch.validationStatus = "Validated";
      patch.lastValidated = dayjs().utc().toISOString();
    }
    dispatch(updateSystem({ id: sys.id, patch }));
    setRoadmapSynced(`${VALIDATION_STAGE_LABELS[stageKey]} stage marked Complete in Validation.`);
  }

  function handleSaveNextReview(iso: string) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { nextReview: iso } }));
    auditLog({ action: "SYSTEM_NEXT_REVIEW_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { nextReview: iso } });
  }

  function handleSaveRiskClassification(patch: import("@/modules/csv-csa/detail/RiskControlsPanel").RiskClassificationPatch) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch }));
    auditLog({ action: "SYSTEM_RISK_CLASSIFICATION_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: patch });
  }

  function handleSaveRemediation(patch: { remediationTargetDate?: string; remediationNotes?: string }) {
    if (!selectedSystem) return;
    const normalized = {
      remediationTargetDate: patch.remediationTargetDate?.trim() ? dayjs(patch.remediationTargetDate).utc().toISOString() : undefined,
      remediationNotes: patch.remediationNotes?.trim() || undefined,
    };
    dispatch(updateSystem({ id: selectedSystem.id, patch: normalized }));
    auditLog({ action: "SYSTEM_REMEDIATION_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: normalized });
    setRemediationSaved(true);
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
        <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", "bg-(--warning-bg) border-(--warning)")}>
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
          sites={sites} users={users} timezone={timezone} dateFormat={dateFormat} showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
          isViewOnly={isViewOnly} role={role}
          siteFilter={siteFilter} typeFilter={typeFilter} riskFilter={riskFilter} valFilter={valFilter} searchQ={searchQ} anyFilter={anyFilter}
          onSiteFilterChange={setSiteFilter} onTypeFilterChange={setTypeFilter} onRiskFilterChange={setRiskFilter} onValFilterChange={setValFilter} onSearchChange={setSearchQ}
          onClearFilters={clearFilters}
          onAddOpen={() => setAddOpen(true)}
          onSelectSystem={(sys) => { setSelectedSystem(sys); setDetailDrawerOpen(true); setDetailTab("overview"); }}
          onEditSystem={(sys) => { setSelectedSystem(sys); setEditOpen(true); }}
          onRemoveSystem={(id) => { setSystemToRemove(id); setRemovePopup(true); }}
        />
      </div>

      {/* ═══════════ ROADMAP TAB ═══════════ */}
      <div role="tabpanel" id="panel-roadmap" aria-labelledby="tab-roadmap" tabIndex={0} hidden={activeTab !== "roadmap"}>
        <CSVRoadmapTab
          systems={systems} roadmap={roadmap} roadmapGrouped={roadmapGrouped} users={users} role={role}
          rmSysFilter={rmSysFilter} rmTypeFilter={rmTypeFilter} rmStatusFilter={rmStatusFilter}
          onRmSysFilterChange={setRmSysFilter} onRmTypeFilterChange={setRmTypeFilter} onRmStatusFilterChange={setRmStatusFilter}
          onClearRoadmapFilters={() => { setRmSysFilter(""); setRmTypeFilter(""); setRmStatusFilter(""); }}
          onAddActivityOpen={() => setAddActivityOpen(true)}
          onGoToInventory={() => setActiveTab("inventory")}
          onCompleteActivity={handleCompleteActivity}
        />
      </div>

      {/* ═══════════ SYSTEM DETAIL DRAWER ═══════════ */}
      {detailDrawerOpen && selectedSystem && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedSystem.name} detail`}
          onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          {/* Drawer panel — slides in from right */}
          <div
            className="relative ml-auto w-full max-w-[720px] h-full flex flex-col shadow-2xl animate-[popupIn_0.2s_ease-out]"
            style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--bg-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
              aria-label="Close system detail"
              className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150 z-10"
            >
              <X className="w-4 h-4 text-(--text-muted)" aria-hidden="true" />
            </button>
            {/* Drawer content — scrollable */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Breadcrumb */}
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] mb-3">
                <button
                  type="button"
                  onClick={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                  className="bg-transparent border-none cursor-pointer p-0 hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                >
                  CSV / CSA
                </button>
                <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>&rsaquo;</span>
                <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{selectedSystem.name}</span>
              </nav>
              <SystemDetailTab
                selectedSystem={selectedSystem} systems={systems} roadmap={roadmap}
                findings={findings as any} capas={capas as any}
                sites={sites} users={users} timezone={timezone} dateFormat={dateFormat} isViewOnly={isViewOnly} role={role}
                showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
                detailTab={detailTab} onDetailTabChange={setDetailTab}
                onBack={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onEdit={() => setEditOpen(true)}
                onGoToInventory={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onNavigateSettings={() => navigate("/settings")}
                onNavigateGap={(fid) => navigate("/gap-assessment", { state: { openFindingId: fid } })}
                onNavigateCapa={(cid) => navigate("/capa", { state: { openCapaId: cid } })}
                onSaveRemediation={handleSaveRemediation}
                onSaveRiskFactors={handleSaveRiskFactors}
                onSavePlannedActions={handleSavePlannedActions}
                onSaveStage={handleSaveStage}
                onSaveNextReview={handleSaveNextReview}
                onSaveRiskClassification={handleSaveRiskClassification}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <AddSystemModal open={addOpen} sites={sites} users={complianceUsers} onSave={onAddSave} onClose={() => setAddOpen(false)} lockedSiteId={selectedSiteId} />
      <EditSystemModal open={editOpen} system={selectedSystem} sites={sites} users={complianceUsers} onSave={onEditSave} onClose={() => setEditOpen(false)} />
      <AddActivityModal open={addActivityOpen} systems={systems} users={users} onSave={onActivitySave} onClose={() => setAddActivityOpen(false)} />

      {/* ── Popups ── */}
      <Popup isOpen={addedPopup} variant="success" title="System added" description="Added to the inventory. Part 11 / Annex 11 columns appear based on active frameworks in Settings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={editSavedPopup} variant="success" title="System updated" description="Changes saved to the system record." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={riskFactorsSaved} variant="success" title="Risk factors saved" description="Risk factors updated. Visible in system detail and inspector review." onDismiss={() => setRiskFactorsSaved(false)} />
      <Popup isOpen={actionsSaved} variant="success" title="Planned actions saved" description="Validation plan updated." onDismiss={() => setActionsSaved(false)} />
      <Popup isOpen={removePopup} variant="confirmation" title="Remove this system?" description="The system will be removed from the inventory. Existing findings and CAPAs are not affected." onDismiss={() => { setRemovePopup(false); setSystemToRemove(null); }} actions={[{ label: "Cancel", style: "ghost", onClick: () => { setRemovePopup(false); setSystemToRemove(null); } }, { label: "Yes, remove", style: "primary", onClick: () => { if (systemToRemove) dispatch(removeSystem(systemToRemove)); if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null); setRemovePopup(false); setSystemToRemove(null); } }]} />
      <Popup isOpen={activityAddedPopup} variant="success" title="Activity added" description="Roadmap activity added. It will appear in the system's Validation tab and CSV Roadmap timeline." onDismiss={() => setActivityAddedPopup(false)} />
      <Popup isOpen={remediationSaved} variant="success" title="Remediation details saved" description="Visible in the DI &amp; Audit Trail tab and inspector review." onDismiss={() => setRemediationSaved(false)} />
      <Popup isOpen={!!roadmapSynced} variant="success" title="Roadmap synced" description={roadmapSynced} onDismiss={() => setRoadmapSynced("")} />
      <Popup
        isOpen={!!autoRoadmapPrompt}
        variant="confirmation"
        title={autoRoadmapPrompt ? `Add ${autoRoadmapPrompt.stageKey} to CSV Roadmap?` : ""}
        description={autoRoadmapPrompt ? `Create a roadmap activity for ${VALIDATION_STAGE_LABELS[autoRoadmapPrompt.stageKey]} so it shows up in the validation schedule.` : ""}
        onDismiss={() => setAutoRoadmapPrompt(null)}
        actions={[
          { label: "Skip", style: "ghost", onClick: () => setAutoRoadmapPrompt(null) },
          { label: "Add to roadmap", style: "primary", onClick: handleConfirmAutoRoadmap },
        ]}
      />
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="CSV / CSA" />
    </main>
  );
}
>>>>>>> 21ab890b6aefc93457f3a82fd19e6298bb7a5a7d
