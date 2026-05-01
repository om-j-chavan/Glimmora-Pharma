"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type {
  GxPSystem as PrismaGxPSystem,
  ValidationStage as PrismaValidationStage,
  RTMEntry as PrismaRTMEntry,
  RoadmapActivity as PrismaRoadmapActivity,
} from "@prisma/client";
import { Database, GitBranch, Plus, Info, X, Link2 } from "lucide-react";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup, TabBar, PageHeader } from "@/components/shared";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  createSystem,
  updateSystem as updateSystemServer,
  deleteSystem as deleteSystemServer,
  addRoadmapActivity,
  updateRoadmapActivity,
} from "@/actions/systems";
import type { GxPSystem, RoadmapActivity, ValidationStageKey, ValidationStage } from "@/types/csv-csa";
import { VALIDATION_STAGE_LABELS, VALIDATION_STAGE_KEYS, adaptPrismaSystem, adaptPrismaRoadmap, adaptPrismaRTM } from "@/types/csv-csa";
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

/* ── Server Component props ── */

type PrismaSystemWithRelations = PrismaGxPSystem & {
  validationStages: PrismaValidationStage[];
  rtmEntries: PrismaRTMEntry[];
  roadmapActivities: PrismaRoadmapActivity[];
};

export interface CSVPageStats {
  total: number;
  validated: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  auditTrailEnabled: number;
}

export interface CSVPageRTMStats {
  total: number;
  complete: number;
  partial: number;
  broken: number;
}

export interface CSVPageProps {
  /** Server-fetched GxP systems (with stages/RTM/roadmap relations). */
  systems: PrismaSystemWithRelations[];
  /** Server-computed system stats for KPI surface. */
  stats: CSVPageStats;
  /** Server-computed RTM traceability stats. */
  rtmStats: CSVPageRTMStats;
}

/* ══════════════════════════════════════ */

export function CSVPage(props: CSVPageProps = { systems: [], stats: { total: 0, validated: 0, inProgress: 0, notStarted: 0, overdue: 0, auditTrailEnabled: 0 }, rtmStats: { total: 0, complete: 0, partial: 0, broken: 0 } }) {
  const router = useRouter();
  const { isViewOnly, role } = useRole();

  /* ── Server-fetched systems → adapted to slice shape ──
   * The page is built around the slice's richer `GxPSystem`
   * type; we adapt Prisma rows once, then everything downstream
   * (filters, KPIs, child tabs) keeps working unchanged.
   * `findings`/`capas` still come from useTenantData (now empty
   * Redux — they degrade gracefully). `tenantId` from session.
   */
  const systems = useMemo(() => props.systems.map(adaptPrismaSystem), [props.systems]);
  const roadmap = useMemo(() => adaptPrismaRoadmap(props.systems), [props.systems]);
  const rtmEntries = useMemo(() => adaptPrismaRTM(props.systems), [props.systems]);
  const { findings, capas } = useTenantData();
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

  useEffect(() => {
    const sid = null /*migration: location.state removed*/;
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
  async function onAddSave(data: SystemForm) {
    const result = await createSystem({
      name: data.name,
      type: data.type,
      vendor: data.vendor,
      version: data.version,
      gxpRelevance: data.gxpRelevance,
      gamp5Category: data.gamp5Category,
      riskLevel: data.riskLevel,
      siteId: data.siteId,
      intendedUse: data.intendedUse,
      gxpScope: data.gxpScope ?? "",
      owner: data.owner,
    });
    if (!result.success) {
      console.error("[csv-csa] createSystem failed:", result.error);
      return;
    }
    setAddOpen(false);
    setAddedPopup(true);
    router.refresh();
  }

  async function onEditSave(data: EditSystemForm) {
    if (!selectedSystem) return;
    // Server action accepts only Prisma columns; the slice's richer
    // patch fields (criticalFunctions / riskFactors / lastValidated /
    // nextReview / patient/product/regulatory/DI risk classifications)
    // have no schema columns yet — they're dropped here. Schema can be
    // extended in a follow-up to persist them.
    const result = await updateSystemServer(selectedSystem.id, {
      name: data.name,
      type: data.type,
      vendor: data.vendor,
      version: data.version,
      gxpRelevance: data.gxpRelevance,
      gamp5Category: data.gamp5Category,
      riskLevel: data.riskLevel,
      siteId: data.siteId,
      intendedUse: data.intendedUse,
      gxpScope: data.gxpScope ?? "",
      owner: data.owner,
    });
    if (!result.success) {
      console.error("[csv-csa] updateSystem failed:", result.error);
      return;
    }
    setEditOpen(false);
    setEditSavedPopup(true);
    router.refresh();
  }

  async function onActivitySave(data: ActivityForm) {
    const result = await addRoadmapActivity({
      systemId: data.systemId,
      title: data.title,
      type: data.type,
      owner: data.owner,
      // completionType is not collected by AddActivityModal today; omit until the Zod schema gains the field.
      startDate: data.startDate ? dayjs(data.startDate).utc().toISOString() : undefined,
      endDate: data.endDate ? dayjs(data.endDate).utc().toISOString() : undefined,
    });
    if (!result.success) {
      console.error("[csv-csa] addRoadmapActivity failed:", result.error);
      return;
    }
    setAddActivityOpen(false);
    setActivityAddedPopup(true);
    router.refresh();
  }

  function handleSaveRiskFactors(text: string) {
    if (!selectedSystem) return;
    // `riskFactors` not in Prisma schema — UI-only state until schema
    // is extended. Audit log preserves the action.
    auditLog({ action: "SYSTEM_RISK_FACTORS_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { riskFactors: text } });
    setRiskFactorsSaved(true);
  }

  async function handleSavePlannedActions(text: string) {
    if (!selectedSystem) return;
    const result = await updateSystemServer(selectedSystem.id, { plannedActions: text });
    if (!result.success) {
      console.error("[csv-csa] updateSystem (plannedActions) failed:", result.error);
      return;
    }
    setActionsSaved(true);
    router.refresh();
  }

  async function handleSaveStage(stage: ValidationStage) {
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

    // `validationStages` (nested array) and `lastValidated` are slice-only
    // — neither persists. The aggregate `validationStatus` IS in Prisma so
    // we sync that via the server action when the per-stage server actions
    // (submitStageForReview/approveStage etc.) haven't already.
    if (allDone || (anyProgress && selectedSystem.validationStatus !== "Validated")) {
      const newStatus = allDone ? "Validated" : "In Progress";
      if (selectedSystem.validationStatus !== newStatus) {
        await updateSystemServer(selectedSystem.id, { validationStatus: newStatus });
      }
    }
    auditLog({ action: "SYSTEM_VALIDATION_STAGE_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: stage });

    // Bidirectional sync with CSV Roadmap
    if (stage.status === "complete") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (matchingActivity && matchingActivity.status !== "Complete") {
        await updateRoadmapActivity(matchingActivity.id, "Complete");
        setRoadmapSynced(`${stage.key} roadmap activity marked Complete.`);
        router.refresh();
      }
    } else if (stage.status === "in-progress") {
      const matchingActivity = roadmap.find((a) => a.systemId === selectedSystem.id && a.type === stage.key);
      if (!matchingActivity) {
        setAutoRoadmapPrompt({ systemId: selectedSystem.id, stageKey: stage.key });
      }
    }
  }

  async function handleConfirmAutoRoadmap() {
    if (!autoRoadmapPrompt) return;
    const sys = systems.find((s) => s.id === autoRoadmapPrompt.systemId);
    if (!sys) { setAutoRoadmapPrompt(null); return; }
    const shortName = autoRoadmapPrompt.stageKey;
    const result = await addRoadmapActivity({
      systemId: sys.id,
      title: `${sys.name} ${shortName} execution`,
      type: shortName,
      startDate: dayjs().utc().toISOString(),
      endDate: dayjs().add(30, "day").utc().toISOString(),
      owner: sys.owner,
    });
    if (!result.success) {
      console.error("[csv-csa] addRoadmapActivity failed:", result.error);
      return;
    }
    setAutoRoadmapPrompt(null);
    setRoadmapSynced(`${shortName} added to CSV Roadmap.`);
    router.refresh();
  }

  async function handleCompleteActivity(activityId: string) {
    const activity = roadmap.find((a) => a.id === activityId);
    if (!activity) return;
    const result = await updateRoadmapActivity(activityId, "Complete");
    if (!result.success) {
      console.error("[csv-csa] updateRoadmapActivity failed:", result.error);
      return;
    }
    // Stage-side sync of validation status (validationStatus is in Prisma;
    // validationStages is a slice-only nested field — not persistable via
    // this server action, so just nudge `validationStatus` if appropriate
    // and let the next server fetch reconcile derived fields).
    const sys = systems.find((s) => s.id === activity.systemId);
    if (sys) {
      const isStageKey = (VALIDATION_STAGE_KEYS as readonly string[]).includes(activity.type);
      if (isStageKey) {
        const stageKey = activity.type as ValidationStageKey;
        setRoadmapSynced(`${VALIDATION_STAGE_LABELS[stageKey]} stage marked Complete in Validation.`);
      }
    }
    router.refresh();
  }

  function handleSaveNextReview(iso: string) {
    if (!selectedSystem) return;
    // `nextReview` not in Prisma schema — UI-only state. Audit log preserved.
    auditLog({ action: "SYSTEM_NEXT_REVIEW_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { nextReview: iso } });
  }

  function handleSaveRiskClassification(patch: import("@/modules/csv-csa/detail/RiskControlsPanel").RiskClassificationPatch) {
    if (!selectedSystem) return;
    // patientSafetyRisk / productQualityImpact / regulatoryExposure / diImpact
    // are not in the Prisma schema — UI-only state. Audit log preserved.
    auditLog({ action: "SYSTEM_RISK_CLASSIFICATION_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: patch });
  }

  function handleSaveRemediation(patch: { remediationTargetDate?: string; remediationNotes?: string }) {
    if (!selectedSystem) return;
    // remediationTargetDate / remediationNotes are not in the Prisma
    // schema — UI-only state. Audit log preserved.
    const normalized = {
      remediationTargetDate: patch.remediationTargetDate?.trim() ? dayjs(patch.remediationTargetDate).utc().toISOString() : undefined,
      remediationNotes: patch.remediationNotes?.trim() || undefined,
    };
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
          <Button variant="ghost" size="sm" onClick={() => router.push("/settings")}>Go to Settings</Button>
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
          showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
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
          role={role}
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
        <RTMTab entries={rtmEntries} systemsOverride={systems} />
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
                sites={sites} users={users} timezone={timezone} dateFormat={dateFormat} isViewOnly={isViewOnly} role={role}
                showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
                detailTab={detailTab} onDetailTabChange={setDetailTab}
                onBack={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onEdit={() => setEditOpen(true)}
                onGoToInventory={() => { setDetailDrawerOpen(false); setSelectedSystem(null); }}
                onNavigateSettings={() => router.push("/settings")}
                onNavigateGap={() => router.push("/gap-assessment")}
                onNavigateCapa={() => router.push("/capa")}
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
      <Popup isOpen={removePopup} variant="confirmation" title="Remove this system?" description="The system will be removed from the inventory. Existing findings and CAPAs are not affected." onDismiss={() => { setRemovePopup(false); setSystemToRemove(null); }} actions={[{ label: "Cancel", style: "ghost", onClick: () => { setRemovePopup(false); setSystemToRemove(null); } }, { label: "Yes, remove", style: "primary", onClick: async () => { if (systemToRemove) { const r = await deleteSystemServer(systemToRemove); if (!r.success) console.error("[csv-csa] deleteSystem failed:", r.error); } if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null); setRemovePopup(false); setSystemToRemove(null); router.refresh(); } }]} />
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
