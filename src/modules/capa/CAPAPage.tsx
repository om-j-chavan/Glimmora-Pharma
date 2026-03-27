import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  ClipboardCheck, GitBranch, BarChart3, Plus, Search, X, ChevronRight,
  AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, Clock,
  Link2, ShieldCheck, Send, FileText, Wrench, Shield, MessageSquare, Save, Pencil,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults } from "@/lib/chartColors";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import {
  addCAPA, updateCAPA, closeCAPA,
  type CAPA, type CAPARisk, type CAPAStatus, type RCAMethod,
} from "@/store/capa.slice";
import { closeFinding } from "@/store/findings.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";
import type { UserConfig } from "@/store/settings.slice";

/* ── Constants ── */

type TabId = "blueprint" | "tracker" | "metrics";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "blueprint", label: "QMS Blueprint", Icon: GitBranch },
  { id: "tracker", label: "CAPA Tracker", Icon: ClipboardCheck },
  { id: "metrics", label: "Metrics", Icon: BarChart3 },
];

const QMS_PROCESSES = [
  { title: "Deviation Management", Icon: AlertTriangle, color: "#f59e0b", sourceKey: "Deviation" as const, targetState: "Risk-based classification within 24h. DI gate check for all deviations. Trend monitoring for recurrence.", currentGap: "Recurrence detection is manual \u2014 AGI deviation intelligence not yet active." },
  { title: "Change Control", Icon: GitBranch, color: "#6366f1", sourceKey: "Change Control" as const, targetState: "Impact assessment before any GMP change. CSV review for system changes. QA approval mandatory.", currentGap: "Change control SOP last reviewed 2023 \u2014 update required for Annex 11 alignment." },
  { title: "Complaint Handling", Icon: MessageSquare, color: "#0ea5e9", sourceKey: "Complaint" as const, targetState: "Complaint triage within 24h. Serious complaints trigger CAPA automatically. Monthly trend analysis.", currentGap: "Complaint data not yet integrated. Manual review process in place." },
];

/* ── Helpers ── */

const RISK_VARIANT: Record<CAPARisk, "red" | "amber" | "gray"> = { Critical: "red", Major: "amber", Minor: "gray" };
const STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green"> = { Open: "blue", "In Progress": "amber", "Pending QA Review": "purple", Closed: "green" };

function riskBadge(r: CAPARisk) { return <Badge variant={RISK_VARIANT[r]}>{r}</Badge>; }
function capaStatusBadge(s: CAPAStatus) { return <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>; }
function ownerName(uid: string, users: UserConfig[]) { return users.find((u) => u.id === uid)?.name ?? uid; }
function riskLevel(r: CAPARisk): string { return r === "Critical" ? "High" : r === "Major" ? "Medium" : "Low"; }
function riskVariant(r: CAPARisk): "red" | "amber" | "green" { return r === "Critical" ? "red" : r === "Major" ? "amber" : "green"; }

/* ── Zod ── */
const capaSchema = z.object({
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"]),
  risk: z.enum(["Critical", "Major", "Minor"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  description: z.string().min(10, "Description required"),
  rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
  effectivenessCheck: z.boolean(),
  diGate: z.boolean(),
  findingId: z.string().optional(),
});
type CAPAForm = z.infer<typeof capaSchema>;

/* ══════════════════════════════════════ */

export function CAPAPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { role, canSign, canCloseCapa, isViewOnly } = useRole();

  const capas = useAppSelector((s) => s.capa.items);
  const users = useAppSelector((s) => s.settings.users);
  const timezone = useAppSelector((s) => s.settings.org.timezone);
  const dateFormat = useAppSelector((s) => s.settings.org.dateFormat);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("blueprint");
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedCAPAId, setSelectedCAPAId] = useState<string | null>(null);
  const selectedCAPA = selectedCAPAId ? capas.find((c) => c.id === selectedCAPAId) ?? null : null;
  const setSelectedCAPA = (c: CAPA | null) => setSelectedCAPAId(c?.id ?? null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signedPopup, setSignedPopup] = useState(false);
  const [submittedPopup, setSubmittedPopup] = useState(false);
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [effectivenessConfirmed, setEffectivenessConfirmed] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSavedPopup, setEditSavedPopup] = useState(false);

  const anyFilterActive = !!(search || statusFilter || riskFilter || sourceFilter);
  function clearFilters() { setSearch(""); setStatusFilter(""); setRiskFilter(""); setSourceFilter(""); }

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

  const filteredCAPAs = useMemo(() =>
    capas.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (riskFilter && c.risk !== riskFilter) return false;
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (search && !c.id.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
  [capas, statusFilter, riskFilter, sourceFilter, search]);

  /* ── Blueprint computed ── */
  const noRCACount = capas.filter((c) => c.status !== "Closed" && c.status !== "Pending QA Review" && (!c.rca || c.rca.trim().length === 0)).length;
  const criticalOpenCount = capas.filter((c) => c.risk === "Critical" && c.status !== "Closed").length;
  const pendingReviewCount = capas.filter((c) => c.status === "Pending QA Review").length;

  function getProcessMetrics(sourceKey: string) {
    const src = capas.filter((c) => c.source === sourceKey);
    return {
      open: src.filter((c) => c.status !== "Closed").length,
      thisMonth: src.filter((c) => c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === dayjs().format("MMM YYYY")).length,
      overdue: src.filter((c) => c.status !== "Closed" && dayjs.utc(c.dueDate).isBefore(dayjs())).length,
    };
  }

  function stepHasProblem(step: number): boolean {
    if (step === 2) return criticalOpenCount > 0;
    if (step === 3) return noRCACount > 0;
    if (step === 5) return pendingReviewCount > 0;
    if (step === 6) return pendingReviewCount > 0;
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

  /* ── Metrics ── */
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
  const hasTrendData = riskSignalData.some((d) => d["483"] + d["Internal Audit"] + d.Deviation + d["Gap Assessment"] > 0);

  const statusDonut = useMemo(() =>
    ([
      { name: "Open", value: capas.filter((c) => c.status === "Open").length, fill: "#0ea5e9" },
      { name: "In Progress", value: capas.filter((c) => c.status === "In Progress").length, fill: "#f59e0b" },
      { name: "Pending QA", value: capas.filter((c) => c.status === "Pending QA Review").length, fill: "#6366f1" },
      { name: "Closed", value: capas.filter((c) => c.status === "Closed").length, fill: "#10b981" },
    ] as const).filter((d) => d.value > 0),
  [capas]);

  const sourceBreakdown = useMemo(() => {
    const srcs = ["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"] as const;
    return srcs.map((s) => ({ source: s, count: capas.filter((c) => c.source === s).length })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  }, [capas]);
  const maxSrcCount = sourceBreakdown.length > 0 ? sourceBreakdown[0].count : 1;

  /* ── Form ── */
  const { register: reg, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<CAPAForm>({
    resolver: zodResolver(capaSchema),
    defaultValues: { source: "Gap Assessment", risk: "Major", effectivenessCheck: true, diGate: false },
  });

  function onSubmit(data: CAPAForm) {
    const newId = `CAPA-${String(Date.now()).slice(-4)}`;
    dispatch(addCAPA({ ...data, id: newId, evidenceLinks: [], status: "Open", createdAt: "", rcaMethod: data.rcaMethod as RCAMethod | undefined, rca: undefined, correctiveActions: undefined, findingId: data.findingId || undefined }));
    auditLog({ action: "CAPA_CREATED", module: "capa", recordId: newId, newValue: data });
    setAddOpen(false); setAddedPopup(true); reset();
  }

  /* ── Edit CAPA form ── */
  const editSchema = z.object({
    description: z.string().min(5, "Description required"),
    owner: z.string().min(1, "Owner required"),
    dueDate: z.string().min(1, "Due date required"),
    risk: z.enum(["Critical", "Major", "Minor"]),
    rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
    rca: z.string().optional(),
    correctiveActions: z.string().optional(),
    effectivenessCheck: z.boolean(),
    diGate: z.boolean(),
  });
  type EditForm = z.infer<typeof editSchema>;

  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (selectedCAPA) {
      editForm.reset({
        description: selectedCAPA.description,
        owner: selectedCAPA.owner,
        dueDate: dayjs.utc(selectedCAPA.dueDate).format("YYYY-MM-DD"),
        risk: selectedCAPA.risk,
        rcaMethod: selectedCAPA.rcaMethod ?? undefined,
        rca: selectedCAPA.rca ?? "",
        correctiveActions: selectedCAPA.correctiveActions ?? "",
        effectivenessCheck: selectedCAPA.effectivenessCheck,
        diGate: selectedCAPA.diGate,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCAPAId]);

  function onEditSave(data: EditForm) {
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
        ...(autoAdvance ? { status: "In Progress" as const } : {}),
      },
    }));
    auditLog({ action: "CAPA_UPDATED", module: "capa", recordId: selectedCAPA.id, newValue: data });
    setEditModalOpen(false); setEditSavedPopup(true);
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="QMS and CAPA tracker" className="w-full max-w-[1440px] mx-auto space-y-6">
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

      {/* ═══════════ QMS BLUEPRINT ═══════════ */}
      <div role="tabpanel" id="panel-blueprint" aria-labelledby="tab-blueprint" tabIndex={0} hidden={activeTab !== "blueprint"}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>CAPA lifecycle</h2>
          {openCAPAs.length === 0 ? <Badge variant="green">All clear</Badge> : <Badge variant="blue">{openCAPAs.length} active</Badge>}
          {noRCACount > 0 && <Badge variant="amber">{noRCACount} missing RCA</Badge>}
          {pendingReviewCount > 0 && <Badge variant="purple">{pendingReviewCount} pending review</Badge>}
        </div>

        {/* Lifecycle flow */}
        <div className="flex items-stretch overflow-x-auto pb-2 gap-0">
          {LIFECYCLE_STEPS.map((step, i) => (
            <div key={step.step} className="flex items-stretch">
              <button type="button" role="button" aria-expanded={selectedStep === step.step}
                onClick={() => setSelectedStep(selectedStep === step.step ? null : step.step)}
                className={clsx("flex-shrink-0 w-[148px] rounded-xl overflow-hidden border-t-2 p-3 text-left bg-transparent outline-none cursor-pointer transition-all duration-150",
                  isDark ? "border border-[#1e3a5a]" : "border border-[#e2e8f0]",
                  selectedStep === step.step && "ring-2 ring-offset-1")}
                style={{ borderTopColor: step.color, background: isDark ? "#0a1f38" : "#ffffff", ...(selectedStep === step.step ? { boxShadow: `0 0 0 2px ${step.color}` } : {}) }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: step.color + "18" }}>
                    <step.Icon className="w-4 h-4" style={{ color: step.color }} aria-hidden="true" />
                  </div>
                  <span className="flex items-center gap-1">
                    {stepHasProblem(step.step) && <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] shrink-0" aria-label="Needs attention" />}
                    <span className="text-[10px] font-bold" style={{ color: step.color }}>Step {step.step}</span>
                  </span>
                </div>
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{step.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{step.desc}</p>
              </button>
              {i < LIFECYCLE_STEPS.length - 1 && <div className="flex-shrink-0 self-center mx-0.5" aria-hidden="true"><ChevronRight className="w-4 h-4" style={{ color: "#1e3a5a" }} /></div>}
            </div>
          ))}
        </div>

        {selectedStep !== null && (() => {
          const s = LIFECYCLE_STEPS[selectedStep - 1];
          if (!s) return null;
          return (
            <div className="card mt-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <s.Icon className="w-4 h-4" style={{ color: s.color }} aria-hidden="true" />
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Step {s.step}: {s.label}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#10b981" }}>Target state</p><p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.targetState}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#f59e0b" }}>Current gap</p><p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.currentGap}</p></div>
              </div>
            </div>
          );
        })()}

        {/* QMS process cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {QMS_PROCESSES.map((proc) => {
            const metrics = getProcessMetrics(proc.sourceKey);
            const hasData = metrics.open > 0 || metrics.thisMonth > 0 || metrics.overdue > 0;
            return (
              <article key={proc.title} className="card overflow-hidden">
                <div className="card-header">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: proc.color + "18" }}><proc.Icon className="w-4 h-4" style={{ color: proc.color }} aria-hidden="true" /></div>
                    <span className="card-title">{proc.title}</span>
                  </div>
                </div>
                <div className="card-body space-y-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#10b981" }}>Target state</p><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proc.targetState}</p></div>
                  <div className="border-t" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }} />
                  <div><p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#f59e0b" }}>Current gap</p><p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proc.currentGap}</p></div>
                  {hasData ? (
                    <div className="flex gap-6 pt-2">
                      {[
                        { label: "Open", value: metrics.open, color: metrics.open > 0 ? "#f59e0b" : "#10b981" },
                        { label: "This month", value: metrics.thisMonth, color: "var(--text-primary)" },
                        { label: "Overdue", value: metrics.overdue, color: metrics.overdue > 0 ? "#ef4444" : "#10b981" },
                      ].map((m) => (
                        <div key={m.label} className="flex flex-col">
                          <span className="text-[18px] font-bold" style={{ color: m.color }}>{m.value}</span>
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] italic pt-1" style={{ color: "var(--text-muted)" }}>No {proc.title.toLowerCase()} CAPAs yet. Create a CAPA with source &ldquo;{proc.sourceKey}&rdquo; to track here.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* ═══════════ CAPA TRACKER ═══════════ */}
      <div role="tabpanel" id="panel-tracker" aria-labelledby="tab-tracker" tabIndex={0} hidden={activeTab !== "tracker"}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
            <input type="search" className="input pl-8 text-[12px]" placeholder="Search CAPAs..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search CAPAs" />
          </div>
          <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, { value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Pending QA Review", label: "Pending QA Review" }, { value: "Closed", label: "Closed" }]} />
          <Dropdown placeholder="All risks" value={riskFilter} onChange={setRiskFilter} width="w-32" options={[{ value: "", label: "All risks" }, { value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />
          <Dropdown placeholder="All sources" value={sourceFilter} onChange={setSourceFilter} width="w-40" options={[{ value: "", label: "All sources" }, { value: "483", label: "483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />
          {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
          {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>New CAPA</Button>}
        </div>

        <div className={clsx("grid gap-4", selectedCAPA ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1")}>
          {/* Table */}
          <div className={clsx(selectedCAPA ? "lg:col-span-2" : "", "overflow-x-auto")}>
            {filteredCAPAs.length === 0 ? (
              <div className="card p-8 text-center">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
                {capas.length === 0 ? (
                  <>
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No CAPAs raised yet</p>
                    <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>CAPAs are raised from Gap Assessment findings, or you can create one manually.</p>
                    <div className="flex gap-3 justify-center mt-3">
                      {!isViewOnly && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Create CAPA</Button>}
                      <Button variant="ghost" onClick={() => navigate("/gap-assessment")}>Go to Gap Assessment</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No CAPAs match the current filters</p>
                    {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2">Clear filters</Button>}
                  </>
                )}
              </div>
            ) : (
              <table className="data-table" aria-label="CAPA register">
                <caption className="sr-only">Corrective and preventive actions with RCA, status and closure tracking</caption>
                <thead><tr>
                  <th scope="col">CAPA ID</th><th scope="col">Source</th><th scope="col">Description</th>
                  <th scope="col">Risk</th><th scope="col">Status</th><th scope="col">Owner</th>
                  <th scope="col">Due date</th><th scope="col">Eff.</th><th scope="col"><span className="sr-only">Open</span></th>
                </tr></thead>
                <tbody>
                  {filteredCAPAs.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedCAPA(selectedCAPA?.id === c.id ? null : c)} className="cursor-pointer" aria-selected={selectedCAPA?.id === c.id}
                      style={selectedCAPA?.id === c.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}>
                      <th scope="row">
                        <div className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{c.id}</div>
                        {c.findingId && <div className="flex items-center gap-1 mt-0.5"><Link2 className="w-3 h-3 text-[#0ea5e9]" aria-hidden="true" /><span className="text-[10px] text-[#0ea5e9]">{c.findingId}</span></div>}
                      </th>
                      <td><Badge variant="gray">{c.source}</Badge></td>
                      <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }}>{c.description}</span></td>
                      <td>{riskBadge(c.risk)}</td>
                      <td>{capaStatusBadge(c.status)}</td>
                      <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{ownerName(c.owner, users)}</td>
                      <td className="whitespace-nowrap">
                        <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(c.dueDate).tz(timezone).format(dateFormat)}</div>
                        {c.status !== "Closed" && dayjs.utc(c.dueDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444] font-medium">Overdue</div>}
                      </td>
                      <td>{c.effectivenessCheck ? <CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-label="Effectiveness check planned" /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>}</td>
                      <td><Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View ${c.id} detail`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail panel */}
          {selectedCAPA && (
            <aside aria-label="CAPA detail" className="card lg:col-span-1">
              <div className="card-header">
                <span className="font-mono text-[12px] font-semibold text-[#0ea5e9]">{selectedCAPA.id}</span>
                <div className="flex items-center gap-1 ml-auto">
                  {!isViewOnly && selectedCAPA.status !== "Closed" && (
                    <Button variant="ghost" size="xs" icon={Pencil} aria-label={`Edit ${selectedCAPA.id}`} onClick={() => setEditModalOpen(true)} />
                  )}
                  <button type="button" onClick={() => setSelectedCAPA(null)} aria-label="Close CAPA detail" className="w-5 h-5 flex items-center justify-center shrink-0 border-none bg-transparent outline-none cursor-pointer opacity-40 hover:opacity-100 transition-opacity">
                    <X className="w-3.5 h-3.5" style={{ stroke: isDark ? "#94a3b8" : "#374151" }} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="card-body overflow-y-auto space-y-4" style={{ maxHeight: 600 }}>
                <div className="flex gap-2 flex-wrap">{capaStatusBadge(selectedCAPA.status)}{riskBadge(selectedCAPA.risk)}</div>

                {/* RBC Triage */}
                <section aria-labelledby="rbc-heading">
                  <h3 id="rbc-heading" className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Risk-based classification</h3>
                  {[
                    { label: "Patient safety risk", variant: riskVariant(selectedCAPA.risk), text: riskLevel(selectedCAPA.risk) },
                    { label: "Product quality impact", variant: riskVariant(selectedCAPA.risk), text: riskLevel(selectedCAPA.risk) },
                    { label: "Regulatory exposure", variant: (selectedCAPA.diGate ? "red" : riskVariant(selectedCAPA.risk)) as "red" | "amber" | "green", text: selectedCAPA.diGate ? "High" : riskLevel(selectedCAPA.risk) },
                  ].map((row) => (
                    <div key={row.label} className={clsx("flex justify-between items-center py-2 border-b")} style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{row.label}</span>
                      <Badge variant={row.variant}>{row.text}</Badge>
                    </div>
                  ))}
                </section>

                {/* Source & Finding */}
                <div className="space-y-2">
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Source</p>
                  <Badge variant="gray">{selectedCAPA.source}</Badge>
                  {selectedCAPA.findingId && (
                    <div className="mt-2">
                      <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Linked finding</p>
                      <button type="button" onClick={() => navigate("/gap-assessment", { state: { openFindingId: selectedCAPA.findingId } })} className="flex items-center gap-1.5 text-[12px] text-[#0ea5e9] hover:underline bg-transparent border-none cursor-pointer p-0">
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{selectedCAPA.findingId}
                      </button>
                    </div>
                  )}
                </div>

                {/* RCA (read-only) */}
                <section aria-labelledby="rca-heading">
                  <h3 id="rca-heading" className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Root cause analysis</h3>
                  {selectedCAPA.rcaMethod && <div className="flex items-center gap-2 mb-2"><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Method:</span><Badge variant="purple">{selectedCAPA.rcaMethod}</Badge></div>}
                  {selectedCAPA.rca ? (
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedCAPA.rca}</p>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
                      <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0" aria-hidden="true" />
                      <div>
                        <p className="text-[12px] font-medium text-[#f59e0b]">RCA not yet documented</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Click the edit button above to add root cause analysis</p>
                      </div>
                    </div>
                  )}
                  {selectedCAPA.correctiveActions && <><h4 className="text-[11px] font-semibold uppercase tracking-wider mt-3 mb-1" style={{ color: "var(--text-muted)" }}>Corrective actions</h4><p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedCAPA.correctiveActions}</p></>}
                </section>

                {/* DI Gate */}
                <div className={clsx("flex items-start gap-2 p-3 rounded-lg text-[12px] border", selectedCAPA.diGate ? (isDark ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border-[#fca5a5]") : (isDark ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.2)]" : "bg-[#f0fdf4] border-[#a7f3d0]"))}>
                  {selectedCAPA.diGate ? <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" aria-hidden="true" />}
                  <div>
                    <span className="font-semibold block" style={{ color: selectedCAPA.diGate ? "#ef4444" : "#10b981" }}>{selectedCAPA.diGate ? "DI gate required" : "DI gate cleared"}</span>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{selectedCAPA.diGate ? "Data integrity review must be completed before QA can close" : "No data integrity issues identified"}</p>
                  </div>
                </div>

                {/* Evidence */}
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Evidence</h3>
                  {selectedCAPA.evidenceLinks.length > 0
                    ? <ul className="space-y-1 list-none p-0">{selectedCAPA.evidenceLinks.map((l, i) => <li key={i} className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-[#0ea5e9] shrink-0" aria-hidden="true" /><span className="text-[11px] text-[#0ea5e9]">{l}</span></li>)}</ul>
                    : <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No evidence linked yet</p>}
                </div>

                {/* Effectiveness */}
                {selectedCAPA.effectivenessCheck && selectedCAPA.status === "Closed" && selectedCAPA.effectivenessDate && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <TrendingUp className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                    <span>Effectiveness check: {dayjs.utc(selectedCAPA.effectivenessDate).format(dateFormat)}</span>
                  </div>
                )}

                {/* Owner & dates */}
                <div className="space-y-2">
                  {[{ label: "Owner", value: ownerName(selectedCAPA.owner, users) }, { label: "Due", value: dayjs.utc(selectedCAPA.dueDate).tz(timezone).format(dateFormat) }, ...(selectedCAPA.createdAt ? [{ label: "Created", value: dayjs.utc(selectedCAPA.createdAt).fromNow() }] : [])].map((r) => (
                    <div key={r.label} className="flex justify-between text-[12px]">
                      <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                      <span style={{ color: "var(--text-primary)" }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                {/* Submit for QA */}
                {(selectedCAPA.status === "Open" || selectedCAPA.status === "In Progress") && (user?.id === selectedCAPA.owner || canCloseCapa) && (
                  (selectedCAPA.rca?.trim().length ?? 0) > 0 ? (
                    <Button variant="secondary" icon={Send} fullWidth onClick={() => {
                      dispatch(updateCAPA({ id: selectedCAPA.id, patch: { status: "Pending QA Review" } }));
                      auditLog({ action: "CAPA_SUBMITTED_FOR_REVIEW", module: "capa", recordId: selectedCAPA.id });
                      setSubmittedPopup(true); setSelectedCAPA(null);
                    }}>Submit for QA review</Button>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
                      <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="text-[12px] font-medium text-[#f59e0b]">RCA required to submit</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Click the edit button above to add root cause analysis</p>
                      </div>
                    </div>
                  )
                )}

                {/* Sign & Close */}
                {canSign && canCloseCapa && selectedCAPA.status === "Pending QA Review" && (
                  <Button variant="primary" icon={ShieldCheck} fullWidth onClick={() => setSignOpen(true)}>Sign &amp; Close CAPA</Button>
                )}

                {/* Status update */}
                {!isViewOnly && selectedCAPA.status !== "Closed" && selectedCAPA.status !== "Pending QA Review" && (
                  <div>
                    <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>Update status</p>
                    <Dropdown value={selectedCAPA.status} onChange={(val) => {
                      dispatch(updateCAPA({ id: selectedCAPA.id, patch: { status: val as CAPAStatus } }));
                      auditLog({ action: "CAPA_STATUS_UPDATED", module: "capa", recordId: selectedCAPA.id, oldValue: selectedCAPA.status, newValue: val });
                      setSelectedCAPA({ ...selectedCAPA, status: val as CAPAStatus });
                    }} width="w-full" options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }]} />
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ═══════════ METRICS ═══════════ */}
      <div role="tabpanel" id="panel-metrics" aria-labelledby="tab-metrics" tabIndex={0} hidden={activeTab !== "metrics"}>
        {/* KPIs */}
        <section aria-label="CAPA metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: Clock, label: "On-time closure", value: capas.length === 0 ? "\u2014" : closedCAPAs.length === 0 ? "N/A" : `${onTimeRate}%`, color: capas.length === 0 ? "var(--text-muted)" : closedCAPAs.length === 0 ? "var(--text-muted)" : onTimeRate >= 90 ? "#10b981" : onTimeRate >= 70 ? "#f59e0b" : "#ef4444", sub: capas.length === 0 ? "No CAPAs yet" : `${closedCAPAs.length} CAPAs closed` },
            { icon: AlertTriangle, label: "Overdue rate", value: capas.length === 0 ? "\u2014" : `${overdueRate}%`, color: capas.length === 0 ? "var(--text-muted)" : overdueRate === 0 ? "#10b981" : "#ef4444", sub: capas.length === 0 ? "No CAPAs yet" : `${overdueCAPAs.length} past due date` },
            { icon: AlertCircle, label: "DI exceptions", value: String(diExceptions), color: diExceptions > 0 ? "#ef4444" : "#10b981", sub: "Open CAPAs with DI gate" },
            { icon: TrendingUp, label: "Effectiveness checks", value: String(effectivenessCount), color: "#6366f1", sub: "CAPAs with check planned" },
          ].map((kpi) => (
            <div key={kpi.label} className="stat-card" role="region" aria-label={kpi.label}>
              <div className="flex items-center gap-2 mb-2"><kpi.icon className="w-5 h-5" style={{ color: kpi.color }} aria-hidden="true" /><span className="stat-label mb-0">{kpi.label}</span></div>
              <div className="stat-value" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="stat-sub">{kpi.sub}</div>
            </div>
          ))}
        </section>

        {/* Trend chart */}
        <section aria-labelledby="trend-title" className="card mb-4">
          <div className="card-header"><h2 id="trend-title" className="card-title">Risk signals over time</h2><span className="text-[11px] text-(--text-secondary)">by source</span></div>
          <div className="card-body">
            {hasTrendData ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={riskSignalData} barSize={14} barGap={2}>
                  <CartesianGrid {...chartDefaults.cartesianGrid} /><XAxis dataKey="month" {...chartDefaults.xAxis} /><YAxis {...chartDefaults.yAxis} allowDecimals={false} /><Tooltip {...chartDefaults.tooltip} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{v as string}</span>} />
                  <Bar dataKey="483" name="483" fill="#ef4444" stackId="a" /><Bar dataKey="Internal Audit" name="Internal Audit" fill="#f59e0b" stackId="a" /><Bar dataKey="Deviation" name="Deviation" fill="#6366f1" stackId="a" /><Bar dataKey="Gap Assessment" name="Gap Assessment" fill="#0ea5e9" stackId="a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2"><BarChart3 className="w-8 h-8 text-[#334155]" aria-hidden="true" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs created yet</p></div>
            )}
          </div>
        </section>

        {/* Status donut + Source breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section aria-labelledby="status-donut-title" className="card">
            <div className="card-header"><h2 id="status-donut-title" className="card-title">CAPA status breakdown</h2></div>
            <div className="card-body">
              {statusDonut.length === 0 ? <div className="text-center py-10"><ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-[#334155]" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs yet</p></div> : (
                <>
                  <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={statusDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">{statusDonut.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip {...chartDefaults.tooltip} /></PieChart></ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 justify-center mt-2">{statusDonut.map((s) => <span key={s.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}><span className="w-2 h-2 rounded-full inline-block" style={{ background: s.fill }} />{s.value} {s.name}</span>)}</div>
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="source-title" className="card">
            <div className="card-header"><h2 id="source-title" className="card-title">CAPAs by source</h2></div>
            <div className="card-body p-0">
              {sourceBreakdown.length === 0 ? <div className="text-center py-10"><ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-[#334155]" /><p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No CAPAs yet</p></div> : (
                <table className="w-full text-[12px]"><tbody>{sourceBreakdown.map((s) => (
                  <tr key={s.source} className="border-b" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                    <td className="py-3 px-4" style={{ color: "var(--text-secondary)" }}>{s.source}</td>
                    <td className="py-3 px-2"><Badge variant="gray">{s.count}</Badge></td>
                    <td className="py-3 px-4 w-32"><div className="h-1.5 rounded-full overflow-hidden" style={{ background: isDark ? "#1e3a5a" : "#e2e8f0" }}><div className="h-full bg-[#0ea5e9] rounded-full transition-all duration-300" style={{ width: `${(s.count / maxSrcCount) * 100}%` }} /></div></td>
                  </tr>
                ))}</tbody></table>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── New CAPA Modal ── */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); reset(); }} title="New CAPA">
        <form onSubmit={handleSubmit(onSubmit)} aria-label="Create new CAPA" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Source <span className="text-(--danger)">*</span></p><Controller name="source" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "483", label: "FDA 483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />} /></div>
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p><Controller name="risk" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />} /></div>
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p><Controller name="owner" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />{errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}</div>
            <div><label htmlFor="capa-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label><input id="capa-due" type="date" className="input text-[12px]" {...reg("dueDate")} />{errors.dueDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.dueDate.message}</p>}</div>
            <div className="col-span-2"><label htmlFor="capa-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label><textarea id="capa-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the issue..." {...reg("description")} />{errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.description.message}</p>}</div>
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">RCA method (optional)</p><Controller name="rcaMethod" control={control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={[{ value: "5 Why", label: "5 Why" }, { value: "Fishbone", label: "Fishbone" }, { value: "Fault Tree", label: "Fault Tree" }, { value: "Other", label: "Other" }]} />} /></div>
            <div><label htmlFor="capa-finding" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Linked finding (optional)</label><input id="capa-finding" type="text" className="input text-[12px]" placeholder="FIND-001" {...reg("findingId")} /></div>

            {/* Toggles */}
            <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <Controller name="effectivenessCheck" control={control} render={({ field }) => <Toggle id="eff-toggle" checked={field.value} onChange={field.onChange} label="Effectiveness check" description="90-day post-closure monitoring" />} />
            </div>
            <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <Controller name="diGate" control={control} render={({ field }) => <Toggle id="di-toggle" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => { setAddOpen(false); reset(); }}>Cancel</Button>
            <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Create CAPA</Button>
          </div>
        </form>
      </Modal>

      {/* ── Sign & Close Modal ── */}
      {selectedCAPA && (
        <Modal open={signOpen} onClose={() => setSignOpen(false)} title="Sign & Close CAPA">
          <div>
            <div id="sign-part11-notice" className="alert alert-info mb-4">This is a GxP electronic signature under 21 CFR Part 11. Your identity, the meaning of this signature, and a content hash will be recorded and cannot be altered.</div>
            <div className={clsx("rounded-lg p-3 mb-4 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <div className="flex items-center gap-2"><span className="font-mono text-[12px] text-[#0ea5e9] font-semibold">{selectedCAPA.id}</span>{riskBadge(selectedCAPA.risk)}{capaStatusBadge(selectedCAPA.status)}</div>
              <p className="text-[12px] mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{selectedCAPA.description}</p>
            </div>
            <div className="space-y-4">
              <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Signature meaning <span className="text-(--danger)">*</span></p><Dropdown value={signMeaning} onChange={setSignMeaning} placeholder="Select meaning..." width="w-full" options={[{ value: "approve", label: "I approve the corrective actions as complete and effective" }, { value: "verify", label: "I verify the root cause analysis is adequate" }, { value: "confirm", label: "I confirm evidence is sufficient for closure" }]} /></div>
              <div><label htmlFor="sign-password" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Confirm your password <span className="text-(--danger)">*</span></label><input id="sign-password" type="password" className="input text-[12px]" value={signPassword} onChange={(e) => setSignPassword(e.target.value)} placeholder="Re-enter your password" /><p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Required for identity verification under 21 CFR Part 11</p></div>
              {selectedCAPA.effectivenessCheck && (
                <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                  <Toggle id="eff-confirm" checked={effectivenessConfirmed} onChange={setEffectivenessConfirmed} label="Effectiveness check confirmed" description="90-day monitoring will be scheduled" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setSignOpen(false)}>Cancel</Button>
                <Button variant="primary" icon={ShieldCheck} disabled={!signMeaning || !signPassword || (selectedCAPA.effectivenessCheck && !effectivenessConfirmed)} onClick={() => {
                  dispatch(closeCAPA({ id: selectedCAPA.id, closedBy: user?.id ?? "" }));
                  if (selectedCAPA.findingId) { dispatch(closeFinding(selectedCAPA.findingId)); auditLog({ action: "FINDING_CLOSED_VIA_CAPA", module: "capa", recordId: selectedCAPA.findingId, newValue: { closedByCapaId: selectedCAPA.id } }); }
                  auditLog({ action: "CAPA_CLOSED", module: "capa", recordId: selectedCAPA.id, newValue: { closedBy: user?.id, meaning: signMeaning } });
                  setSignOpen(false); setSignedPopup(true); setSelectedCAPA(null); setSignMeaning(""); setSignPassword(""); setEffectivenessConfirmed(false);
                }}>Sign &amp; Close CAPA</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Popups */}
      {/* ── Edit CAPA Modal ── */}
      {selectedCAPA && (
        <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit ${selectedCAPA.id}`} className="max-w-2xl">
          <form onSubmit={editForm.handleSubmit(onEditSave)} aria-label="Edit CAPA" noValidate className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Basic information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label htmlFor="edit-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
                <textarea id="edit-desc" rows={2} className="input text-[12px] resize-none" {...editForm.register("description")} />
                {editForm.formState.errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{editForm.formState.errors.description.message}</p>}
              </div>
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p>
                <Controller name="risk" control={editForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p>
                <Controller name="owner" control={editForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />
                {editForm.formState.errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{editForm.formState.errors.owner.message}</p>}
              </div>
              <div>
                <label htmlFor="edit-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label>
                <input id="edit-due" type="date" className="input text-[12px]" {...editForm.register("dueDate")} />
              </div>
              <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                <Controller name="diGate" control={editForm.control} render={({ field }) => <Toggle id="edit-di" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
              </div>
            </div>

            <div className="border-t pt-4" style={{ borderColor: isDark ? "#1e3a5a" : "#f1f5f9" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Root cause analysis</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">RCA method</p>
                  <Controller name="rcaMethod" control={editForm.control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={[{ value: "5 Why", label: "5 Why" }, { value: "Fishbone", label: "Fishbone" }, { value: "Fault Tree", label: "Fault Tree" }, { value: "Other", label: "Other" }]} />} />
                </div>
                <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                  <Controller name="effectivenessCheck" control={editForm.control} render={({ field }) => <Toggle id="edit-eff" checked={field.value} onChange={field.onChange} label="Effectiveness check" description="90-day monitoring planned" />} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="edit-rca" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Root cause <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(required before submitting for QA review)</span></label>
                  <textarea id="edit-rca" rows={4} className="input text-[12px] resize-none" placeholder="Describe the root cause..." {...editForm.register("rca")} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="edit-corrective" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Corrective actions taken</label>
                  <textarea id="edit-corrective" rows={3} className="input text-[12px] resize-none" placeholder="Describe what was done to fix the issue..." {...editForm.register("correctiveActions")} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setEditModalOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit" icon={Save} loading={editForm.formState.isSubmitting}>Save changes</Button>
            </div>
          </form>
        </Modal>
      )}

      <Popup isOpen={editSavedPopup} variant="success" title="CAPA updated" description="Changes saved. Submit for QA review when RCA and corrective actions are complete." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={addedPopup} variant="success" title="CAPA created" description="Added to the tracker. Document RCA and corrective actions next." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={submittedPopup} variant="success" title="Submitted for QA review" description="QA Head will review and sign to close." onDismiss={() => setSubmittedPopup(false)} />
      <Popup isOpen={signedPopup} variant="success" title="CAPA closed" description="Signed and closed. Audit trail entry recorded." onDismiss={() => setSignedPopup(false)} />
    </main>
  );
}
