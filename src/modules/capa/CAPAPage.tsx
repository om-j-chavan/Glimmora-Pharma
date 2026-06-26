"use client";
import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ClipboardCheck, GitBranch, BarChart3, Plus, Search,
  AlertTriangle, CheckCircle2, TrendingUp, Wrench, Shield, MessageSquare, RotateCcw,
} from "lucide-react";
import type { CAPA as PrismaCAPA } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  setCAPAs,
  addCAPA,
  type CAPA,
} from "@/store/capa.slice";
import { isOverdue } from "@/types/capa";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { auditLog } from "@/lib/audit";
import {
  createCAPA as createCAPAServer,
  reopenCAPA as reopenCAPAServer,
} from "@/actions/capas";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import { StatusGuide } from "@/components/shared";
import { CAPA_STATUSES } from "@/constants/statusTaxonomy";

import { QMSBlueprintTab } from "./tabs/QMSBlueprintTab";
import { CAPATrackerTab } from "./tabs/CAPATrackerTab";
import { CAPAMetricsTab } from "./tabs/CAPAMetricsTab";
import { AddCAPAModal, type CAPAForm } from "./modals/AddCAPAModal";
import { AIGenerateCAPAModal, type AICapaResponse, type AICapaForm } from "./modals/AIGenerateCAPAModal";
import { CapaSmartSearch } from "./components/CapaSmartSearch";
import type { LinkableRecord } from "@/lib/queries/capas";

/* ── Constants ── */

type TabId = "blueprint" | "tracker" | "metrics";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "blueprint", label: "QMS Blueprint", Icon: GitBranch },
  { id: "tracker", label: "CAPA Tracker", Icon: ClipboardCheck },
  { id: "metrics", label: "Metrics", Icon: BarChart3 },
];

const QMS_PROCESSES = [
  // Phase G \u2014 status: Deviation is a built Phase-1 module; Change Control has no
  // module yet and Complaint Handling is Phase 2, so both are flagged "planned".
  { title: "Deviation Management", Icon: AlertTriangle, color: "#f59e0b", sourceKey: "Deviation", status: "live" as const, targetState: "Risk-based classification within 24h. DI gate check for all deviations. Trend monitoring for recurrence.", currentGap: "Recurrence detection is manual \u2014 AGI deviation intelligence not yet active." },
  { title: "Change Control", Icon: GitBranch, color: "#6366f1", sourceKey: "Change Control", status: "planned" as const, targetState: "Impact assessment before any GMP change. CSV review for system changes. QA approval mandatory.", currentGap: "Change control SOP last reviewed 2023 \u2014 update required for Annex 11 alignment." },
  { title: "Complaint Handling", Icon: MessageSquare, color: "#0ea5e9", sourceKey: "Complaint", status: "planned" as const, targetState: "Complaint triage within 24h. Serious complaints trigger CAPA automatically. Monthly trend analysis.", currentGap: "Complaint data not yet integrated. Manual review process in place." },
];

/* ══════════════════════════════════════ */

export interface EffectivenessDueItem {
  id: string;
  reference: string | null;
  description: string;
  risk: string;
  effectivenessDate: string | null;
}

interface CAPAPageProps {
  openCapaId?: string;
  /** Server-fetched CAPAs (Prisma rows) — seeded into Redux on mount. */
  capas?: PrismaCAPA[];
  /** Phase 6 — closed CAPAs whose 90-day effectiveness check is due. */
  effectivenessDue?: EffectivenessDueItem[];
  /** Batch 2b — open linkable records for the New CAPA source picker. */
  gapFindings?: LinkableRecord[];
  deviations?: LinkableRecord[];
}

// Maps the New-CAPA modal / AI free-text source vocabulary → the createCAPA
// server Zod enum. ONE map shared by both the manual and AI create paths so
// they can't drift. Unmatched values fall through to "Other" at the call site.
//   NOTE: "OOS" and "Change Control" have no 1:1 in the server enum and map to
//   "Other" by design (see #9 summary) — they are NOT silently dropped.
const SERVER_SOURCE_MAP: Record<string, "Gap Assessment" | "Deviation" | "FDA 483" | "Internal Audit" | "External Audit" | "Customer Complaint" | "Other"> = {
  "483": "FDA 483",
  "Internal Audit": "Internal Audit",
  "Deviation": "Deviation",
  "Complaint": "Customer Complaint",
  "OOS": "Other",
  "Change Control": "Other",
  "Gap Assessment": "Gap Assessment",
};

export function CAPAPage({ openCapaId, capas: serverCAPAs, effectivenessDue = [], gapFindings = [], deviations = [] }: CAPAPageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Seed Redux from server-fetched CAPAs on mount / when props change.
  useEffect(() => {
    if (serverCAPAs) {
      dispatch(setCAPAs(serverCAPAs.map(mapCAPAFromPrisma)));
    }
  }, [serverCAPAs, dispatch]);
  const [, startTransition] = useTransition();
  // canSign / canCloseCapa moved into the CAPA detail page (which calls
  // useRole itself); this page only needs isViewOnly to gate the table's
  // "New CAPA" button + edit affordances at the row level.
  const { isViewOnly } = useRole();
  const { isCustomerAdmin, isSuperAdmin, isQAHead, canCreateCAPAs, isViewer } = usePermissions();
  // RUNG 3D-CAPA — reopening a closed/rejected CAPA is a senior action.
  const canReopen = isQAHead || isCustomerAdmin || isSuperAdmin;
  // AI CAPA is available to anyone except read-only viewers — including
  // customer admins, so they can trigger AI analysis even though the manual
  // "New CAPA" creation flow is reserved for QA-side roles.
  const canUseAiCapa = !isViewer;

  const { capas, tenantId } = useTenantData();
  const { org, users, allSites } = useTenantConfig();
  // For the AI backend, customer_id is the customer admin's aiUserId (the
  // CUST_xxx that was registered at signup). Fall back to the local tenantId
  // only if no admin has been signed up yet — the backend will then 422.
  const aiCustomerId =
    users.find((u) => u.role === "customer_admin" && u.aiUserId)?.aiUserId ??
    tenantId ??
    "";
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("blueprint");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedCAPAId, setSelectedCAPAId] = useState<string | null>(null);
  const selectedCAPA = selectedCAPAId ? capas.find((c) => c.id === selectedCAPAId) ?? null : null;
  const setSelectedCAPA = (c: CAPA | null) => setSelectedCAPAId(c?.id ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSavedPopup, setAiSavedPopup] = useState<string | null>(null);
  const [addedPopup, setAddedPopup] = useState(false);
  // Failure surface for the create/AI/reopen flows that remain on this list
  // page. (Phase 6 cleanup — edit/sign/submit modals moved to /capa/[id].)
  const [errorMsg, setErrorMsg] = useState("");
  const [errorPopup, setErrorPopup] = useState(false);

  /* ── Open from route ── */
  useEffect(() => {
    if (openCapaId) {
      const found = capas.find((c) => c.id === openCapaId);
      // Sync route-prop → local state; intentional setState in effect.
       
      if (found) { setActiveTab("tracker"); setSelectedCAPA(found); }
    }
  }, [openCapaId, capas]);

  /* ── Computed ── */
  const openCAPAs = capas.filter((c) => c.status !== "closed");
  const overdueCAPAs = capas.filter(isOverdue);
  const closedCAPAs = capas.filter((c) => c.status === "closed");

  const noRCACount = capas.filter((c) => c.status !== "closed" && c.status !== "pending_qa_review" && (!c.rca || c.rca.trim().length === 0)).length;
  const criticalOpenCount = capas.filter((c) => c.risk === "Critical" && c.status !== "closed").length;
  const pendingReviewCount = capas.filter((c) => c.status === "pending_qa_review").length;

  const onTimeRate = closedCAPAs.length === 0 ? 0 : Math.round((closedCAPAs.filter((c) => !dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate))).length / closedCAPAs.length) * 100);
  const overdueRate = openCAPAs.length === 0 ? 0 : Math.round((overdueCAPAs.length / openCAPAs.length) * 100);
  const diExceptions = capas.filter((c) => c.diGate && c.status !== "closed").length;
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
      { name: "Open", value: capas.filter((c) => c.status === "open").length, fill: "#3B82F6" },
      { name: "In Progress", value: capas.filter((c) => c.status === "in_progress").length, fill: "#F59E0B" },
      { name: "Pending QA", value: capas.filter((c) => c.status === "pending_qa_review").length, fill: "#6366f1" },
      { name: "Closed", value: capas.filter((c) => c.status === "closed").length, fill: "#0F6E56" },
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
    return { open: src.filter((c) => c.status !== "closed").length, thisMonth: src.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === dayjs().format("MMM YYYY")).length, overdue: src.filter(isOverdue).length };
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

  /* ── Handlers ──
   *
   * Server-first throughout. We previously dispatched optimistic Redux
   * updates and showed green popups BEFORE awaiting the server, which
   * meant a server reject (FORBIDDEN, validation, Part 11 password fail)
   * left the UI claiming success against state the DB never accepted —
   * regulatory exposure on a compliance product. Every handler below now
   * awaits the server first; only on success do we mutate Redux / surface
   * a success popup. Failures route through errorPopup with the server's
   * own error message.
   */
  function handleAddCAPA(data: CAPAForm) {
    startTransition(async () => {
      const res = await createCAPAServer({
        title: data.title,
        description: data.description,
        // Map the modal's source vocabulary → the server enum (same map the AI
        // path uses); unmatched → "Other". Was passed raw (`as never`), which
        // failed server zod for 483 / Complaint / OOS / Change Control.
        source: SERVER_SOURCE_MAP[data.source] ?? "Other",
        risk: data.risk as never,
        owner: data.owner,
        dueDate: data.dueDate,
        siteId: data.siteId,
        linkedFindingId: data.findingId || undefined,
        linkedDeviationId: data.deviationId || undefined,
        diGateRequired: data.diGate,
        rca: data.rca,
        rcaMethod: data.rcaMethod,
        rcaDetail: data.rcaDetail,
      });
      if (!res.success) {
        // Surface which field failed (createCAPA returns fieldErrors) instead of
        // a bare "Validation failed".
        const firstField = res.fieldErrors ? Object.entries(res.fieldErrors)[0] : undefined;
        const hint = firstField?.[1]?.[0] ? ` (${firstField[0]}: ${firstField[1][0]})` : "";
        setErrorMsg((res.error || "Failed to create CAPA. Please try again.") + hint);
        setErrorPopup(true);
        return;
      }
      setAddOpen(false);
      setAddedPopup(true);
      router.refresh();
    });
  }

  // Phase 6 cleanup FIX 5 — handleEditSave / handleSubmitForReview /
  // handleSignClose removed: the detail PAGE (/capa/[id]) now owns edit,
  // submit, and sign-&-close (it reuses the same EditCAPAModal/SignCloseModal).
  // This list page keeps create / AI / reopen only.

  // RUNG 3D-CAPA — reopen a closed/rejected CAPA (senior action, reason ≥10).
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  function closeReopenModal() { setReopenTarget(null); setReopenReason(""); setReopenError(null); }
  async function handleConfirmReopen() {
    if (!reopenTarget || reopenReason.trim().length < 10) return;
    setReopenBusy(true); setReopenError(null);
    const res = await reopenCAPAServer(reopenTarget, { reason: reopenReason.trim() });
    setReopenBusy(false);
    if (!res.success) { setReopenError(res.error || "Failed to reopen CAPA."); return; }
    if (selectedCAPA?.id === reopenTarget) setSelectedCAPA(null);
    closeReopenModal();
    router.refresh();
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="QMS and CAPA tracker" className="capa-shell w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">CAPA Tracker</h1>
          <p className="page-subtitle mt-1">{capas.length === 0 ? "No CAPAs raised yet" : `${capas.length} CAPAs \u00b7 ${openCAPAs.length} open \u00b7 ${overdueCAPAs.length} overdue`}</p>
          <StatusGuide module="CAPA Tracker" statuses={CAPA_STATUSES} />
        </div>
        {canCreateCAPAs && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>New CAPA</Button>}
        {isCustomerAdmin && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>CAPA actions require QA Head authorization</p>}
      </header>

      {/* Batch 1 — the "How a CAPA flows" strip was removed; the QMS Blueprint
          tab's 7-step lifecycle cards already teach the flow. */}

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
        <div className="space-y-4">
          {/* Feature 2 — Plain-English Record Search */}
          <CapaSmartSearch
            capas={capas}
            sites={allSites}
            onOpenCapa={(id) => setSelectedCAPAId(id)}
          />
          <CAPATrackerTab
            capas={capas} filteredCAPAs={capas} selectedCAPA={selectedCAPA} onSelectCAPA={setSelectedCAPA}
            isDark={isDark} isViewOnly={isViewOnly} users={users} user={user} sites={allSites}
            timezone={timezone} dateFormat={dateFormat}
            onAddOpen={() => setAddOpen(true)}
            onAiOpen={canUseAiCapa ? () => setAiOpen(true) : undefined}
            onReopen={canReopen ? (id) => { setReopenTarget(id); setReopenReason(""); setReopenError(null); } : undefined}
            onNavigateCapa={() => router.push("/gap-assessment")}
            effectivenessDue={effectivenessDue}
          />
        </div>
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

      {/* Modals — edit/sign moved to the detail page (/capa/[id]); this list
          page keeps create / AI / reopen only. */}
      <AddCAPAModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleAddCAPA} users={complianceUsers} sites={allSites} lockedSiteId={selectedSiteId} gapFindings={gapFindings} deviations={deviations} />

      {/* RUNG 3D-CAPA — reopen a closed/rejected CAPA (reason required) */}
      <Modal
        open={!!reopenTarget}
        onClose={reopenBusy ? () => undefined : closeReopenModal}
        title="Reopen this CAPA?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={reopenBusy} onClick={closeReopenModal}>Cancel</Button>
            <Button variant="primary" size="sm" icon={RotateCcw} loading={reopenBusy} disabled={reopenBusy || reopenReason.trim().length < 10} onClick={handleConfirmReopen}>Reopen CAPA</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Reopening returns the CAPA to the open state and unlocks its evidence and effectiveness criteria for further work. This is recorded in the audit trail.
          </p>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Reason for reopening *</label>
            <textarea rows={3} className="input text-[12px] resize-none w-full" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Why is this CAPA being reopened? (min 10 characters)" maxLength={2000} disabled={reopenBusy} aria-label="Reopen reason" />
          </div>
          {reopenError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{reopenError}</p>}
        </div>
      </Modal>
      <AIGenerateCAPAModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        defaultCustomerId={aiCustomerId}
        onAccepted={async (res: AICapaResponse, form: AICapaForm) => {
          // Map AI form severity → CAPA risk taxonomy ("Medium" → "High" so it
          // still escalates; backend severity is informational anyway).
          const risk: "Critical" | "High" | "Low" =
            form.initial_severity === "Critical" ? "Critical" :
            form.initial_severity === "Low" ? "Low" : "High";

          // Map AI free-text source → the createCAPA Zod enum (shared module
          // map). Unmatched values land in "Other".
          const serverSource = SERVER_SOURCE_MAP[form.source] ?? "Other";

          // Redux's CAPASource type uses the legacy AI-form vocabulary
          // (different enum from the server's Zod schema). Keep both in sync
          // for the degraded-mode fallback dispatch.
          const REDUX_KNOWN_SOURCES = ["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"] as const;
          const reduxSource = (REDUX_KNOWN_SOURCES as readonly string[]).includes(form.source)
            ? (form.source as typeof REDUX_KNOWN_SOURCES[number])
            : "Deviation";

          // Default due date: 30 days for Critical, 60 for High, 90 for Low.
          const days = risk === "Critical" ? 30 : risk === "High" ? 60 : 90;
          const dueDateIso = dayjs(res.created_at).add(days, "day").toISOString();

          const description = [
            form.problem_statement,
            form.area_affected ? `Area: ${form.area_affected}` : "",
            form.equipment_product ? `Equipment/Product: ${form.equipment_product}` : "",
            res.ai_recommendation ? `\nAI recommendation: ${res.ai_recommendation}` : "",
            res.pattern_detected ? `Pattern: ${res.pattern_detected}` : "",
            res.recurrence_alert ? `Recurrence: ${res.recurrence_alert}` : "",
          ].filter(Boolean).join("\n");

          // Persist locally so the CAPA survives page refresh. Prior to this
          // the AI CAPA only lived in Redux + the AI backend, so refreshing
          // /capa wiped it from the tracker (capa.slice doesn't persist).
          // The AI backend's res.capa_id is kept in the audit log's newValue
          // so the AI lifecycle viewer at /ai-capa/[capaId] is still findable
          // post-create; the local Prisma row gets its own cuid + reference.
          // Phase A — short title for the AI CAPA (problem statement, capped).
          const aiTitle = (form.problem_statement || description).slice(0, 120);
          let persistedToDb = false;
          let serverCapa: PrismaCAPA | null = null;
          try {
            const createRes = await createCAPAServer({
              title: aiTitle,
              description,
              source: serverSource,
              risk,
              owner: user?.id || user?.name || "ai-system",
              dueDate: dueDateIso,
              siteId: selectedSiteId ?? allSites[0]?.id ?? undefined,
            });
            if (createRes.success && createRes.data) {
              serverCapa = createRes.data as PrismaCAPA;
              persistedToDb = true;
            } else if (!createRes.success) {
              console.warn("[ai-capa] local persist rejected:", createRes.error);
            }
          } catch (err) {
            console.error("[ai-capa] local persist threw:", err);
          }

          if (persistedToDb && serverCapa) {
            // Mirror the server's authoritative row into Redux so the tracker
            // shows the canonical Prisma id + reference, not the AI backend id.
            dispatch(addCAPA(mapCAPAFromPrisma(serverCapa)));
          } else {
            // Degraded mode: persist failed but AI backend has the CAPA.
            // Keep the user moving — add to Redux so the tracker still shows
            // something this session. On next page refresh this row will
            // vanish (capa.slice doesn't persist + Prisma row is missing).
            dispatch(addCAPA({
              id: res.capa_id,
              tenantId: tenantId ?? "",
              siteId: selectedSiteId ?? allSites[0]?.id ?? "",
              source: reduxSource,
              risk,
              owner: user?.id ?? "",
              dueDate: dueDateIso,
              status: "open",
              title: aiTitle,
              description,
              effectivenessCheck: true,
              diGate: false,
              createdAt: res.created_at,
            }));
          }

          auditLog({
            action: "CAPA_AI_GENERATED",
            module: "capa",
            recordId: serverCapa?.id ?? res.capa_id,
            newValue: {
              riskScore: res.risk_score,
              isRecurring: res.is_recurring,
              aiBackendId: res.capa_id,
              persistedToDb,
            },
          });
          setAiSavedPopup(
            persistedToDb
              ? `AI CAPA ${serverCapa?.reference ?? res.capa_id} created and added to the tracker. Open the row to start RCA in the AI lifecycle.`
              : `AI CAPA ${res.capa_id} created (warning: local persist failed; refresh will clear from tracker).`,
          );
          // We used to auto-redirect to /ai-capa/<id> here. That meant the
          // user got bounced off the CAPA Tracker the moment they clicked
          // "Save to library" — before the success popup could display and
          // before they had a chance to verify the row landed. Now the user
          // stays on /capa, sees the new row in the tracker, sees the
          // popup, and opens the AI lifecycle on their own terms by clicking
          // the row (which routes to /ai-capa/<aiBackendId> via the row's
          // detail handler).
        }}
      />

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="CAPA created" description="Added to the tracker. Open the CAPA to document RCA and corrective actions." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={!!aiSavedPopup} variant="success" title="AI CAPA generated" description={aiSavedPopup ?? ""} onDismiss={() => setAiSavedPopup(null)} />
      <Popup isOpen={errorPopup} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorPopup(false)} />
    </main>
  );
}
