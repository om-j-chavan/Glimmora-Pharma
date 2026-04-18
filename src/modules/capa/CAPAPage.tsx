import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import clsx from "clsx";
import {
  ClipboardCheck, GitBranch, BarChart3, Plus, Search,
  AlertTriangle, CheckCircle2, TrendingUp, Wrench, Shield, MessageSquare,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  addCAPA, updateCAPA, closeCAPA,
  type CAPA, type RCAMethod,
} from "@/store/capa.slice";
import { closeFinding } from "@/store/findings.slice";
import { updateObservation } from "@/store/fda483.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";

import { QMSBlueprintTab } from "./tabs/QMSBlueprintTab";
import { CAPATrackerTab } from "./tabs/CAPATrackerTab";
import { CAPAMetricsTab } from "./tabs/CAPAMetricsTab";
import { AddCAPAModal, type CAPAForm } from "./modals/AddCAPAModal";
import { EditCAPAModal, type EditForm } from "./modals/EditCAPAModal";
import { SignCloseModal } from "./modals/SignCloseModal";

/* ── Constants ── */

type TabId = "blueprint" | "tracker" | "metrics";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "blueprint", label: "QMS Blueprint", Icon: GitBranch },
  { id: "tracker", label: "CAPA Tracker", Icon: ClipboardCheck },
  { id: "metrics", label: "Metrics", Icon: BarChart3 },
];

const QMS_PROCESSES = [
  { title: "Deviation Management", Icon: AlertTriangle, color: "#f59e0b", sourceKey: "Deviation", targetState: "Risk-based classification within 24h. DI gate check for all deviations. Trend monitoring for recurrence.", currentGap: "Recurrence detection is manual \u2014 AGI deviation intelligence not yet active." },
  { title: "Change Control", Icon: GitBranch, color: "#6366f1", sourceKey: "Change Control", targetState: "Impact assessment before any GMP change. CSV review for system changes. QA approval mandatory.", currentGap: "Change control SOP last reviewed 2023 \u2014 update required for Annex 11 alignment." },
  { title: "Complaint Handling", Icon: MessageSquare, color: "#0ea5e9", sourceKey: "Complaint", targetState: "Complaint triage within 24h. Serious complaints trigger CAPA automatically. Monthly trend analysis.", currentGap: "Complaint data not yet integrated. Manual review process in place." },
];

/* ══════════════════════════════════════ */

export function CAPAPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { canSign, canCloseCapa, isViewOnly } = useRole();

  const { capas, fda483Events, tenantId } = useTenantData();
  const { org, users, allSites } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("blueprint");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedCAPAId, setSelectedCAPAId] = useState<string | null>(null);
  const selectedCAPA = selectedCAPAId ? capas.find((c) => c.id === selectedCAPAId) ?? null : null;
  const setSelectedCAPA = (c: CAPA | null) => setSelectedCAPAId(c?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signedPopup, setSignedPopup] = useState(false);
  const [submittedPopup, setSubmittedPopup] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSavedPopup, setEditSavedPopup] = useState(false);

  /* ── Open from route ── */
  useEffect(() => {
    const openId = (location.state as { openCapaId?: string } | null)?.openCapaId;
    if (openId) {
      const found = capas.find((c) => c.id === openId);
      if (found) { setActiveTab("tracker"); setSelectedCAPA(found); }
    }
  }, []);

  /* ── Computed ── */
  const openCAPAs = capas.filter((c) => c.status !== "Closed");
  const overdueCAPAs = openCAPAs.filter((c) => dayjs.utc(c.dueDate).isBefore(dayjs()));
  const closedCAPAs = capas.filter((c) => c.status === "Closed");

  const noRCACount = capas.filter((c) => c.status !== "Closed" && c.status !== "Pending QA Review" && (!c.rca || c.rca.trim().length === 0)).length;
  const criticalOpenCount = capas.filter((c) => c.risk === "Critical" && c.status !== "Closed").length;
  const pendingReviewCount = capas.filter((c) => c.status === "Pending QA Review").length;

  const onTimeRate = closedCAPAs.length === 0 ? 0 : Math.round((closedCAPAs.filter((c) => !dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate))).length / closedCAPAs.length) * 100);
  const overdueRate = openCAPAs.length === 0 ? 0 : Math.round((overdueCAPAs.length / openCAPAs.length) * 100);
  const diExceptions = capas.filter((c) => c.diGate && c.status !== "Closed").length;
  const effectivenessCount = capas.filter((c) => c.effectivenessCheck).length;

  const riskSignalData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, "month");
      const key = m.format("MMM YYYY");
      const mc = capas.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === key);
      months.push({ month: m.format("MMM"), "483": mc.filter((c) => c.source === "483").length, "Internal Audit": mc.filter((c) => c.source === "Internal Audit").length, Deviation: mc.filter((c) => c.source === "Deviation").length, "Gap Assessment": mc.filter((c) => c.source === "Gap Assessment").length });
    }
    return months;
  }, [capas]);
  const hasTrendData = capas.length > 0;

  const statusDonut = useMemo(() =>
    ([
      { name: "Open", value: capas.filter((c) => c.status === "Open").length, fill: "#3B82F6" },
      { name: "In Progress", value: capas.filter((c) => c.status === "In Progress").length, fill: "#F59E0B" },
      { name: "Pending QA", value: capas.filter((c) => c.status === "Pending QA Review").length, fill: "#6366f1" },
      { name: "Closed", value: capas.filter((c) => c.status === "Closed").length, fill: "#0F6E56" },
    ] as const).filter((d) => d.value > 0),
  [capas]);

  const sourceBreakdown = useMemo(() => {
    const srcs = ["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"] as const;
    return srcs.map((s) => ({ source: s, count: capas.filter((c) => c.source === s).length })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  }, [capas]);
  const maxSrcCount = sourceBreakdown.length > 0 ? sourceBreakdown[0].count : 1;

  /* ── Blueprint helpers ── */
  function getProcessMetrics(sourceKey: string) {
    const src = capas.filter((c) => c.source === sourceKey);
    return { open: src.filter((c) => c.status !== "Closed").length, thisMonth: src.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === dayjs().format("MMM YYYY")).length, overdue: src.filter((c) => c.status !== "Closed" && dayjs.utc(c.dueDate).isBefore(dayjs())).length };
  }

  function stepHasProblem(step: number): boolean {
    if (step === 2) return criticalOpenCount > 0;
    if (step === 3) return noRCACount > 0;
    if (step === 5 || step === 6) return pendingReviewCount > 0;
    return false;
  }

  const LIFECYCLE_STEPS = [
    { step: 1, label: "Finding", Icon: Search, color: "#ef4444", desc: "Gap identified and logged", targetState: "All findings logged within 24h of discovery with severity classification.", currentGap: "Manual logging only \u2014 no automated detection from LIMS or SAP yet." },
    { step: 2, label: "CAPA Raised", Icon: Plus, color: "#f59e0b", desc: "Owner assigned, due date set", targetState: "CAPA raised within 48h for Critical, 5 days for Major findings.", currentGap: criticalOpenCount > 0 ? `${criticalOpenCount} Critical CAPA${criticalOpenCount > 1 ? "s" : ""} open \u2014 verify raise time is within 48h` : "No Critical CAPAs open currently \u2713" },
    { step: 3, label: "RCA", Icon: GitBranch, color: "#6366f1", desc: "Root cause analysis", targetState: "5 Why or Fishbone for Critical/Major. Documented with evidence.", currentGap: noRCACount > 0 ? `${noRCACount} open CAPA${noRCACount > 1 ? "s" : ""} have no RCA documented \u2014 beyond 7-day threshold` : "All open CAPAs have RCA documented \u2713" },
    { step: 4, label: "Corrective Action", Icon: Wrench, color: "#0ea5e9", desc: "Fix implemented", targetState: "Action documented, evidence linked, change control raised if system change.", currentGap: "Evidence linking consistency \u2014 verify all In Progress CAPAs have document references." },
    { step: 5, label: "QA Review", Icon: Shield, color: "#10b981", desc: "Independent verification", targetState: "QA Head reviews within 3 working days of submission.", currentGap: pendingReviewCount > 0 ? `${pendingReviewCount} CAPA${pendingReviewCount > 1 ? "s" : ""} awaiting QA review \u2014 check elapsed time` : "No CAPAs pending QA review \u2713" },
    { step: 6, label: "Sign & Close", Icon: CheckCircle2, color: "#10b981", desc: "GxP e-signature closure", targetState: "E-signature with meaning, identity verification, content hash \u2014 21 CFR Part 11.", currentGap: pendingReviewCount > 0 ? `${pendingReviewCount} CAPA${pendingReviewCount > 1 ? "s" : ""} pending QA sign-off` : "No CAPAs pending sign-off \u2713" },
    { step: 7, label: "Effectiveness", Icon: TrendingUp, color: "#6366f1", desc: "90-day recurrence check", targetState: "Effectiveness check at 30, 60, 90 days. Recurrence monitoring active.", currentGap: "No formal effectiveness scoring \u2014 AGI monitoring planned for future phase." },
  ];

  /* ── Handlers ── */
  function handleAddCAPA(data: CAPAForm) {
    const newId = `CAPA-${String(Date.now()).slice(-4)}`;
    dispatch(addCAPA({ ...data, id: newId, tenantId: tenantId ?? "", evidenceLinks: [], status: "Open", createdAt: "", rcaMethod: data.rcaMethod as RCAMethod | undefined, rca: undefined, correctiveActions: undefined, findingId: data.findingId || undefined }));
    auditLog({ action: "CAPA_CREATED", module: "capa", recordId: newId, newValue: data });
    setAddOpen(false);
    setAddedPopup(true);
  }

  function handleEditSave(data: EditForm) {
    if (!selectedCAPA) return;
    const autoAdvance = selectedCAPA.status === "Open" && data.rca?.trim();
    dispatch(updateCAPA({
      id: selectedCAPA.id,
      patch: {
        description: data.description, owner: data.owner,
        dueDate: dayjs(data.dueDate).utc().toISOString(),
        risk: data.risk, rcaMethod: (data.rcaMethod as RCAMethod) || undefined,
        rca: data.rca ?? "", correctiveActions: data.correctiveActions ?? "",
        effectivenessCheck: data.effectivenessCheck, diGate: data.diGate,
        diGateStatus: data.diGateStatus ?? "open",
        diGateNotes: data.diGateNotes ?? "",
        diGateReviewedBy: data.diGateReviewedBy ?? "",
        diGateReviewDate: data.diGateReviewDate ?? "",
        ...(autoAdvance ? { status: "In Progress" as const } : {}),
      },
    }));
    auditLog({ action: "CAPA_UPDATED", module: "capa", recordId: selectedCAPA.id, newValue: data });
    setEditModalOpen(false);
    setEditSavedPopup(true);
  }

  function handleSubmitForReview(id: string) {
    dispatch(updateCAPA({ id, patch: { status: "Pending QA Review" } }));
    auditLog({ action: "CAPA_SUBMITTED_FOR_REVIEW", module: "capa", recordId: id });
    setSubmittedPopup(true);
    setSelectedCAPA(null);
  }

  const [diGateBlockPopup, setDiGateBlockPopup] = useState(false);

  function handleSignClose(data: { meaning: string }) {
    if (!selectedCAPA) return;
    if (selectedCAPA.diGate && selectedCAPA.diGateStatus !== "cleared") {
      setSignOpen(false);
      setDiGateBlockPopup(true);
      return;
    }
    const now = dayjs().toISOString();
    dispatch(closeCAPA({ id: selectedCAPA.id, closedBy: user?.id ?? "", closedAt: now }));
    if (selectedCAPA.findingId) { dispatch(closeFinding(selectedCAPA.findingId)); auditLog({ action: "FINDING_CLOSED_VIA_CAPA", module: "capa", recordId: selectedCAPA.findingId, newValue: { closedByCapaId: selectedCAPA.id } }); }
    // If this CAPA was raised from an FDA 483 observation, mark that observation as Closed too
    if (selectedCAPA.source === "483") {
      for (const ev of fda483Events) {
        const matchingObs = ev.observations.find((o) => o.capaId === selectedCAPA.id);
        if (matchingObs) {
          dispatch(updateObservation({ eventId: ev.id, obsId: matchingObs.id, patch: { status: "Closed" } }));
          auditLog({ action: "FDA483_OBS_CLOSED_VIA_CAPA", module: "capa", recordId: matchingObs.id, newValue: { closedByCapaId: selectedCAPA.id } });
          break;
        }
      }
    }
    auditLog({ action: "CAPA_CLOSED", module: "capa", recordId: selectedCAPA.id, newValue: { closedBy: user?.id, closedAt: now, meaning: data.meaning } });
    setSignOpen(false);
    setSignedPopup(true);
    setSelectedCAPA(null);
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="QMS and CAPA tracker" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">QMS &amp; CAPA Tracker</h1>
          <p className="page-subtitle mt-1">{capas.length === 0 ? "No CAPAs raised yet" : `${capas.length} CAPAs \u00b7 ${openCAPAs.length} open \u00b7 ${overdueCAPAs.length} overdue`}</p>
        </div>
        {!isViewOnly && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>New CAPA</Button>}
      </header>

      {/* Tab bar */}
      <div role="tablist" aria-label="CAPA sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors duration-150 bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "blueprint" && (
        <QMSBlueprintTab
          openCAPAs={openCAPAs} noRCACount={noRCACount} pendingReviewCount={pendingReviewCount} selectedStep={selectedStep} onSelectStep={setSelectedStep}
          lifecycleSteps={LIFECYCLE_STEPS} qmsProcesses={QMS_PROCESSES}
          stepHasProblem={stepHasProblem} getProcessMetrics={getProcessMetrics}
        />
      )}

      {activeTab === "tracker" && (
        <CAPATrackerTab
          capas={capas} filteredCAPAs={capas} selectedCAPA={selectedCAPA} onSelectCAPA={setSelectedCAPA} isViewOnly={isViewOnly} users={users} user={user} sites={allSites}
          timezone={timezone} dateFormat={dateFormat} canSign={canSign} canCloseCapa={canCloseCapa}
          onAddOpen={() => setAddOpen(true)} onEditOpen={() => setEditModalOpen(true)}
          onSignOpen={() => setSignOpen(true)} onSubmitForReview={handleSubmitForReview}
          onNavigateGap={(fid) => navigate("/gap-assessment", { state: { openFindingId: fid } })}
          onNavigateCapa={() => navigate("/gap-assessment")}
        />
      )}

      {activeTab === "metrics" && (
        <CAPAMetricsTab
          capasTotal={capas.length} closedCount={closedCAPAs.length}
          onTimeRate={onTimeRate} overdueRate={overdueRate} overdueCount={overdueCAPAs.length}
          diExceptions={diExceptions} effectivenessCount={effectivenessCount}
          riskSignalData={riskSignalData} hasTrendData={hasTrendData}
          statusDonut={statusDonut} sourceBreakdown={sourceBreakdown} maxSrcCount={maxSrcCount}
        />
      )}

      {/* Modals */}
      <AddCAPAModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddCAPA} users={complianceUsers} sites={allSites} lockedSiteId={selectedSiteId} />
      <EditCAPAModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} onSave={handleEditSave} capa={selectedCAPA} users={complianceUsers} />
      <SignCloseModal isOpen={signOpen} onClose={() => setSignOpen(false)} onSign={handleSignClose} capa={selectedCAPA} />

      {/* Popups */}
      <Popup isOpen={editSavedPopup} variant="success" title="CAPA updated" description="Changes saved. Submit for QA review when RCA and corrective actions are complete." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={addedPopup} variant="success" title="CAPA created" description="Added to the tracker. Document RCA and corrective actions next." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={submittedPopup} variant="success" title="Submitted for QA review" description="QA Head will review and sign to close." onDismiss={() => setSubmittedPopup(false)} />
      <Popup isOpen={signedPopup} variant="success" title="CAPA closed" description="Signed and closed. Audit trail entry recorded." onDismiss={() => setSignedPopup(false)} />
      <Popup isOpen={diGateBlockPopup} variant="confirmation" title="DI gate must be cleared" description="Data integrity review has not been completed. Open Edit mode and clear the DI gate before closing this CAPA." onDismiss={() => setDiGateBlockPopup(false)} actions={[{ label: "OK", style: "primary", onClick: () => setDiGateBlockPopup(false) }]} />
    </main>
  );
}
