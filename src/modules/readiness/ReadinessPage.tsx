import { useState, useEffect, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Map, Shield, BookOpen, GraduationCap, Users, GitBranch, Database, Monitor,
  FileText, ClipboardList, CheckCircle2, Clock, AlertTriangle, Plus, ArrowLeft,
  FolderOpen, ChevronRight, ChevronUp, UserCheck, X, Play, ChevronDown, Calendar,
  Lock, Info, Link2 as LinkIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { store } from "@/store";

import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import {
  addCard, updateCard, addSimulation, updateSimulation, addTraining, removeTraining,
  addInspection, setActiveInspection,
  type Playbook, type Simulation, type ReadinessLane, type ReadinessBucket,
  type PlaybookType, type InspectionAgency, type InspectionType,
} from "@/store/readiness.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import { PageHeader, TabBar, StatCard, CardSection } from "@/components/shared";

/* ── Constants ── */

const LANES: ReadinessLane[] = ["People", "Process", "Data", "Systems", "Documentation"];
const BUCKETS: ReadinessBucket[] = ["Immediate", "31-60 days", "61-90 days"];
const BUCKET_COLORS: Record<string, string> = { Immediate: "#ef4444", "31-60 days": "#f59e0b", "61-90 days": "#10b981" };
const LANE_ICONS: Record<ReadinessLane, LucideIcon> = { People: Users, Process: GitBranch, Data: Database, Systems: Monitor, Documentation: FileText };
const PB_CFG: Record<PlaybookType, { color: string; icon: LucideIcon }> = { "Front Room": { color: "#0ea5e9", icon: Users }, "Back Room": { color: "#6366f1", icon: Shield }, SME: { color: "#10b981", icon: GraduationCap }, "DIL Handling": { color: "#f59e0b", icon: FolderOpen } };

const TABS = [
  { id: "training", label: "Training & Simulations", Icon: GraduationCap },
  { id: "playbooks", label: "Playbooks", Icon: BookOpen },
  { id: "governance", label: "Governance", Icon: Shield },
  { id: "roadmap", label: "Roadmap", Icon: Map },
];
type TabId = (typeof TABS)[number]["id"];

const LANE_OPTIONS = LANES.map((l) => ({ value: l, label: l }));
const BUCKET_OPTIONS = BUCKETS.map((b) => ({ value: b, label: b }));
const RISK_OPTIONS = [{ value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }];

const FLOW_STEPS = [
  { time: "Day start", color: "#0ea5e9", front: "Receive inspector + opening meeting", back: "Review prior day notes + prepare documents" },
  { time: "During day", color: "#6366f1", front: "Answer questions + log all document requests", back: "Retrieve, review, approve documents for front room" },
  { time: "Midday", color: "#f59e0b", front: "Status update with back room lead", back: "Prioritise afternoon document requests" },
  { time: "Day end", color: "#10b981", front: "Daily debrief with inspector", back: "Overnight action list + risk assessment" },
  { time: "Evening", color: "#64748b", front: "\u2014", back: "Prepare overnight responses + draft commitments" },
];

const RACI_DATA = [
  { activity: "Inspector greeting + escort", r: "QA Head", a: "QA Head", c: "Reg Affairs", i: "All" },
  { activity: "DIL document retrieval", r: "Evidence Lead", a: "Back Room Lead", c: "QC Director", i: "QA Head" },
  { activity: "Technical SME questions", r: "SME", a: "QA Head", c: "Back Room", i: "Front Room" },
  { activity: "483 observation response", r: "Reg Affairs", a: "QA Head", c: "Legal", i: "Leadership" },
  { activity: "Commitment sign-off", r: "QA Head", a: "Super Admin", c: "Reg Affairs", i: "Front Room" },
];

const TRAINING_MODULES = ["GxP/GMP fundamentals", "Inspection readiness", "Front room protocols", "Back room protocols", "Document handling / DIL", "21 CFR Part 11", "CAPA and RCA", "Data integrity"];

const cardSchema = z.object({
  lane: z.enum(["People", "Process", "Data", "Systems", "Documentation"]),
  bucket: z.enum(["Immediate", "31-60 days", "61-90 days"]),
  action: z.string().min(5, "Action required"),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  agiRisk: z.enum(["High", "Medium", "Low"]),
});
type CardForm = z.infer<typeof cardSchema>;

/* ══════════════════════════════════════ */

export function ReadinessPage() {
  const dispatch = useAppDispatch();
  const { cards, playbooks, simulations, training, score: readinessScore, complete: completeCount, total: totalCards, inspections, activeInspectionId } = useAppSelector((s) => s.readiness);
  const { users, tenantId, allSites } = useTenantConfig();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const authUser = useAppSelector((s) => s.auth.user);
  const currentUserId = authUser?.id ?? "";
  const { role } = useRole();
  const { canScheduleSimulation, canUpdateTraining, canCompleteSimulation } = usePermissions();

  const tenantCards = cards.filter((c) => c.tenantId === tenantId);
  const tenantPlaybooks = playbooks.filter((p) => p.tenantId === tenantId);
  const tenantSims = simulations.filter((s) => s.tenantId === tenantId);

  const tenantInspections = inspections.filter((i) => i.tenantId === tenantId);
  const activeInspection = tenantInspections.find((i) => i.id === activeInspectionId) ?? null;
  const activeInspections = tenantInspections.filter((i) => i.status !== "completed" && i.status !== "cancelled");
  const completedInspections = tenantInspections.filter((i) => i.status === "completed");

  const inProgressCount = tenantCards.filter((c) => c.status === "In Progress").length;
  const overdueCount = tenantCards.filter((c) => c.status !== "Complete" && dayjs.utc(c.dueDate).isBefore(dayjs())).length;

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  const ROLE_LABELS: Record<string, string> = {
    qa_head: "QA Head",
    regulatory_affairs: "Regulatory Affairs",
    csv_val_lead: "CSV/Val Lead",
    it_cdo: "IT/CDO",
    operations_head: "Operations Head",
    qc_lab_director: "QC Lab Director",
    super_admin: "Super Admin",
    customer_admin: "Customer Admin",
    viewer: "Viewer",
  };
  const roleLabel = (r: string) => ROLE_LABELS[r] ?? r;
  const simEligibleUsers = users.filter((u) => !["super_admin", "customer_admin", "viewer"].includes(u.role));
  const canEditTrainingFor = (userId: string) => canUpdateTraining || userId === currentUserId;
  const canManageSims = canScheduleSimulation;

  const [activeTab, setActiveTab] = useState<TabId>("training");
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addSimOpen, setAddSimOpen] = useState(false);
  const [cardSavedPopup, setCardSavedPopup] = useState(false);
  const [simSavedPopup, setSimSavedPopup] = useState(false);
  const [laneFilter, setLaneFilter] = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["war-room", "teams"]));
  const toggleSection = (k: string) => setOpenSections((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Create Inspection modal
  const [createInspOpen, setCreateInspOpen] = useState(false);
  const [inspTitle, setInspTitle] = useState("");
  const [inspAgency, setInspAgency] = useState<InspectionAgency>("FDA");
  const [inspType, setInspType] = useState<InspectionType>("announced");
  const [inspSite, setInspSite] = useState(allSites[0]?.id ?? "");
  const [inspDate, setInspDate] = useState("");
  const [inspLead, setInspLead] = useState("");
  const [inspNotes, setInspNotes] = useState("");
  const [inspCreatedPopup, setInspCreatedPopup] = useState(false);

  function handleCreateInspection() {
    if (!inspTitle.trim() || !inspSite || !inspLead) return;
    const id = `INSP-${dayjs().format("YYYY")}-${String(tenantInspections.length + 1).padStart(3, "0")}`;
    const site = allSites.find((s) => s.id === inspSite);
    const now = new Date().toISOString();
    dispatch(addInspection({
      id, tenantId: tenantId ?? "", title: inspTitle.trim(),
      siteId: inspSite, siteName: site?.name ?? inspSite,
      agency: inspAgency, type: inspType, status: "preparation",
      expectedDate: inspDate ? dayjs(inspDate).utc().toISOString() : undefined,
      readinessScore: 0, totalActions: 16, completedActions: 0,
      inspectionLead: inspLead,
      createdBy: currentUserId, createdAt: now, updatedAt: now,
      notes: inspNotes.trim() || undefined,
    }));
    dispatch(setActiveInspection(id));
    auditLog({ action: "INSPECTION_CREATED", module: "Inspection Readiness", recordId: id, recordTitle: inspTitle.trim() });
    setCreateInspOpen(false);
    setInspTitle(""); setInspDate(""); setInspNotes("");
    setInspCreatedPopup(true);
  }

  // Training tab info banner (dismissible + persisted)
  const [showTrainingInfo, setShowTrainingInfo] = useState(() => {
    try { return localStorage.getItem("glimmora-training-info-dismissed") !== "1"; } catch { return true; }
  });
  function dismissTrainingInfo() {
    setShowTrainingInfo(false);
    try { localStorage.setItem("glimmora-training-info-dismissed", "1"); } catch { /* ignore */ }
  }

  // Simulation Start / Complete modal state
  const [activeSim, setActiveSim] = useState<Simulation | null>(null);
  const [simScore, setSimScore] = useState("");
  const [simFeedback, setSimFeedback] = useState("");
  const [simScoreError, setSimScoreError] = useState("");
  const [simCompletedPopup, setSimCompletedPopup] = useState(false);
  const [simCompletedMsg, setSimCompletedMsg] = useState("Score recorded. Moved to Completed simulations.");
  const [completeModules, setCompleteModules] = useState<Set<string>>(new Set());

  function toggleCompleteModule(m: string) {
    setCompleteModules((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  }

  function openStartSimulation(sim: Simulation) {
    if (sim.status === "Scheduled") {
      dispatch(updateSimulation({ id: sim.id, patch: { status: "In Progress" } }));
      auditLog({ action: "SIMULATION_STARTED", module: "readiness", recordId: sim.id, newValue: { status: "In Progress" } });
    }
    setActiveSim(sim);
    setSimScore(sim.score != null ? String(sim.score) : "");
    setSimFeedback(sim.notes ?? "");
    setSimScoreError("");
    setCompleteModules(new Set());
  }

  function completeActiveSimulation() {
    if (!activeSim) return;
    const n = Number(simScore);
    if (simScore === "" || !Number.isFinite(n) || n < 0 || n > 100) {
      setSimScoreError("Score must be a number between 0 and 100");
      return;
    }
    const notes = simFeedback.trim() || undefined;
    dispatch(updateSimulation({ id: activeSim.id, patch: { status: "Completed", score: n, notes } }));
    auditLog({ action: "SIMULATION_COMPLETED", module: "readiness", recordId: activeSim.id, newValue: { status: "Completed", score: n, notes } });

    // Auto-tick training for each checked module × each participant (skip if already complete)
    let trainingAdded = 0;
    const nowIso = dayjs().toISOString();
    for (const userId of activeSim.participants) {
      for (const m of completeModules) {
        const already = training.some((t) => t.userId === userId && t.module === m && t.tenantId === tenantId);
        if (!already) {
          dispatch(addTraining({ id: crypto.randomUUID(), userId, module: m, completedAt: nowIso, tenantId: tenantId ?? "" }));
          auditLog({ action: "TRAINING_COMPLETED", module: "readiness", recordId: `${userId}:${m}`, newValue: { userId, module: m, viaSimulation: activeSim.id } });
          trainingAdded++;
        }
      }
    }

    // Suggest (don't auto-complete) roadmap cards linked to this simulation type
    const suggestCards = cards.filter((c) =>
      c.tenantId === tenantId &&
      c.lane === "People" &&
      c.linkedSimulationType === activeSim.type &&
      c.status !== "Complete" &&
      !c.suggestionDismissed
    );
    for (const card of suggestCards) {
      dispatch(updateCard({ id: card.id, patch: { showSuggestion: true, suggestionText: "Simulation complete! Ready to mark done?" } }));
    }

    const parts: string[] = [];
    if (suggestCards.length > 0) parts.push(`${suggestCards.length} roadmap suggestion${suggestCards.length !== 1 ? "s" : ""} posted`);
    if (trainingAdded > 0) parts.push(`${trainingAdded} training record${trainingAdded !== 1 ? "s" : ""} updated`);
    setSimCompletedMsg(parts.length > 0 ? `Simulation completed. ${parts.join(" \u00b7 ")}.` : "Score recorded. Moved to Completed simulations.");

    setActiveSim(null);
    setSimCompletedPopup(true);
  }

  // Mark-complete / reopen / dismiss helpers
  const [markCompletePopup, setMarkCompletePopup] = useState(false);
  const [markCompleteMsg, setMarkCompleteMsg] = useState("");
  const [reopenTarget, setReopenTarget] = useState<string | null>(null);

  function markCardComplete(cardId: string, cardAction: string) {
    const prevScore = store.getState().readiness.score;
    dispatch(updateCard({
      id: cardId,
      patch: {
        status: "Complete",
        completedAt: dayjs().toISOString(),
        completedBy: authUser?.name ?? "",
        completedRole: role || authUser?.role || "",
        showSuggestion: false,
        suggestionDismissed: true,
      },
    }));
    auditLog({ action: "READINESS_CARD_COMPLETED", module: "readiness", recordId: cardId, newValue: { status: "Complete", completedBy: authUser?.name } });
    const newScore = store.getState().readiness.score;
    const deltaPart = newScore !== prevScore ? ` Readiness: ${prevScore}% \u2192 ${newScore}%` : "";
    setMarkCompleteMsg(`${cardAction} marked complete.${deltaPart}`);
    setMarkCompletePopup(true);
  }

  function dismissSuggestion(cardId: string) {
    dispatch(updateCard({ id: cardId, patch: { showSuggestion: false, suggestionDismissed: true } }));
    auditLog({ action: "READINESS_SUGGESTION_DISMISSED", module: "readiness", recordId: cardId, newValue: { dismissed: true } });
  }

  function confirmReopen() {
    if (!reopenTarget) return;
    dispatch(updateCard({
      id: reopenTarget,
      patch: { status: "Not Started", completedAt: undefined, completedBy: undefined, completedRole: undefined },
    }));
    auditLog({ action: "READINESS_CARD_REOPENED", module: "readiness", recordId: reopenTarget, newValue: { status: "Not Started" } });
    setReopenTarget(null);
  }

  // Trigger 2: when every non-admin user hits 100% training, post suggestions on matching People cards
  useEffect(() => {
    const trainingUsers = users.filter((u) => !["super_admin", "customer_admin"].includes(u.role));
    if (trainingUsers.length === 0) return;
    const allAt100 = trainingUsers.every((u) => {
      const ut = training.filter((t) => t.userId === u.id && t.tenantId === tenantId);
      return TRAINING_MODULES.every((m) => ut.some((t) => t.module === m));
    });
    if (!allAt100) return;
    const keywords = ["training", "brief", "protocol", "team"];
    const candidates = cards.filter((c) =>
      c.tenantId === tenantId &&
      c.lane === "People" &&
      c.status !== "Complete" &&
      !c.showSuggestion &&
      !c.suggestionDismissed &&
      keywords.some((k) => c.action.toLowerCase().includes(k))
    );
    for (const card of candidates) {
      dispatch(updateCard({ id: card.id, patch: { showSuggestion: true, suggestionText: "All team members trained! Ready to mark done?" } }));
    }
  }, [training, users, cards, tenantId, dispatch]);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CardForm>({
    resolver: zodResolver(cardSchema),
    defaultValues: { lane: "People", bucket: "Immediate", action: "", owner: "", dueDate: "", agiRisk: "Medium" },
  });

  function onCardSave(data: CardForm) {
    const id = crypto.randomUUID();
    dispatch(addCard({ ...data, id, status: "Not Started", tenantId: tenantId ?? "", dueDate: dayjs(data.dueDate).utc().toISOString() }));
    auditLog({ action: "READINESS_CARD_ADDED", module: "readiness", recordId: id, newValue: data });
    setAddCardOpen(false);
    setCardSavedPopup(true);
    reset();
  }

  const simSchema = z.object({ title: z.string().min(3, "Title required"), type: z.enum(["Mock Inspection", "DIL Drill", "SME Q&A", "Leadership Briefing"]), scheduledAt: z.string().min(1, "Date required"), duration: z.coerce.number().min(15, "Min 15 min"), participants: z.array(z.string()).min(1, "Select at least one") });
  const { control: simCtl, handleSubmit: simSubmit, reset: simReset, watch: simWatch, setValue: simSetValue, formState: { errors: simErrors } } = useForm({ resolver: zodResolver(simSchema) as any, defaultValues: { title: "", type: "Mock Inspection" as const, scheduledAt: "", duration: 90, participants: [] as string[] } });
  const watchParticipants = simWatch("participants") ?? [];

  function onSimSave(data: any) {
    const id = crypto.randomUUID();
    dispatch(addSimulation({ ...data, id, status: "Scheduled", tenantId: tenantId ?? "", scheduledAt: dayjs(data.scheduledAt).utc().toISOString() }));
    auditLog({ action: "SIMULATION_SCHEDULED", module: "readiness", recordId: id, newValue: data });
    setAddSimOpen(false);
    setSimSavedPopup(true);
    simReset();
  }

  const displayLanes = laneFilter ? LANES.filter((l) => l === laneFilter) : LANES;
  const rsCol = readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444";
  const timezone = "Asia/Kolkata";

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Inspection readiness program" className="w-full space-y-5">
      {/* Header */}
      <PageHeader
        title="Inspection Readiness Program"
        subtitle={`${completeCount} of ${totalCards} actions complete \u00b7 ${readinessScore}% ready`}
        actions={
          <div className="flex items-center gap-3">
            <div className={clsx("flex items-center gap-2 px-4 py-2 rounded-xl border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Readiness</span>
              <span className="text-[20px] font-bold" style={{ color: rsCol }}>{`${readinessScore}%`}</span>
            </div>
            {role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddCardOpen(true)}>Add action</Button>}
          </div>
        }
      />

      {/* Inspection selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Dropdown
          value={activeInspectionId ?? ""}
          onChange={(id) => dispatch(setActiveInspection(id))}
          placeholder="Select inspection..."
          width="w-80"
          options={[
            ...activeInspections.map((i) => ({
              value: i.id,
              label: `${i.title} \u2014 ${i.siteName} (${i.readinessScore}%)`,
            })),
            ...(completedInspections.length > 0
              ? completedInspections.map((i) => ({
                  value: i.id,
                  label: `\u2713 ${i.title} \u2014 ${i.siteName} (100%)`,
                }))
              : []),
          ]}
        />
        {activeInspection && (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <Badge variant={activeInspection.agency === "FDA" ? "blue" : activeInspection.agency === "EMA" ? "purple" : activeInspection.agency === "MHRA" ? "amber" : "gray"}>{activeInspection.agency}</Badge>
            <span>{activeInspection.type}</span>
            {activeInspection.expectedDate && <span>· Expected {dayjs.utc(activeInspection.expectedDate).tz(timezone).format("DD MMM YYYY")}</span>}
          </div>
        )}
        {(canScheduleSimulation) && (
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreateInspOpen(true)} className="ml-auto">New Inspection</Button>
        )}
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} activeTab={activeTab} onChange={(id) => { setActiveTab(id as TabId); setSelectedPlaybook(null); }} ariaLabel="Readiness sections" />

      {/* ═══ TAB 1 — ROADMAP ═══ */}
      {activeTab === "roadmap" && (
        <section aria-label="Readiness roadmap">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard icon={ClipboardList} color="#0ea5e9" label="Total actions" value={String(tenantCards.length)} sub="Across all lanes" />
            <StatCard icon={CheckCircle2} color="#10b981" label="Complete" value={String(completeCount)} sub={`${readinessScore}% done`} />
            <StatCard icon={Clock} color="#f59e0b" label="In progress" value={String(inProgressCount)} sub="Currently active" />
            <StatCard icon={AlertTriangle} color={overdueCount > 0 ? "#ef4444" : "#10b981"} label="Overdue" value={String(overdueCount)} sub={overdueCount > 0 ? "Needs attention" : "On track"} />
          </div>

          {/* Lane filter */}
          <div className="flex items-center gap-2 mb-4">
            <Dropdown placeholder="All lanes" value={laneFilter} onChange={setLaneFilter} width="w-44" options={[{ value: "", label: "All lanes" }, ...LANE_OPTIONS]} />
            {laneFilter && <Button variant="ghost" size="sm" onClick={() => setLaneFilter("")}>Clear</Button>}
          </div>

          {/* Swimlane */}
          <div className="overflow-x-auto">
            <div style={{ minWidth: 800 }}>
              {/* Bucket headers */}
              <div className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-3 mb-3">
                <div />
                {BUCKETS.map((b) => (
                  <div key={b} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: BUCKET_COLORS[b] + "12", border: `1px solid ${BUCKET_COLORS[b]}30` }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: BUCKET_COLORS[b] }} />
                    <span className="text-[12px] font-semibold" style={{ color: BUCKET_COLORS[b] }}>{b}{b === "Immediate" && " (0\u201330d)"}</span>
                    <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{tenantCards.filter((c) => c.bucket === b && c.status !== "Complete").length} open</span>
                  </div>
                ))}
              </div>

              {/* Lanes */}
              {displayLanes.map((lane) => {
                const LIcon = LANE_ICONS[lane];
                return (
                  <div key={lane} className="grid grid-cols-[7rem_1fr_1fr_1fr] gap-3 mb-3">
                    <div className="flex flex-col items-center justify-start gap-1 pt-3">
                      <LIcon className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
                      <span className="text-[11px] font-semibold text-center" style={{ color: "var(--text-primary)" }}>{lane}</span>
                    </div>
                    {BUCKETS.map((bucket) => {
                      const bc = tenantCards.filter((c) => c.lane === lane && c.bucket === bucket);
                      return (
                        <div key={bucket} className={clsx("min-h-[80px] rounded-xl p-2.5 space-y-2", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}>
                          {bc.length === 0 && <div className="flex items-center justify-center h-10"><span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>No actions</span></div>}
                          {bc.map((card) => {
                            const isOd = card.status !== "Complete" && dayjs.utc(card.dueDate).isBefore(dayjs());
                            const rc = card.agiRisk === "High" ? "#ef4444" : card.agiRisk === "Medium" ? "#f59e0b" : "#10b981";
                            const isComplete = card.status === "Complete";
                            const borderLeft = isComplete ? "3px solid #10b981" : undefined;
                            return (
                              <div
                                key={card.id}
                                className={clsx("rounded-lg p-2.5 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]", isComplete && "opacity-75")}
                                style={borderLeft ? { borderLeft } : undefined}
                              >
                                <p className="text-[11px] font-medium leading-relaxed mb-2" style={{ color: "var(--text-primary)" }}>{isComplete ? "\u2713 " : ""}{card.action}</p>
                                {card.linkedSimulationType && !isComplete && (
                                  <div className="flex items-center gap-1 mb-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                                    <LinkIcon className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                                    <span>Linked: {card.linkedSimulationType}</span>
                                  </div>
                                )}
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{ownerName(card.owner)}</p>
                                    <p className="text-[10px]" style={{ color: isOd ? "#ef4444" : "var(--text-muted)" }}>{dayjs.utc(card.dueDate).tz(timezone).format("DD MMM")}{isOd && " \u2014 Overdue"}</p>
                                  </div>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: rc + "18", color: rc }}>{card.agiRisk}</span>
                                </div>

                                {/* Suggestion banner */}
                                {!isComplete && card.showSuggestion && role !== "viewer" && (
                                  <div className="mt-2 rounded-lg p-2.5" style={{ background: isDark ? "rgba(245,158,11,0.08)" : "#FEF9EC", border: "1px solid #F59E0B" }}>
                                    <p className="text-[11px] font-semibold mb-2" style={{ color: isDark ? "#f59e0b" : "#7A6200" }}>💡 {card.suggestionText ?? "Ready to mark this done?"}</p>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => markCardComplete(card.id, card.action)}
                                        className="flex items-center gap-1 text-[10px] font-semibold rounded-md px-2 py-1 cursor-pointer border-none"
                                        style={{ background: "#f59e0b", color: "#ffffff" }}
                                      >
                                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Mark as Complete
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => dismissSuggestion(card.id)}
                                        className="text-[10px] font-medium cursor-pointer border-none bg-transparent"
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Mark as Complete (default) */}
                                {role !== "viewer" && !isComplete && !card.showSuggestion && (
                                  <div className="mt-2 pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                                    <button
                                      type="button"
                                      onClick={() => markCardComplete(card.id, card.action)}
                                      aria-label={`Mark complete: ${card.action}`}
                                      className="w-full flex items-center justify-center gap-1 text-[10px] font-semibold rounded-md py-1 cursor-pointer border transition-colors"
                                      style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)", color: "#f59e0b" }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.2)"; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.1)"; }}
                                    >
                                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Mark as Complete
                                    </button>
                                  </div>
                                )}

                                {/* Completed footer */}
                                {isComplete && (
                                  <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] font-semibold" style={{ color: "#10b981" }}>✅ Complete</p>
                                      {(card.completedBy || card.completedAt) && (
                                        <p className="text-[9.5px] leading-tight" style={{ color: "var(--text-muted)" }}>
                                          {card.completedBy ? `by ${card.completedBy}` : ""}
                                          {card.completedBy && card.completedAt ? " \u00b7 " : ""}
                                          {card.completedAt ? dayjs.utc(card.completedAt).tz(timezone).format("DD/MM/YYYY") : ""}
                                        </p>
                                      )}
                                    </div>
                                    {role !== "viewer" && (
                                      <button
                                        type="button"
                                        onClick={() => setReopenTarget(card.id)}
                                        className="text-[10px] font-medium cursor-pointer border-none bg-transparent"
                                        style={{ color: "var(--text-secondary)" }}
                                        aria-label={`Reopen: ${card.action}`}
                                      >
                                        Reopen
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══ TAB 2 — GOVERNANCE ═══ */}
      {activeTab === "governance" && (
        <section aria-label="Governance model" className="flex flex-col gap-3">
          {/* ─── SECTION 1 — War room model ─── */}
          <CollapsibleSection id="war-room" icon={AlertTriangle} iconColor="#f59e0b" title="War room model" isOpen={openSections.has("war-room")} onToggle={() => toggleSection("war-room")} isDark={isDark}>
            <div className={clsx("flex items-start gap-3 p-4 rounded-xl border", isDark ? "bg-[rgba(14,165,233,0.06)] border-[rgba(14,165,233,0.15)]" : "bg-[#eff6ff] border-[#bfdbfe]")}>
              <AlertTriangle className="w-4 h-4 text-[#0ea5e9] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>During an FDA inspection, two parallel teams operate. Front room faces the inspector. Back room coordinates evidence and responses.</p>
            </div>
          </CollapsibleSection>

          {/* ─── SECTION 2 — Inspection teams (Front + Back) ─── */}
          <CollapsibleSection id="teams" icon={Users} iconColor="#0ea5e9" title="Inspection teams" isOpen={openSections.has("teams")} onToggle={() => toggleSection("teams")} isDark={isDark}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CardSection icon={UserCheck} iconColor="#0ea5e9" title="Front room">
                {[{ role: "QA Head", name: "Dr. Priya Sharma", resp: "Lead inspector contact" }, { role: "Regulatory Affairs", name: "Rahul Mehta", resp: "Document response" }, { role: "SME (on-call)", name: "Dr. Nisha Rao", resp: "Technical questions" }, { role: "Scribe", name: "Vikram Singh", resp: "Log all requests" }].map((r) => (
                  <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#0ea5e9]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>— {r.name}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p>
                    </div>
                  </div>
                ))}
              </CardSection>
              <CardSection icon={Shield} iconColor="#6366f1" title="Back room">
                {[{ role: "Evidence Lead", name: "Anita Patel", resp: "Retrieve + review documents" }, { role: "CSV/Val Lead", name: "Suresh Kumar", resp: "System evidence support" }, { role: "QC Lab Director", name: "Dr. Nisha Rao", resp: "Lab records and data" }, { role: "Legal/QP", name: "Rahul Mehta", resp: "Regulatory risk advice" }].map((r) => (
                  <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#6366f1]" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>— {r.name}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p>
                    </div>
                  </div>
                ))}
              </CardSection>
            </div>
          </CollapsibleSection>

          {/* ─── SECTION 3 — Inspection day flow ─── */}
          <CollapsibleSection id="day-flow" icon={Calendar} iconColor="#10b981" title="Inspection day flow" isOpen={openSections.has("day-flow")} onToggle={() => toggleSection("day-flow")} isDark={isDark}>
            <div className="space-y-0">
              {FLOW_STEPS.map((step, i) => (
                <div key={i} className="flex gap-4 items-stretch">
                  <div className="w-24 shrink-0 flex flex-col items-end justify-start pr-3 pt-3">
                    <span className="text-[11px] font-semibold" style={{ color: step.color }}>{step.time}</span>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-3 h-3 rounded-full mt-3" style={{ background: step.color }} />
                    {i < FLOW_STEPS.length - 1 && <div className="w-0.5 flex-1 min-h-4" style={{ background: isDark ? "#1e3a5a" : "#e2e8f0" }} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 py-2">
                    <div className={clsx("rounded-lg p-2.5 text-[11px]", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}>
                      <p className="text-[10px] font-semibold text-[#0ea5e9] mb-1">FRONT ROOM</p>
                      <p style={{ color: "var(--text-secondary)" }}>{step.front}</p>
                    </div>
                    <div className={clsx("rounded-lg p-2.5 text-[11px]", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}>
                      <p className="text-[10px] font-semibold text-[#6366f1] mb-1">BACK ROOM</p>
                      <p style={{ color: "var(--text-secondary)" }}>{step.back}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ─── SECTION 4 — Escalation path ─── */}
          <CollapsibleSection id="escalation" icon={ChevronUp} iconColor="#ef4444" title="Escalation path" isOpen={openSections.has("escalation")} onToggle={() => toggleSection("escalation")} isDark={isDark}>
            <div className={clsx("rounded-xl border p-4", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}>
              {["QA Head \u2192 Operations Head \u2192 Super Admin", "CSV Lead \u2192 IT/CDO \u2192 QA Head", "Reg Affairs \u2192 QA Head \u2192 Legal"].map((p) => (
                <div key={p} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <ChevronRight className="w-3 h-3 text-[#ef4444] shrink-0" aria-hidden="true" /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{p}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ─── SECTION 5 — Daily touchpoints ─── */}
          <CollapsibleSection id="touchpoints" icon={Clock} iconColor="#f59e0b" title="Daily touchpoints" isOpen={openSections.has("touchpoints")} onToggle={() => toggleSection("touchpoints")} isDark={isDark}>
            <div className={clsx("rounded-xl border p-4", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}>
              {[{ time: "08:00", event: "Back room morning briefing" }, { time: "12:00", event: "Midday status check" }, { time: "17:00", event: "Front/back room debrief" }, { time: "20:00", event: "Overnight action review" }].map((t) => (
                <div key={t.time} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <span className="text-[11px] font-mono font-semibold text-[#f59e0b] w-12 shrink-0">{t.time}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{t.event}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ─── SECTION 6 — RACI ─── */}
          <CollapsibleSection id="raci" icon={ClipboardList} iconColor="#6366f1" title="RACI — key inspection activities" isOpen={openSections.has("raci")} onToggle={() => toggleSection("raci")} isDark={isDark}>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table" style={{ minWidth: 600 }} aria-label="RACI matrix">
                  <caption className="sr-only">RACI matrix for key inspection activities</caption>
                  <thead><tr><th scope="col">Activity</th><th scope="col">R — Responsible</th><th scope="col">A — Accountable</th><th scope="col">C — Consulted</th><th scope="col">I — Informed</th></tr></thead>
                  <tbody>
                    {RACI_DATA.map((r) => (
                      <tr key={r.activity}>
                        <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.activity}</th>
                        <td><Badge variant="blue">{r.r}</Badge></td>
                        <td><Badge variant="red">{r.a}</Badge></td>
                        <td><Badge variant="amber">{r.c}</Badge></td>
                        <td><Badge variant="gray">{r.i}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CollapsibleSection>
        </section>
      )}

      {/* ═══ TAB 3 — PLAYBOOKS ═══ */}
      {activeTab === "playbooks" && (
        <section aria-label="Inspection playbooks">
          {!selectedPlaybook ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {tenantPlaybooks.map((pb) => {
                const cfg = PB_CFG[pb.type];
                const PbIcon = cfg.icon;
                return (
                  <button key={pb.id} type="button" onClick={() => setSelectedPlaybook(pb)} className={clsx("card text-left cursor-pointer transition-colors hover:border-[#0ea5e9]", isDark ? "border-[#1e3a5a]" : "border-[#e2e8f0]")} aria-label={`Open ${pb.title}`}>
                    <div className="card-body">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: cfg.color + "18" }}><PbIcon className="w-5 h-5" style={{ color: cfg.color }} aria-hidden="true" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{pb.title}</p>
                          <Badge variant="gray">{pb.type}</Badge>
                        </div>
                      </div>
                      <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>{pb.description}</p>
                      <div className="flex gap-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span>{pb.steps.length} steps</span><span>{pb.templates.length} templates</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setSelectedPlaybook(null)} className="mb-4">All playbooks</Button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: PB_CFG[selectedPlaybook.type].color + "18" }}>
                  {(() => { const I = PB_CFG[selectedPlaybook.type].icon; return <I className="w-5 h-5" style={{ color: PB_CFG[selectedPlaybook.type].color }} aria-hidden="true" />; })()}
                </div>
                <div><p className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{selectedPlaybook.title}</p><p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedPlaybook.description}</p></div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Steps */}
                <div className="lg:col-span-2 space-y-4">
                  {selectedPlaybook.steps.map((step) => (
                    <div key={step.id} className="card">
                      <div className="card-body">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full bg-[#0ea5e9] flex items-center justify-center shrink-0"><span className="text-white text-[11px] font-bold">{step.order}</span></div>
                          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{step.action}</p>
                        </div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-[#10b981]">Do</p>
                        <ul className="space-y-1 mb-3 list-none p-0 m-0">
                          {step.do.map((d) => <li key={d} className="flex items-start gap-2 py-0.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#10b981] shrink-0 mt-0.5" aria-hidden="true" /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{d}</span></li>)}
                        </ul>
                        <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-[#ef4444]">Don't</p>
                        <ul className="space-y-1 list-none p-0 m-0">
                          {step.dont.map((d) => <li key={d} className="flex items-start gap-2 py-0.5"><X className="w-3.5 h-3.5 text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{d}</span></li>)}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Templates */}
                <div>
                  <CardSection icon={FileText} iconColor="#6366f1" title="Document templates">
                    {selectedPlaybook.templates.map((t) => (
                      <div key={t} className="flex items-center gap-2 py-2.5 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                        <FileText className="w-3.5 h-3.5 text-[#0ea5e9] shrink-0" aria-hidden="true" />
                        <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{t}</span>
                      </div>
                    ))}
                    <p className="text-[11px] italic mt-3" style={{ color: "var(--text-muted)" }}>Template downloads available when document storage is connected.</p>
                  </CardSection>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═══ TAB 4 — TRAINING ═══ */}
      {activeTab === "training" && (
        <section aria-label="Training and simulations" className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div><p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Training Records &amp; Simulations</p><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Track team training completion and mock inspection scores</p></div>
            {canManageSims ? (
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddSimOpen(true)}>Schedule simulation</Button>
            ) : (
              <p className="text-[11px] italic shrink-0 max-w-[200px] text-right" style={{ color: "var(--text-muted)" }}>Contact QA Head to schedule simulations</p>
            )}
          </div>

          {/* About this tab — dismissible info banner */}
          {showTrainingInfo && (
            <div
              role="region"
              aria-labelledby="training-info-title"
              className="flex items-start gap-3 p-4 rounded-xl border"
              style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}
            >
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <div className="flex-1 space-y-2">
                <p id="training-info-title" className="text-[12px] font-semibold" style={{ color: "var(--brand)" }}>About this tab</p>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>This tab tracks training completion and mock inspection scores.</p>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Actual training is conducted offline by your QA Head or Glimmora consultant.</p>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>QA Head marks training complete after each session.</p>
              </div>
              <button
                type="button"
                onClick={dismissTrainingInfo}
                aria-label="Dismiss info banner"
                className="p-1 rounded-md cursor-pointer border-none bg-transparent hover:bg-[rgba(14,165,233,0.18)]"
                style={{ color: "var(--brand)" }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Sim stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Clock} color="#0ea5e9" label="Scheduled" value={String(tenantSims.filter((s) => s.status === "Scheduled").length)} sub="Upcoming" />
            <StatCard icon={AlertTriangle} color="#f59e0b" label="In progress" value={String(tenantSims.filter((s) => s.status === "In Progress").length)} sub="Active now" />
            <StatCard icon={CheckCircle2} color="#10b981" label="Completed" value={String(tenantSims.filter((s) => s.status === "Completed").length)} sub="Done" />
            {(() => { const scores = tenantSims.filter((s) => s.score != null).map((s) => s.score!); const avg = scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length); return <StatCard icon={GraduationCap} color="#6366f1" label="Avg score" value={avg === null ? "\u2014" : `${avg}%`} sub={scores.length === 0 ? "No scores yet" : `From ${scores.length} simulation${scores.length !== 1 ? "s" : ""}`} />; })()}
          </div>

          {/* Sim 3-column grid */}
          {(() => {
            const todayStart = dayjs().tz(timezone).startOf("day");
            const isOverdueSim = (s: Simulation) => s.status === "Scheduled" && dayjs.utc(s.scheduledAt).tz(timezone).startOf("day").isBefore(todayStart);
            const byDate = (a: Simulation, b: Simulation) => dayjs(a.scheduledAt).diff(dayjs(b.scheduledAt));
            const overdueSims = tenantSims.filter(isOverdueSim).sort(byDate);
            const upcomingSims = tenantSims.filter((s) => (s.status === "Scheduled" && !isOverdueSim(s)) || s.status === "In Progress").sort(byDate);
            const completedSims = tenantSims.filter((s) => s.status === "Completed").sort((a, b) => dayjs(b.scheduledAt).diff(dayjs(a.scheduledAt)));

            const simTypeIcon = (type: Simulation["type"]): { Icon: LucideIcon; color: string } => {
              if (type === "Mock Inspection") return { Icon: Shield, color: "#ef4444" };
              if (type === "DIL Drill") return { Icon: FolderOpen, color: "#f59e0b" };
              if (type === "SME Q&A") return { Icon: GraduationCap, color: "#6366f1" };
              return { Icon: GraduationCap, color: "#6366f1" };
            };

            const scoreColor = (s: number) => s >= 90 ? "#10b981" : s >= 80 ? "#0ea5e9" : s >= 70 ? "#f59e0b" : "#ef4444";

            const SimCardHeader = ({ sim }: { sim: Simulation }) => {
              const { Icon, color } = simTypeIcon(sim.type);
              return (
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "18" }}>
                    <Icon className="w-4 h-4" style={{ color }} aria-hidden="true" />
                  </div>
                  <p className="text-[12.5px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{sim.title}</p>
                </div>
              );
            };

            const SimCardMeta = ({ sim, showTime = true }: { sim: Simulation; showTime?: boolean }) => (
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{dayjs.utc(sim.scheduledAt).tz(timezone).format(showTime ? "DD MMM YYYY HH:mm" : "DD MMM YYYY")}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{sim.duration} min</span>
                </div>
                <div className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <Users className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="line-clamp-2">{sim.participants.map((id) => ownerName(id)).join(", ")}</span>
                </div>
              </div>
            );

            const cardShell = (borderColor: string) => ({
              borderLeft: `3px solid ${borderColor}`,
            });

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* ─── COLUMN 1: OVERDUE ─── */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: isDark ? "rgba(239,68,68,0.08)" : "#FEF2F2", border: `1px solid ${isDark ? "rgba(239,68,68,0.2)" : "#FECACA"}` }}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#A32D2D" }} aria-hidden="true" />
                      <p className="text-[12.5px] font-semibold" style={{ color: isDark ? "#ef4444" : "#A32D2D" }}>Overdue</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: isDark ? "rgba(239,68,68,0.15)" : "#FECACA", color: isDark ? "#ef4444" : "#A32D2D" }}>
                      {overdueSims.length} simulation{overdueSims.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {overdueSims.length === 0 ? (
                    <div className="card p-4 text-center">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[#10b981]" aria-hidden="true" />
                      <p className="text-[12px] font-medium" style={{ color: "#10b981" }}>No overdue simulations</p>
                    </div>
                  ) : overdueSims.map((sim) => (
                    <div key={sim.id} className="card p-4" style={cardShell("#ef4444")}>
                      <SimCardHeader sim={sim} />
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>Overdue</span>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(sim.scheduledAt).tz(timezone).format("DD MMM YYYY")}</span>
                      </div>
                      <SimCardMeta sim={sim} />
                      {canCompleteSimulation && (
                        <Button variant="primary" size="sm" icon={CheckCircle2} fullWidth onClick={() => openStartSimulation(sim)}>Mark complete</Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* ─── COLUMN 2: UPCOMING ─── */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.08)" : "#FEF9EC", border: `1px solid ${isDark ? "rgba(245,158,11,0.2)" : "#FDE68A"}` }}>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" style={{ color: "#7A6200" }} aria-hidden="true" />
                      <p className="text-[12.5px] font-semibold" style={{ color: isDark ? "#f59e0b" : "#7A6200" }}>Upcoming</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: isDark ? "rgba(245,158,11,0.15)" : "#FDE68A", color: isDark ? "#f59e0b" : "#7A6200" }}>
                      {upcomingSims.length} simulation{upcomingSims.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {upcomingSims.length === 0 ? (
                    <div className="card p-4 text-center">
                      <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--text-secondary)" }}>No upcoming simulations</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Schedule one above</p>
                    </div>
                  ) : upcomingSims.map((sim) => {
                    const simDate = dayjs.utc(sim.scheduledAt).tz(timezone).startOf("day");
                    const dl = simDate.diff(todayStart, "day");
                    const isToday = dl === 0;
                    const isRunning = sim.status === "In Progress";
                    const borderColor = isRunning ? "#0ea5e9" : "#f59e0b";
                    return (
                      <div key={sim.id} className="card p-4" style={cardShell(borderColor)}>
                        <SimCardHeader sim={sim} />
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {isToday ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Today</span>
                          ) : dl === 1 ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}>Tomorrow</span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }}>{dl} days away</span>
                          )}
                          {isRunning && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(14,165,233,0.15)", color: "#0ea5e9" }}>In Progress</span>
                          )}
                        </div>
                        <SimCardMeta sim={sim} />
                        {isToday && sim.status === "Scheduled" && canManageSims && (
                          <Button variant="primary" size="sm" icon={Play} fullWidth onClick={() => openStartSimulation(sim)}>Start simulation</Button>
                        )}
                        {isRunning && canCompleteSimulation && (
                          <Button variant="primary" size="sm" icon={CheckCircle2} fullWidth onClick={() => openStartSimulation(sim)}>Complete &amp; score</Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ─── COLUMN 3: COMPLETED ─── */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: isDark ? "rgba(16,185,129,0.08)" : "#E8F5F1", border: `1px solid ${isDark ? "rgba(16,185,129,0.2)" : "#A7F0D4"}` }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#0F6E56" }} aria-hidden="true" />
                      <p className="text-[12.5px] font-semibold" style={{ color: isDark ? "#10b981" : "#0F6E56" }}>Completed</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: isDark ? "rgba(16,185,129,0.15)" : "#A7F0D4", color: isDark ? "#10b981" : "#0F6E56" }}>
                      {completedSims.length} simulation{completedSims.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {completedSims.length === 0 ? (
                    <div className="card p-4 text-center">
                      <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>No completed simulations yet</p>
                    </div>
                  ) : completedSims.map((sim) => (
                    <div key={sim.id} className="card p-4" style={cardShell("#10b981")}>
                      <SimCardHeader sim={sim} />
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(sim.scheduledAt).tz(timezone).format("DD MMM YYYY")}</span>
                        {sim.score != null && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: scoreColor(sim.score) + "18", color: scoreColor(sim.score) }}>{sim.score}%</span>
                        )}
                      </div>
                      <div className="flex items-start gap-1.5 text-[11px] mb-2" style={{ color: "var(--text-secondary)" }}>
                        <Users className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="line-clamp-2">{sim.participants.map((id) => ownerName(id)).join(", ")}</span>
                      </div>
                      {sim.notes && (
                        <p className="text-[11px] italic pt-2 border-t" style={{ color: "var(--text-muted)", borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>{sim.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Training matrix */}
          <p className="text-[13px] font-semibold mt-4" style={{ color: "var(--text-primary)" }}>Team training checklist</p>
          <div role="status" className="flex items-start gap-2 p-3 rounded-xl border" style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}>
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Mark your own training as complete on your row, or — as <strong style={{ color: "var(--brand)" }}>QA Head</strong> — update any user's training.
            </p>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table" style={{ minWidth: 700 }} aria-label="Training completion matrix">
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    {TRAINING_MODULES.map((m) => <th key={m} scope="col" className="text-[9px]" style={{ minWidth: 70 }}>{m}</th>)}
                    <th scope="col">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter((u) => !["super_admin", "customer_admin"].includes(u.role)).map((u) => {
                    const ut = training.filter((t) => t.userId === u.id && t.tenantId === tenantId);
                    const done = TRAINING_MODULES.filter((m) => ut.some((t) => t.module === m));
                    const pct = Math.round((done.length / TRAINING_MODULES.length) * 100);
                    return (
                      <tr key={u.id}>
                        <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{u.name}</th>
                        {TRAINING_MODULES.map((m) => {
                          const isDone = done.includes(m);
                          const canEdit = canEditTrainingFor(u.id);
                          if (canEdit) {
                            return (
                              <td key={m} className="text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isDone) {
                                      dispatch(removeTraining({ userId: u.id, module: m, tenantId: tenantId ?? "" }));
                                      auditLog({ action: "TRAINING_REMOVED", module: "readiness", recordId: `${u.id}:${m}`, newValue: { userId: u.id, module: m } });
                                    } else {
                                      dispatch(addTraining({ id: crypto.randomUUID(), userId: u.id, module: m, completedAt: dayjs().toISOString(), tenantId: tenantId ?? "" }));
                                      auditLog({ action: "TRAINING_COMPLETED", module: "readiness", recordId: `${u.id}:${m}`, newValue: { userId: u.id, module: m } });
                                    }
                                  }}
                                  aria-label={`${isDone ? "Untick" : "Mark"} ${m} for ${u.name}`}
                                  aria-pressed={isDone}
                                  className="w-4 h-4 rounded border mx-auto cursor-pointer transition-colors flex items-center justify-center p-0"
                                  style={{ background: isDone ? "#10b981" : "transparent", borderColor: isDone ? "#10b981" : isDark ? "#1e3a5a" : "#e2e8f0" }}
                                >
                                  {isDone && <CheckCircle2 className="w-3 h-3 text-white" aria-hidden="true" />}
                                </button>
                              </td>
                            );
                          }
                          return (
                            <td key={m} className="text-center">
                              <div
                                className="relative w-4 h-4 rounded border mx-auto flex items-center justify-center group"
                                style={{ background: isDone ? "var(--success-bg)" : "transparent", borderColor: isDone ? "#10b981" : isDark ? "#1e3a5a" : "#e2e8f0" }}
                                title="Only QA Head or the user themselves can update this training record"
                                aria-label={isDone ? `${m} complete for ${u.name} (read-only)` : `${m} not complete for ${u.name} (read-only)`}
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-3 h-3 text-[#10b981]" aria-hidden="true" />
                                ) : (
                                  <Lock className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td>
                          <div className="flex items-center gap-2">
                            <div className={clsx("h-1.5 rounded-full flex-1", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444" }} /></div>
                            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═══ ADD CARD MODAL ═══ */}
      <Modal open={addCardOpen} onClose={() => { setAddCardOpen(false); reset(); }} title="Add readiness action">
        <form onSubmit={handleSubmit(onCardSave)} noValidate className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Lane</p><Controller name="lane" control={control} render={({ field }) => <Dropdown options={LANE_OPTIONS} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Time bucket</p><Controller name="bucket" control={control} render={({ field }) => <Dropdown options={BUCKET_OPTIONS} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
          </div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Action *</p><Controller name="action" control={control} render={({ field }) => <textarea {...field} rows={2} className="input w-full resize-none" placeholder="e.g. Brief QA Head on inspection protocol" />} />{errors.action && <p className="text-[11px] text-[#ef4444] mt-1">{errors.action.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Owner *</p><Controller name="owner" control={control} render={({ field }) => <Dropdown options={users.map((u) => ({ value: u.id, label: u.name }))} value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" />} />{errors.owner && <p className="text-[11px] text-[#ef4444] mt-1">{errors.owner.message}</p>}</div>
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date *</p><Controller name="dueDate" control={control} render={({ field }) => <input type="date" {...field} className="input w-full" />} />{errors.dueDate && <p className="text-[11px] text-[#ef4444] mt-1">{errors.dueDate.message}</p>}</div>
          </div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>AGI risk</p><Controller name="agiRisk" control={control} render={({ field }) => <Dropdown options={RISK_OPTIONS} value={field.value} onChange={field.onChange} width="w-44" />} /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setAddCardOpen(false); reset(); }}>Cancel</Button>
            <Button type="submit" icon={Plus}>Add action</Button>
          </div>
        </form>
      </Modal>

      {/* ═══ ADD SIMULATION MODAL ═══ */}
      <Modal open={addSimOpen} onClose={() => { setAddSimOpen(false); simReset(); }} title="Schedule simulation">
        <form onSubmit={simSubmit(onSimSave)} noValidate className="space-y-3">
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Title *</p><Controller name="title" control={simCtl} render={({ field }) => <input {...field} className="input w-full" placeholder="e.g. Chennai QC Lab Mock Inspection" />} />{simErrors.title && <p className="text-[11px] text-[#ef4444] mt-1">{simErrors.title.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type</p><Controller name="type" control={simCtl} render={({ field }) => <Dropdown options={[{ value: "Mock Inspection", label: "Mock Inspection" }, { value: "DIL Drill", label: "DIL Drill" }, { value: "SME Q&A", label: "SME Q&A" }, { value: "Leadership Briefing", label: "Leadership Briefing" }]} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Duration (min) *</p><Controller name="duration" control={simCtl} render={({ field }) => <input type="number" min={15} step={15} {...field} className="input w-full" placeholder="90" />} />{simErrors.duration && <p className="text-[11px] text-[#ef4444] mt-1">{simErrors.duration.message}</p>}</div>
          </div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Date &amp; time *</p><Controller name="scheduledAt" control={simCtl} render={({ field }) => <input type="datetime-local" {...field} className="input w-full" />} />{simErrors.scheduledAt && <p className="text-[11px] text-[#ef4444] mt-1">{simErrors.scheduledAt.message}</p>}</div>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Participants *</p>
            <Dropdown
              multi
              searchable
              values={watchParticipants}
              onChangeMulti={(vals) => simSetValue("participants", vals)}
              options={simEligibleUsers.map((u) => ({ value: u.id, label: `${u.name} \u2014 ${roleLabel(u.role)}` }))}
              placeholder="Select participants..."
              searchPlaceholder="Search participants..."
              width="w-full"
            />
            {watchParticipants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {watchParticipants.map((id) => {
                  const u = simEligibleUsers.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
                    >
                      {u.name}
                      <button
                        type="button"
                        onClick={() => simSetValue("participants", watchParticipants.filter((x) => x !== id))}
                        aria-label={`Remove ${u.name}`}
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-pointer border-none bg-transparent hover:bg-[rgba(14,165,233,0.18)]"
                        style={{ color: "var(--brand)" }}
                      >
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {simErrors.participants && <p className="text-[11px] text-[#ef4444] mt-1">{simErrors.participants.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setAddSimOpen(false); simReset(); }}>Cancel</Button>
            <Button type="submit" icon={Plus}>Schedule</Button>
          </div>
        </form>
      </Modal>

      {/* ═══ COMPLETE SIMULATION MODAL ═══ */}
      <Modal open={!!activeSim} onClose={() => setActiveSim(null)} title="Complete Simulation">
        {activeSim && (
          <div className="space-y-4">
            {/* Sim details */}
            <div className={clsx("rounded-lg p-3 space-y-1", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}>
              <div className="flex items-start gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider min-w-[90px]" style={{ color: "var(--text-muted)" }}>Simulation</span>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{activeSim.title}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider min-w-[90px]" style={{ color: "var(--text-muted)" }}>Date</span>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(activeSim.scheduledAt).tz(timezone).format("DD/MM/YYYY")}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider min-w-[90px]" style={{ color: "var(--text-muted)" }}>Participants</span>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{activeSim.participants.map((id) => ownerName(id)).join(", ")}</span>
              </div>
            </div>

            {/* Score section */}
            <div className="pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Score</p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="sim-score-input" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>Score <span style={{ color: "#ef4444" }}>*</span></label>
                  <div className="flex items-center gap-2">
                    <input
                      id="sim-score-input"
                      type="number"
                      min={0}
                      max={100}
                      className="input w-28"
                      value={simScore}
                      onChange={(e) => { setSimScore(e.target.value); setSimScoreError(""); }}
                      aria-invalid={!!simScoreError}
                      aria-describedby={simScoreError ? "sim-score-error" : undefined}
                    />
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>%</span>
                  </div>
                  {simScoreError && <p id="sim-score-error" role="alert" className="text-[11px] text-[#ef4444] mt-1">{simScoreError}</p>}
                </div>
                <div>
                  <label htmlFor="sim-feedback-input" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>Feedback</label>
                  <textarea
                    id="sim-feedback-input"
                    rows={3}
                    className="input w-full resize-none"
                    value={simFeedback}
                    onChange={(e) => setSimFeedback(e.target.value)}
                    placeholder="Observations, strengths, areas to improve..."
                  />
                </div>
              </div>
            </div>

            {/* Update training records section */}
            <div className="pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Update training records</p>
              <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>Mark these modules complete for all participants?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
                {TRAINING_MODULES.map((m) => {
                  const checked = completeModules.has(m);
                  return (
                    <label key={m} className="flex items-center gap-2 py-1 px-2 cursor-pointer rounded-md hover:bg-[rgba(14,165,233,0.04)]">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-[#0ea5e9] cursor-pointer"
                        checked={checked}
                        onChange={() => toggleCompleteModule(m)}
                      />
                      <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{m}</span>
                    </label>
                  );
                })}
              </div>
              {completeModules.size > 0 && (
                <div className={clsx("rounded-lg p-2.5", isDark ? "bg-[rgba(14,165,233,0.08)] border border-[rgba(14,165,233,0.2)]" : "bg-[#eff6ff] border border-[#bfdbfe]")}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: "var(--brand)" }}>For participants:</p>
                  <ul className="space-y-0.5 list-none p-0 m-0">
                    {activeSim.participants.map((id) => (
                      <li key={id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        <CheckCircle2 className="w-3 h-3 text-[#10b981] shrink-0" aria-hidden="true" />
                        {ownerName(id)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
              <Button variant="secondary" onClick={() => setActiveSim(null)}>Cancel</Button>
              <Button variant="primary" icon={CheckCircle2} onClick={completeActiveSimulation}>Save &amp; update training</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Popups */}
      <Popup isOpen={cardSavedPopup} variant="success" title="Action added" description="Readiness action added to the swimlane." onDismiss={() => setCardSavedPopup(false)} />
      <Popup isOpen={simSavedPopup} variant="success" title="Simulation scheduled" description="Added to training calendar. Notify participants." onDismiss={() => setSimSavedPopup(false)} />
      <Popup isOpen={simCompletedPopup} variant="success" title="Simulation complete" description={simCompletedMsg} onDismiss={() => setSimCompletedPopup(false)} />
      <Popup isOpen={markCompletePopup} variant="success" title="Action marked complete" description={markCompleteMsg} onDismiss={() => setMarkCompletePopup(false)} />

      {/* ═══ REOPEN CONFIRMATION MODAL ═══ */}
      <Modal open={!!reopenTarget} onClose={() => setReopenTarget(null)} title="Reopen this action?">
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The action will return to <strong>Not Started</strong>. Completion metadata will be cleared and the readiness score will recalculate.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setReopenTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={confirmReopen}>Reopen</Button>
          </div>
        </div>
      </Modal>

      {/* ═══ CREATE INSPECTION MODAL ═══ */}
      <Modal open={createInspOpen} onClose={() => setCreateInspOpen(false)} title="Create New Inspection">
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Inspection title *</p><input className="input w-full" value={inspTitle} onChange={(e) => setInspTitle(e.target.value)} placeholder="FDA GMP Inspection Q2 2026" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Agency *</p><Dropdown value={inspAgency} onChange={(v) => setInspAgency(v as InspectionAgency)} options={["FDA", "EMA", "MHRA", "WHO", "Internal"].map((a) => ({ value: a, label: a }))} width="w-full" /></div>
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type *</p><Dropdown value={inspType} onChange={(v) => setInspType(v as InspectionType)} options={[{ value: "announced", label: "Announced" }, { value: "unannounced", label: "Unannounced" }, { value: "follow_up", label: "Follow-up" }, { value: "pre_approval", label: "Pre-approval" }]} width="w-full" /></div>
          </div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Site *</p><Dropdown value={inspSite} onChange={setInspSite} options={allSites.map((s) => ({ value: s.id, label: s.name }))} width="w-full" placeholder="Select site..." /></div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Expected date (optional)</p><input type="date" className="input w-full" value={inspDate} onChange={(e) => setInspDate(e.target.value)} /></div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Inspection lead *</p><Dropdown value={inspLead} onChange={setInspLead} options={users.filter((u) => u.role === "qa_head" || u.role === "customer_admin").map((u) => ({ value: u.id, label: u.name }))} width="w-full" placeholder="Select lead..." /></div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes (optional)</p><textarea rows={2} className="input w-full resize-none" value={inspNotes} onChange={(e) => setInspNotes(e.target.value)} placeholder="Context or background..." /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setCreateInspOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Plus} disabled={!inspTitle.trim() || !inspSite || !inspLead} onClick={handleCreateInspection}>Create Inspection</Button>
          </div>
        </div>
      </Modal>
      <Popup isOpen={inspCreatedPopup} variant="success" title="Inspection created" description={`${inspTitle || "Inspection"} created. Readiness: 0%`} onDismiss={() => setInspCreatedPopup(false)} />
    </main>
  );
}

/* ── Collapsible section for Governance tab ── */
interface CollapsibleSectionProps {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  children: ReactNode;
}

function CollapsibleSection({ id, icon: Icon, iconColor, title, isOpen, onToggle, isDark, children }: CollapsibleSectionProps) {
  const panelId = `gov-panel-${id}`;
  const btnId = `gov-btn-${id}`;
  return (
    <div>
      <button
        id={btnId}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between cursor-pointer border transition-colors"
        style={{
          padding: "14px 20px",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isDark ? "#1e3a5a" : "#e2e8f0",
          background: isDark ? "#0a1f38" : "#ffffff",
          color: "var(--text-primary)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "#0d2a4a" : "#f8fafc"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isDark ? "#0a1f38" : "#ffffff"; }}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor }} aria-hidden="true" />
          <span className="text-[13px] font-semibold">{title}</span>
        </span>
        <ChevronDown
          className="w-4 h-4 shrink-0 transition-transform duration-200"
          style={{ color: "var(--text-secondary)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
