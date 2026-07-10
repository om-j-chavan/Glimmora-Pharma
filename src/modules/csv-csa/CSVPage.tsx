"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Database, GitBranch, Plus, Info, Link2, Archive, RotateCcw } from "lucide-react";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { NoSitesPopup, TabBar, DataTable, type Column } from "@/components/shared";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  createSystem,
  updateSystem as updateSystemServer,
  deleteSystem as deleteSystemServer,
  restoreSystem as restoreSystemServer,
  addRoadmapActivity,
  updateRoadmapActivity,
} from "@/actions/systems";
import type { GxPSystem, RoadmapActivity, ValidationStageKey, SystemFromPrisma } from "@/types/csv-csa";
import { VALIDATION_STAGE_LABELS, VALIDATION_STAGE_KEYS, adaptPrismaSystem, adaptPrismaRoadmap, adaptPrismaRTM } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import { SystemInventoryTab } from "./tabs/SystemInventoryTab";
import { CSVRoadmapTab } from "./tabs/CSVRoadmapTab";
import { RTMTab } from "./tabs/RTMTab";
import { displayUserName } from "@/lib/identity-display";
import { AddSystemModal, type SystemForm } from "./modals/AddSystemModal";
import { EditSystemModal, type SystemForm as EditSystemForm } from "./modals/EditSystemModal";
import { AddActivityModal, type ActivityForm } from "./modals/AddActivityModal";
import { DriftDetectionPanel } from "./DriftDetectionPanel";

/* ── Constants ── */

type TabId = "inventory" | "roadmap" | "rtm";
const TABS: { id: TabId; label: string; Icon: typeof Database }[] = [
  { id: "inventory", label: "System Inventory", Icon: Database },
  { id: "roadmap", label: "CSV Roadmap", Icon: GitBranch },
  { id: "rtm", label: "RTM", Icon: Link2 },
];

/* ── Server Component props ── */

// Server Component prop type — was previously a local duplicate of the
// canonical SystemFromPrisma in @/types/csv-csa. Removed in favour of the
// imported type so the StageDocument relation flows through automatically
// when the read-path query includes it (substage stage-document feature).
type PrismaSystemWithRelations = SystemFromPrisma;

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
  /** RUNG 3B — soft-deleted systems for the admin archive view. Empty [] for
   *  non-admins (the route only fetches them for customer_admin/super_admin). */
  deletedSystems: PrismaSystemWithRelations[];
  /** Server-computed system stats for KPI surface. */
  stats: CSVPageStats;
  /** Server-computed RTM traceability stats. */
  rtmStats: CSVPageRTMStats;
}

/* ══════════════════════════════════════ */

export function CSVPage(props: CSVPageProps = { systems: [], deletedSystems: [], stats: { total: 0, validated: 0, inProgress: 0, notStarted: 0, overdue: 0, auditTrailEnabled: 0 }, rtmStats: { total: 0, complete: 0, partial: 0, broken: 0 } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isViewOnly, role, isSuperAdmin, isCustomerAdmin } = useRole();
  const isAdmin = isSuperAdmin || isCustomerAdmin;
  // RUNG 3B — admin-only archive view at /csv-csa?view=deleted.
  const showArchive = (searchParams?.get("view") ?? null) === "deleted" && isAdmin;

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
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  // Effective enabled frameworks for this tenant (server-resolved, non-persisted).
  const frameworkList = useAppSelector((s) => s.frameworks.list);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { hasSites } = useSetupStatus();

  const hasFramework = (key: string) => frameworkList.some((f) => f.key === key);
  const showPart11 = hasFramework("p11");
  const showAnnex11 = hasFramework("annex11");
  const showGAMP5 = hasFramework("gamp5");

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  // selectedSystem is retained only for the inventory Edit button → EditSystemModal.
  // Detail viewing is now a routed page (/csv-csa/systems/[reference]).
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
  // RUNG 3B — archive (soft-delete) + restore, both require a reason (≥10 chars).
  const [systemToRemove, setSystemToRemove] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [activityAddedPopup, setActivityAddedPopup] = useState(false);
  const [noSitesOpen, setNoSitesOpen] = useState(false);
  // Error surface for add/edit-system failures (detail-field saves moved to the routed page).
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [roadmapSynced, setRoadmapSynced] = useState("");
  const [autoRoadmapPrompt, setAutoRoadmapPrompt] = useState<{ systemId: string; stageKey: ValidationStageKey } | null>(null);


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
    // RUNG: the simplified Add modal collects only the 8 essential fields.
    // Everything else is server-defaulted; createSystem auto-derives the 4
    // risk classifications + riskLevel from gxpRelevance, defaults
    // part11/annex11 to "N/A" and validationStatus to "Not Started". The rest
    // (intended use, scope, dates, planning) is filled on the detail page.
    const result = await createSystem({
      name: data.name,
      type: data.type,
      vendor: data.vendor,
      version: data.version,
      siteId: data.siteId,
      owner: data.owner,
      gxpRelevance: data.gxpRelevance,
      gamp5Category: data.gamp5Category,
    });
    if (!result.success) {
      setErrorMsg(result.error || "Failed to add system.");
      return;
    }
    setAddOpen(false);
    setAddedPopup(true);
    router.refresh();
  }

  async function onEditSave(data: EditSystemForm) {
    if (!selectedSystem) return;
    // RUNG 2.6: the edit modal now carries only the 8 essential identity /
    // classification fields. Intended use, risk classification, compliance
    // status, dates, planned actions and validation status are each edited on
    // their own detail tab (Assess / Execute / Sign Off), never free-edited here.
    const result = await updateSystemServer(selectedSystem.id, {
      name: data.name,
      type: data.type,
      vendor: data.vendor,
      version: data.version,
      gxpRelevance: data.gxpRelevance,
      gamp5Category: data.gamp5Category,
      siteId: data.siteId,
      owner: data.owner,
    });
    if (!result.success) {
      setErrorMsg(result.error || "Failed to update system.");
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

  // RUNG 2: the per-field detail save handlers (risk factors, planned actions,
  // next review, risk classification, remediation) moved to SystemDetailPage /
  // its tab panels, which call the server actions directly. The drawer that
  // used them here is removed (detail is now a routed page).

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

  // RUNG 3B — archive / restore handlers. GxPSystem has deletedById (no name
  // column), so resolve the actor via the tenant users map for the archive view.
  const resolveUserName = (id: string | null) => displayUserName(id, users, "—");

  function closeDeleteModal() { setSystemToRemove(null); setDeleteReason(""); setDeleteError(null); }
  async function handleConfirmDelete() {
    if (!systemToRemove || deleteReason.trim().length < 10) return;
    setDeleteBusy(true); setDeleteError(null);
    const r = await deleteSystemServer(systemToRemove, { reason: deleteReason.trim() });
    setDeleteBusy(false);
    if (!r.success) { setDeleteError(r.error || "Failed to archive system."); return; }
    if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null);
    closeDeleteModal();
    router.refresh();
  }

  function closeRestoreModal() { setRestoreTarget(null); setRestoreReason(""); setRestoreError(null); }
  async function handleConfirmRestore() {
    if (!restoreTarget || restoreReason.trim().length < 10) return;
    setRestoreBusy(true); setRestoreError(null);
    const r = await restoreSystemServer(restoreTarget, { reason: restoreReason.trim() });
    setRestoreBusy(false);
    if (!r.success) { setRestoreError(r.error || "Failed to restore system."); return; }
    closeRestoreModal();
    router.refresh();
  }

  /* ══════════════════════════════════════ */

  // Header actions — secondaries render left→right, the single primary ("Add
  // system") is filled and rightmost. Same gating and the same onClick bodies
  // the inline buttons had.
  const pageActions: PageAction[] = [
    ...(showArchive
      ? [{ label: "← Back to inventory", variant: "secondary" as const, onClick: () => router.push("/csv-csa") }]
      : []),
    ...(isAdmin && !showArchive && props.deletedSystems.length > 0
      ? [{ label: `View archived (${props.deletedSystems.length})`, variant: "secondary" as const, icon: Archive, onClick: () => router.push("/csv-csa?view=deleted") }]
      : []),
    ...(!isViewOnly && !showArchive
      ? [{ label: "Add system", variant: "primary" as const, icon: Plus, onClick: () => { if (!hasSites) { setNoSitesOpen(true); return; } setAddOpen(true); } }]
      : []),
  ];

  return (
    <main id="main-content" aria-label="CSV/CSA and systems risk register" className="w-full">
      <PageLayout
        title="CSV/CSA Validation"
        description={`Validate computerized systems through the GxP validation lifecycle. \u00b7 ${systems.length === 0 ? "No systems registered yet" : `${systems.length} systems \u00b7 ${highRisk} high risk \u00b7 ${valOverdue} validation overdue`}`}
        actions={pageActions}
      >
        {/* Content below the header is unchanged; the space-y-5 that used to sit
            on <main> now wraps the children so their spacing is preserved. */}
        <div className="space-y-5">

      {/* RUNG 3B — admin archive view (soft-deleted systems + restore) */}
      {showArchive ? (
        <div className="card overflow-hidden">
          <div className="card-header"><div className="flex items-center gap-2"><Archive className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><span className="card-title">Archived systems ({props.deletedSystems.length})</span></div></div>
          <DataTable
            ariaLabel="Archived systems"
            data={props.deletedSystems}
            rowKey={(s) => s.id}
            emptyState={
              <p className="text-center py-6 text-[12px]" style={{ color: "var(--text-muted)" }}>No archived systems.</p>
            }
            columns={[
              {
                key: "reference",
                header: "Reference",
                cellClassName: "font-mono text-[11px] font-semibold",
                render: (s) => <span style={{ color: "var(--brand)" }}>{s.reference ?? s.id.slice(0, 8)}</span>,
              },
              {
                key: "system",
                header: "System",
                cellClassName: "text-[12px]",
                render: (s) => <span style={{ color: "var(--text-primary)" }}>{s.name}</span>,
              },
              {
                key: "archived",
                header: "Archived",
                cellClassName: "text-[11px]",
                render: (s) => <span style={{ color: "var(--text-secondary)" }}>{s.deletedAt ? dayjs.utc(s.deletedAt).tz(timezone).format(dateFormat) : "—"}</span>,
              },
              {
                key: "by",
                header: "By",
                cellClassName: "text-[11px]",
                render: (s) => <span style={{ color: "var(--text-secondary)" }}>{resolveUserName(s.deletedById)}</span>,
              },
              {
                key: "reason",
                header: "Reason",
                cellClassName: "text-[11px] max-w-[280px]",
                render: (s) => <span style={{ color: "var(--text-secondary)" }}>{s.deletionReason ?? "—"}</span>,
              },
              {
                key: "restore",
                header: "Restore",
                srOnly: true,
                render: (s) => <Button variant="ghost" size="xs" icon={RotateCcw} onClick={() => { setRestoreTarget(s.id); setRestoreReason(""); setRestoreError(null); }}>Restore</Button>,
              },
            ] satisfies Column<PrismaSystemWithRelations>[]}
          />
        </div>
      ) : (
      <>

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

      {/* Drift Detection — AGI continuous-monitoring panel (read-only alerts).
          Renders only when the `drift` agent is on. */}
      <DriftDetectionPanel />

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
          onSelectSystem={(sys) => router.push(`/csv-csa/systems/${encodeURIComponent(sys.reference ?? sys.id)}`)}
          onEditSystem={(sys) => { setSelectedSystem(sys); setEditOpen(true); }}
          onRemoveSystem={(id) => { setSystemToRemove(id); setDeleteReason(""); setDeleteError(null); }}
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
      </>
      )}

      {/* System detail is now a routed page: /csv-csa/systems/[reference]. */}

      {/* ── Modals ── */}
      <AddSystemModal open={addOpen} sites={sites} users={complianceUsers} onSave={onAddSave} onClose={() => setAddOpen(false)} lockedSiteId={selectedSiteId} />
      <EditSystemModal open={editOpen} system={selectedSystem} sites={sites} users={complianceUsers} onSave={onEditSave} onClose={() => setEditOpen(false)} />
      <AddActivityModal open={addActivityOpen} systems={systems} users={users} onSave={onActivitySave} onClose={() => setAddActivityOpen(false)} />

      {/* ── Popups ── */}
      <Popup isOpen={addedPopup} variant="success" title="System added" description="Added to the inventory. Part 11 / Annex 11 columns appear based on active frameworks in Settings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={editSavedPopup} variant="success" title="System updated" description="Changes saved to the system record." onDismiss={() => setEditSavedPopup(false)} />
      {/* RUNG 3B — archive (soft-delete) with required reason */}
      <Modal
        open={!!systemToRemove}
        onClose={deleteBusy ? () => undefined : closeDeleteModal}
        title="Archive this system?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={deleteBusy} onClick={closeDeleteModal}>Cancel</Button>
            <Button variant="danger" size="sm" icon={Archive} loading={deleteBusy} disabled={deleteBusy || deleteReason.trim().length < 10} onClick={handleConfirmDelete}>Archive system</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            This system will be archived for 7 years. An administrator can restore it. All validation stages, evidence, RTM entries, and the audit trail are retained — nothing is destroyed.
          </p>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Reason for archiving *</label>
            <textarea rows={3} className="input text-[12px] resize-none w-full" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Why is this system being archived? (min 10 characters)" maxLength={2000} disabled={deleteBusy} aria-label="Archive reason" />
          </div>
          {deleteError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{deleteError}</p>}
        </div>
      </Modal>

      {/* RUNG 3B — restore an archived system (admin), required reason */}
      <Modal
        open={!!restoreTarget}
        onClose={restoreBusy ? () => undefined : closeRestoreModal}
        title="Restore this system?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={restoreBusy} onClick={closeRestoreModal}>Cancel</Button>
            <Button variant="primary" size="sm" icon={RotateCcw} loading={restoreBusy} disabled={restoreBusy || restoreReason.trim().length < 10} onClick={handleConfirmRestore}>Restore system</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The system and its child records will reappear in the active inventory.
          </p>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Reason for restoring *</label>
            <textarea rows={3} className="input text-[12px] resize-none w-full" value={restoreReason} onChange={(e) => setRestoreReason(e.target.value)} placeholder="Why is this system being restored? (min 10 characters)" maxLength={2000} disabled={restoreBusy} aria-label="Restore reason" />
          </div>
          {restoreError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{restoreError}</p>}
        </div>
      </Modal>
      <Popup isOpen={activityAddedPopup} variant="success" title="Activity added" description="Roadmap activity added. It will appear in the system's Validation tab and CSV Roadmap timeline." onDismiss={() => setActivityAddedPopup(false)} />
      <Popup isOpen={!!errorMsg} variant="error" title="Action failed" description={errorMsg ?? ""} onDismiss={() => setErrorMsg(null)} />
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
      <NoSitesPopup isOpen={noSitesOpen} onClose={() => setNoSitesOpen(false)} feature="CSV/CSA" />
        </div>
      </PageLayout>
    </main>
  );
}
