import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Map, Shield, BookOpen, GraduationCap, Users, GitBranch, Database, Monitor,
  FileText, ClipboardList, CheckCircle2, Clock, AlertTriangle, Plus, ArrowLeft,
  FolderOpen, ChevronRight, ChevronUp, UserCheck, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";

import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import {
  addCard, updateCard, addSimulation, addTraining,
  type Playbook, type ReadinessLane, type ReadinessBucket, type ReadinessStatus,
  type PlaybookType,
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
  { id: "roadmap", label: "Roadmap", Icon: Map },
  { id: "governance", label: "Governance", Icon: Shield },
  { id: "playbooks", label: "Playbooks", Icon: BookOpen },
  { id: "training", label: "Training", Icon: GraduationCap },
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
  const { cards, playbooks, simulations, training, score: readinessScore, complete: completeCount, total: totalCards } = useAppSelector((s) => s.readiness);
  const { users, tenantId } = useTenantConfig();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { role } = useRole();

  const tenantCards = cards.filter((c) => c.tenantId === tenantId);
  const tenantPlaybooks = playbooks.filter((p) => p.tenantId === tenantId);
  const tenantSims = simulations.filter((s) => s.tenantId === tenantId);

  const inProgressCount = tenantCards.filter((c) => c.status === "In Progress").length;
  const overdueCount = tenantCards.filter((c) => c.status !== "Complete" && dayjs.utc(c.dueDate).isBefore(dayjs())).length;

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  const [activeTab, setActiveTab] = useState<TabId>("roadmap");
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addSimOpen, setAddSimOpen] = useState(false);
  const [cardSavedPopup, setCardSavedPopup] = useState(false);
  const [simSavedPopup, setSimSavedPopup] = useState(false);
  const [laneFilter, setLaneFilter] = useState("");

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
                            const sc = card.status === "Complete" ? "#10b981" : card.status === "In Progress" ? "#f59e0b" : isOd ? "#ef4444" : "#64748b";
                            return (
                              <div key={card.id} className={clsx("rounded-lg p-2.5 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]", card.status === "Complete" && "opacity-60")}>
                                <p className="text-[11px] font-medium leading-relaxed mb-2" style={{ color: "var(--text-primary)" }}>{card.status === "Complete" ? "\u2713 " : ""}{card.action}</p>
                                <div className="flex items-end justify-between">
                                  <div>
                                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{ownerName(card.owner)}</p>
                                    <p className="text-[10px]" style={{ color: isOd ? "#ef4444" : "var(--text-muted)" }}>{dayjs.utc(card.dueDate).tz(timezone).format("DD MMM")}{isOd && " \u2014 Overdue"}</p>
                                  </div>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: rc + "18", color: rc }}>{card.agiRisk}</span>
                                </div>
                                {role !== "viewer" && (
                                  <div className="mt-2 pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                                    <select value={card.status} onChange={(e) => { const newStatus = e.target.value as ReadinessStatus; dispatch(updateCard({ id: card.id, patch: { status: newStatus, ...(newStatus === "Complete" ? { completedAt: dayjs().toISOString() } : { completedAt: undefined }) } })); auditLog({ action: "READINESS_CARD_UPDATED", module: "readiness", recordId: card.id, newValue: { status: newStatus } }); }} className="text-[10px] w-full rounded border-none cursor-pointer bg-transparent outline-none" style={{ color: sc }} aria-label={`Status: ${card.action}`}>
                                      <option value="Not Started">Not Started</option>
                                      <option value="In Progress">In Progress</option>
                                      <option value="Complete">Complete</option>
                                      <option value="Overdue">Overdue</option>
                                    </select>
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
        <section aria-label="Governance model" className="space-y-6">
          {/* Info */}
          <div className={clsx("flex items-start gap-3 p-4 rounded-xl border", isDark ? "bg-[rgba(14,165,233,0.06)] border-[rgba(14,165,233,0.15)]" : "bg-[#eff6ff] border-[#bfdbfe]")}>
            <AlertTriangle className="w-4 h-4 text-[#0ea5e9] shrink-0 mt-0.5" aria-hidden="true" />
            <div><p className="text-[12px] font-medium text-[#0ea5e9]">War room model</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>During an FDA inspection, two parallel teams operate. Front room faces the inspector. Back room coordinates evidence and responses.</p></div>
          </div>

          {/* Front/Back rooms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSection icon={UserCheck} iconColor="#0ea5e9" title="Front room">
              {[{ role: "QA Head", resp: "Lead inspector contact" }, { role: "Regulatory Affairs", resp: "Document response" }, { role: "SME (on-call)", resp: "Technical questions" }, { role: "Scribe", resp: "Log all requests" }].map((r) => (
                <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#0ea5e9]" />
                  <div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p><p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p></div>
                </div>
              ))}
            </CardSection>
            <CardSection icon={Shield} iconColor="#6366f1" title="Back room">
              {[{ role: "Evidence Lead", resp: "Retrieve + review documents" }, { role: "CSV/Val Lead", resp: "System evidence support" }, { role: "QC Lab Director", resp: "Lab records and data" }, { role: "Legal/QP", resp: "Regulatory risk advice" }].map((r) => (
                <div key={r.role} className="flex items-start gap-3 py-2.5 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-[#6366f1]" />
                  <div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.role}</p><p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.resp}</p></div>
                </div>
              ))}
            </CardSection>
          </div>

          {/* Flow */}
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Inspection day flow</p>
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

          {/* Escalation + Touchpoints */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSection icon={ChevronUp} iconColor="#ef4444" title="Escalation path">
              {["QA Head \u2192 Operations Head \u2192 Super Admin", "CSV Lead \u2192 IT/CDO \u2192 QA Head", "Reg Affairs \u2192 QA Head \u2192 Legal"].map((p) => (
                <div key={p} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <ChevronRight className="w-3 h-3 text-[#ef4444] shrink-0" aria-hidden="true" /><span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{p}</span>
                </div>
              ))}
            </CardSection>
            <CardSection icon={Clock} iconColor="#f59e0b" title="Daily touchpoints">
              {[{ time: "08:00", event: "Back room morning briefing" }, { time: "12:00", event: "Midday status check" }, { time: "17:00", event: "Front/back room debrief" }, { time: "20:00", event: "Overnight action review" }].map((t) => (
                <div key={t.time} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
                  <span className="text-[11px] font-mono font-semibold text-[#f59e0b] w-12 shrink-0">{t.time}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{t.event}</span>
                </div>
              ))}
            </CardSection>
          </div>

          {/* RACI */}
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>RACI \u2014 key inspection activities</p>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table" style={{ minWidth: 600 }} aria-label="RACI matrix">
                <caption className="sr-only">RACI matrix for key inspection activities</caption>
                <thead><tr><th scope="col">Activity</th><th scope="col">R \u2014 Responsible</th><th scope="col">A \u2014 Accountable</th><th scope="col">C \u2014 Consulted</th><th scope="col">I \u2014 Informed</th></tr></thead>
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
            <div><p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Training &amp; Simulations</p><p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Mock inspections, DIL drills, and team training progress</p></div>
            {role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddSimOpen(true)}>Schedule simulation</Button>}
          </div>
          {/* Sim stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Clock} color="#0ea5e9" label="Scheduled" value={String(tenantSims.filter((s) => s.status === "Scheduled").length)} sub="Upcoming" />
            <StatCard icon={AlertTriangle} color="#f59e0b" label="In progress" value={String(tenantSims.filter((s) => s.status === "In Progress").length)} sub="Active now" />
            <StatCard icon={CheckCircle2} color="#10b981" label="Completed" value={String(tenantSims.filter((s) => s.status === "Completed").length)} sub="Done" />
            {(() => { const scores = tenantSims.filter((s) => s.score != null).map((s) => s.score!); const avg = scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length); return <StatCard icon={GraduationCap} color="#6366f1" label="Avg score" value={avg === null ? "\u2014" : `${avg}%`} sub={scores.length === 0 ? "No scores yet" : `From ${scores.length} simulation${scores.length !== 1 ? "s" : ""}`} />; })()}
          </div>

          {/* Upcoming */}
          <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Upcoming simulations</p>
          {tenantSims.filter((s) => s.status !== "Completed" && s.status !== "Cancelled").length === 0 ? (
            <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>No simulations scheduled.</p>
          ) : tenantSims.filter((s) => s.status !== "Completed" && s.status !== "Cancelled").sort((a, b) => dayjs(a.scheduledAt).diff(dayjs(b.scheduledAt))).map((sim) => {
            const dl = dayjs.utc(sim.scheduledAt).diff(dayjs(), "day");
            return (
              <div key={sim.id} className="card p-4 mb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: (sim.type === "Mock Inspection" ? "#ef4444" : sim.type === "DIL Drill" ? "#f59e0b" : sim.type === "SME Q&A" ? "#10b981" : "#6366f1") + "18" }}>
                      {sim.type === "Mock Inspection" ? <Shield className="w-5 h-5 text-[#ef4444]" /> : sim.type === "DIL Drill" ? <FolderOpen className="w-5 h-5 text-[#f59e0b]" /> : sim.type === "SME Q&A" ? <Users className="w-5 h-5 text-[#10b981]" /> : <GraduationCap className="w-5 h-5 text-[#6366f1]" />}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{sim.title}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(sim.scheduledAt).tz(timezone).format("DD MMM YYYY HH:mm")} &middot; {sim.duration} min</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sim.participants.map((id) => ownerName(id)).join(", ")}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-semibold" style={{ color: dl <= 3 ? "#ef4444" : dl <= 7 ? "#f59e0b" : "#10b981" }}>{dl === 0 ? "Today" : dl === 1 ? "Tomorrow" : dl < 0 ? "Overdue" : `${dl} days`}</p>
                    <Badge variant={sim.status === "Scheduled" ? "blue" : "amber"}>{sim.status}</Badge>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Completed */}
          {tenantSims.filter((s) => s.status === "Completed").length > 0 && (
            <>
              <p className="text-[13px] font-semibold mt-4" style={{ color: "var(--text-primary)" }}>Completed simulations</p>
              {tenantSims.filter((s) => s.status === "Completed").map((sim) => (
                <div key={sim.id} className="card p-4 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{sim.title}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(sim.scheduledAt).tz(timezone).format("DD MMM YYYY")} &middot; {sim.participants.map((id) => ownerName(id)).join(", ")}</p>
                    </div>
                    {sim.score != null && (
                      <div className="text-right shrink-0">
                        <p className="text-[24px] font-bold" style={{ color: sim.score >= 80 ? "#10b981" : sim.score >= 60 ? "#f59e0b" : "#ef4444" }}>{sim.score}%</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Score</p>
                      </div>
                    )}
                  </div>
                  {sim.notes && <p className="text-[11px] italic mt-2 pt-2 border-t" style={{ color: "var(--text-secondary)", borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>{sim.notes}</p>}
                </div>
              ))}
            </>
          )}

          {/* Training matrix */}
          <p className="text-[13px] font-semibold mt-4" style={{ color: "var(--text-primary)" }}>Team training checklist</p>
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
                  {users.map((u) => {
                    const ut = training.filter((t) => t.userId === u.id && t.tenantId === tenantId);
                    const done = TRAINING_MODULES.filter((m) => ut.some((t) => t.module === m));
                    const pct = Math.round((done.length / TRAINING_MODULES.length) * 100);
                    return (
                      <tr key={u.id}>
                        <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{u.name}</th>
                        {TRAINING_MODULES.map((m) => {
                          const isDone = done.includes(m);
                          return (
                            <td key={m} className="text-center">
                              {isDone ? <CheckCircle2 className="w-4 h-4 text-[#10b981] mx-auto" aria-label="Complete" /> : role !== "viewer" ? (
                                <button type="button" onClick={() => dispatch(addTraining({ id: crypto.randomUUID(), userId: u.id, module: m, completedAt: dayjs().toISOString(), tenantId: tenantId ?? "" }))} className="w-4 h-4 rounded border mx-auto cursor-pointer hover:border-[#10b981] transition-colors block bg-transparent" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }} aria-label={`Mark ${m} complete for ${u.name}`} />
                              ) : <div className="w-4 h-4 rounded border mx-auto" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }} />}
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
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-3 py-1.5 px-2 cursor-pointer rounded-lg hover:bg-[rgba(14,165,233,0.04)]">
                  <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={watchParticipants.includes(u.id)} onChange={() => { const c = watchParticipants; simSetValue("participants", c.includes(u.id) ? c.filter((x) => x !== u.id) : [...c, u.id]); }} />
                  <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{u.name}</span>
                  <Badge variant="gray">{u.role}</Badge>
                </label>
              ))}
            </div>
            {simErrors.participants && <p className="text-[11px] text-[#ef4444] mt-1">{simErrors.participants.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setAddSimOpen(false); simReset(); }}>Cancel</Button>
            <Button type="submit" icon={Plus}>Schedule</Button>
          </div>
        </form>
      </Modal>

      {/* Popups */}
      <Popup isOpen={cardSavedPopup} variant="success" title="Action added" description="Readiness action added to the swimlane." onDismiss={() => setCardSavedPopup(false)} />
      <Popup isOpen={simSavedPopup} variant="success" title="Simulation scheduled" description="Added to training calendar. Notify participants." onDismiss={() => setSimSavedPopup(false)} />
    </main>
  );
}
