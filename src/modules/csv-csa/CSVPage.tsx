import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Database, Server, GitBranch, Plus, Search, Filter, ChevronRight, ChevronDown,
  AlertTriangle, AlertCircle, Clock, ShieldAlert, Info, Pencil, Save, X, Trash2,
  CheckCircle2, Target, Shield, Zap, CheckSquare, ClipboardList, ClipboardCheck,
  FlaskConical, BarChart2, Activity, Cpu, Factory, Wrench,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import {
  addSystem, updateSystem, removeSystem, addActivity,
  type GxPSystem, type SystemType, type ValidationStatus,
  type ComplianceStatus, type GAMP5Category, type RiskLevel, type GxPRelevance,
  type RoadmapActivity,
} from "@/store/systems.slice";
import type { UserConfig } from "@/store/settings.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";

/* ── Constants ── */

const SYSTEM_TYPES: SystemType[] = ["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"];

const ACTIVITY_COLORS: Record<string, string> = {
  IQ: "#0ea5e9", OQ: "#6366f1", PQ: "#10b981", PV: "#f59e0b",
  UAT: "#a78bfa", "Risk Assessment": "#ef4444", "Periodic Review": "#64748b",
};

type TabId = "inventory" | "detail" | "roadmap";
type DetailTab = "overview" | "risk" | "validation" | "di";

const TABS: { id: TabId; label: string; Icon: typeof Database }[] = [
  { id: "inventory", label: "System Inventory", Icon: Database },
  { id: "detail", label: "System Detail", Icon: Server },
  { id: "roadmap", label: "CSV Roadmap", Icon: GitBranch },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "risk", label: "Risk & Controls" },
  { id: "validation", label: "Validation" },
  { id: "di", label: "DI & Audit Trail" },
];

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const SYS_ICONS: Record<SystemType, { icon: LucideIcon; color: string }> = {
  LIMS: { icon: FlaskConical, color: "#0ea5e9" },
  ERP: { icon: BarChart2, color: "#6366f1" },
  CDS: { icon: Activity, color: "#f59e0b" },
  QMS: { icon: ClipboardCheck, color: "#10b981" },
  SCADA: { icon: Cpu, color: "#ef4444" },
  MES: { icon: Factory, color: "#a78bfa" },
  CMMS: { icon: Wrench, color: "#64748b" },
  Other: { icon: Server, color: "#94a3b8" },
};

function getSystemIcon(type: SystemType) {
  return SYS_ICONS[type] ?? SYS_ICONS.Other;
}

/* ── Helpers ── */

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function complianceBadge(s: ComplianceStatus) {
  const m: Record<ComplianceStatus, "green" | "red" | "amber" | "gray"> = { Compliant: "green", "Non-Compliant": "red", "In Progress": "amber", "N/A": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function riskBadge(r: RiskLevel) {
  const m: Record<RiskLevel, "red" | "amber" | "green"> = { HIGH: "red", MEDIUM: "amber", LOW: "green" };
  return <Badge variant={m[r]}>{r}</Badge>;
}

function gampBadge(c: GAMP5Category) {
  return <Badge variant="blue">Cat {c}</Badge>;
}

function relevanceBadge(r: GxPRelevance) {
  const m: Record<GxPRelevance, "red" | "amber" | "gray"> = { Critical: "red", Major: "amber", Minor: "gray" };
  return <Badge variant={m[r]}>{r}</Badge>;
}

function ownerName(uid: string, users: UserConfig[]) {
  return users.find((u) => u.id === uid)?.name ?? uid;
}

function actStatusBadge(s: RoadmapActivity["status"]) {
  const m: Record<string, "green" | "amber" | "blue" | "red"> = { Complete: "green", "In Progress": "amber", Planned: "blue", Overdue: "red" };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}

/* ── Zod ── */

const systemSchema = z.object({
  name: z.string().min(2, "Name required"),
  type: z.enum(["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"]),
  vendor: z.string().min(1, "Vendor required"),
  version: z.string().min(1, "Version required"),
  gxpRelevance: z.enum(["Critical", "Major", "Minor"]),
  riskLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  part11Status: z.enum(["Compliant", "Non-Compliant", "In Progress", "N/A"]),
  annex11Status: z.enum(["Compliant", "Non-Compliant", "In Progress", "N/A"]),
  gamp5Category: z.enum(["1", "3", "4", "5"]),
  validationStatus: z.enum(["Validated", "In Progress", "Overdue", "Not Started"]),
  siteId: z.string().min(1, "Site required"),
  intendedUse: z.string().min(5, "Intended use required"),
  gxpScope: z.string().optional(),
  criticalFunctions: z.string().optional(),
  riskFactors: z.string().optional(),
  plannedActions: z.string().optional(),
  owner: z.string().min(1, "Owner required"),
  lastValidated: z.string().optional(),
  nextReview: z.string().optional(),
});
type SystemForm = z.infer<typeof systemSchema>;

/* ══════════════════════════════════════ */

export function CSVPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isViewOnly, role } = useRole();

  /* ── Redux ── */
  const systems = useAppSelector((s) => s.systems.items);
  const roadmap = useAppSelector((s) => s.systems.roadmap);
  const sites = useAppSelector((s) => s.settings.sites);
  const users = useAppSelector((s) => s.settings.users);
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const findings = useAppSelector((s) => s.findings.items);
  const capas = useAppSelector((s) => s.capa.items);
  const timezone = useAppSelector((s) => s.settings.org.timezone);
  const dateFormat = useAppSelector((s) => s.settings.org.dateFormat);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

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
  const [editingRiskFactors, setEditingRiskFactors] = useState(false);
  const [riskFactorsText, setRiskFactorsText] = useState("");
  const [riskFactorsSaved, setRiskFactorsSaved] = useState(false);
  const [editingActions, setEditingActions] = useState(false);
  const [actionsText, setActionsText] = useState("");
  const [actionsSaved, setActionsSaved] = useState(false);

  const location = useLocation();
  useEffect(() => {
    const sid = (location.state as { systemId?: string } | null)?.systemId;
    if (sid) {
      const found = systems.find((s) => s.id === sid);
      if (found) { setSelectedSystemId(found.id); setActiveTab("detail"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSystemId && selectedSystem) {
      setRiskFactorsText(selectedSystem.riskFactors ?? "");
      setEditingRiskFactors(false);
      setActionsText(selectedSystem.plannedActions ?? "");
      setEditingActions(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSystemId]);

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

  /* ── Forms ── */
  const addForm = useForm<SystemForm>({
    resolver: zodResolver(systemSchema),
    defaultValues: { type: "LIMS", gxpRelevance: "Major", riskLevel: "MEDIUM", part11Status: "N/A", annex11Status: "N/A", gamp5Category: "4", validationStatus: "Not Started" },
  });

  const editForm = useForm<SystemForm>({ resolver: zodResolver(systemSchema) });

  const activitySchema = z.object({
    systemId: z.string().min(1, "System required"),
    title: z.string().min(3, "Title required"),
    type: z.enum(["IQ", "OQ", "PQ", "PV", "UAT", "Risk Assessment", "Periodic Review"]),
    status: z.enum(["Planned", "In Progress", "Complete", "Overdue"]),
    startDate: z.string().min(1, "Start date required"),
    endDate: z.string().min(1, "End date required"),
    owner: z.string().min(1, "Owner required"),
  });
  type ActivityForm = z.infer<typeof activitySchema>;
  const activityForm = useForm<ActivityForm>({ resolver: zodResolver(activitySchema), defaultValues: { status: "Planned" } });

  function onActivitySave(data: ActivityForm) {
    const newAct: RoadmapActivity = { ...data, id: crypto.randomUUID(), startDate: dayjs(data.startDate).utc().toISOString(), endDate: dayjs(data.endDate).utc().toISOString() };
    dispatch(addActivity(newAct));
    auditLog({ action: "ROADMAP_ACTIVITY_ADDED", module: "csv-csa", recordId: newAct.id, newValue: newAct });
    setAddActivityOpen(false); setActivityAddedPopup(true); activityForm.reset();
  }

  function openEdit() {
    if (!selectedSystem) return;
    editForm.reset({
      name: selectedSystem.name, type: selectedSystem.type, vendor: selectedSystem.vendor,
      version: selectedSystem.version, gxpRelevance: selectedSystem.gxpRelevance,
      riskLevel: selectedSystem.riskLevel, part11Status: selectedSystem.part11Status,
      annex11Status: selectedSystem.annex11Status, gamp5Category: selectedSystem.gamp5Category,
      validationStatus: selectedSystem.validationStatus, siteId: selectedSystem.siteId,
      intendedUse: selectedSystem.intendedUse, gxpScope: selectedSystem.gxpScope,
      criticalFunctions: selectedSystem.criticalFunctions, riskFactors: selectedSystem.riskFactors,
      plannedActions: selectedSystem.plannedActions, owner: selectedSystem.owner,
      lastValidated: selectedSystem.lastValidated ? dayjs.utc(selectedSystem.lastValidated).format("YYYY-MM-DD") : "",
      nextReview: selectedSystem.nextReview ? dayjs.utc(selectedSystem.nextReview).format("YYYY-MM-DD") : "",
    });
    setEditOpen(true);
  }

  function onAddSave(data: SystemForm) {
    const id = crypto.randomUUID();
    dispatch(addSystem({ ...data, id, gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "", riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "", lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "", nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "", createdAt: "" }));
    auditLog({ action: "SYSTEM_ADDED", module: "csv-csa", recordId: id, newValue: data });
    setAddOpen(false); setAddedPopup(true); addForm.reset();
  }

  function onEditSave(data: SystemForm) {
    if (!selectedSystem) return;
    dispatch(updateSystem({ id: selectedSystem.id, patch: { ...data, gxpScope: data.gxpScope ?? "", criticalFunctions: data.criticalFunctions ?? "", riskFactors: data.riskFactors ?? "", plannedActions: data.plannedActions ?? "", lastValidated: data.lastValidated ? dayjs(data.lastValidated).utc().toISOString() : "", nextReview: data.nextReview ? dayjs(data.nextReview).utc().toISOString() : "" } }));
    auditLog({ action: "SYSTEM_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: data });
    setEditOpen(false); setEditSavedPopup(true);
  }

  /* ── Shared form fields ── */
  function renderSystemForm(form: ReturnType<typeof useForm<SystemForm>>, onSubmit: (d: SystemForm) => void, submitLabel: string) {
    const { register, control, handleSubmit, formState: { errors, isSubmitting } } = form;
    const activeSites = sites.filter((s) => s.status === "Active");
    const activeUsers = users.filter((u) => u.status === "Active");
    const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
    const sec = (color: string, text: string) => (<div className="flex items-center gap-2 mb-3 mt-1"><div className="w-1 h-4 rounded-full" style={{ background: color }} /><p className={lbl} style={{ color: "var(--text-muted)" }}>{text}</p></div>);
    return (
      <form onSubmit={handleSubmit(onSubmit)} aria-label="System form" noValidate>
        {/* Section 1 — Identity */}
        {sec("#0ea5e9", "System identity")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label htmlFor="sys-name" className={lbl} style={{ color: "var(--text-muted)" }}>System name <span aria-hidden="true">*</span></label>
            <input id="sys-name" className="input text-[12px]" placeholder="e.g. LIMS \u2014 LabVantage 8.7" {...register("name")} />
            {errors.name && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System type *</label>
            <Controller name="type" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={SYSTEM_TYPES.map((t) => ({ value: t, label: t }))} />)} />
          </div>
          <div>
            <label htmlFor="sys-vendor" className={lbl} style={{ color: "var(--text-muted)" }}>Vendor *</label>
            <input id="sys-vendor" className="input text-[12px]" placeholder="e.g. LabVantage" {...register("vendor")} />
          </div>
          <div>
            <label htmlFor="sys-ver" className={lbl} style={{ color: "var(--text-muted)" }}>Version *</label>
            <input id="sys-ver" className="input text-[12px]" placeholder="e.g. 8.7" {...register("version")} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Site *</label>
            <Controller name="siteId" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={activeSites.map((s) => ({ value: s.id, label: s.name }))} />)} />
            {errors.siteId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System owner *</label>
            <Controller name="owner" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={activeUsers.map((u) => ({ value: u.id, label: u.name }))} />)} />
          </div>
        </div>

        {/* Section 2 — Classification */}
        {sec("#6366f1", "Risk & compliance classification")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GxP relevance *</label>
            <Controller name="gxpRelevance" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Risk level *</label>
            <Controller name="riskLevel" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "HIGH", label: "HIGH" }, { value: "MEDIUM", label: "MEDIUM" }, { value: "LOW", label: "LOW" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GAMP 5 category *</label>
            <Controller name="gamp5Category" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "1", label: "Cat 1 \u2014 Infrastructure" }, { value: "3", label: "Cat 3 \u2014 Non-configured" }, { value: "4", label: "Cat 4 \u2014 Configured software" }, { value: "5", label: "Cat 5 \u2014 Custom software" }]} />)} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Cat 5 requires full IQ/OQ/PQ</p>
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Validation status *</label>
            <Controller name="validationStatus" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Validated", label: "Validated" }, { value: "In Progress", label: "In Progress" }, { value: "Overdue", label: "Overdue" }, { value: "Not Started", label: "Not Started" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>21 CFR Part 11 status</label>
            <Controller name="part11Status" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Compliant", label: "Compliant" }, { value: "Non-Compliant", label: "Non-Compliant" }, { value: "In Progress", label: "In Progress" }, { value: "N/A", label: "N/A" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>EU GMP Annex 11 status</label>
            <Controller name="annex11Status" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Compliant", label: "Compliant" }, { value: "Non-Compliant", label: "Non-Compliant" }, { value: "In Progress", label: "In Progress" }, { value: "N/A", label: "N/A" }]} />)} />
          </div>
          <div>
            <label htmlFor="sys-last-val" className={lbl} style={{ color: "var(--text-muted)" }}>Last validated</label>
            <input id="sys-last-val" type="date" className="input text-[12px]" {...register("lastValidated")} />
          </div>
          <div>
            <label htmlFor="sys-review" className={lbl} style={{ color: "var(--text-muted)" }}>Next review date</label>
            <input id="sys-review" type="date" className="input text-[12px]" {...register("nextReview")} />
          </div>
        </div>

        {/* Section 3 — Detail */}
        {sec("#f59e0b", "System detail")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label htmlFor="sys-use" className={lbl} style={{ color: "var(--text-muted)" }}>Intended use *</label>
            <textarea id="sys-use" rows={2} className="input text-[12px] resize-none" placeholder="Describe what this system is used for in GxP operations..." {...register("intendedUse")} />
            {errors.intendedUse && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.intendedUse.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-scope" className={lbl} style={{ color: "var(--text-muted)" }}>GxP scope</label>
            <input id="sys-scope" className="input text-[12px]" placeholder="e.g. 21 CFR Part 11, EU GMP Annex 11, GAMP 5 Cat 4" {...register("gxpScope")} />
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-crit" className={lbl} style={{ color: "var(--text-muted)" }}>Critical GxP functions</label>
            <textarea id="sys-crit" rows={2} className="input text-[12px] resize-none" placeholder="e.g. Audit trail, electronic signatures, result entry, batch release" {...register("criticalFunctions")} />
          </div>
        </div>

        {/* Section 4 — Risk & validation plan */}
        {sec("#10b981", "Risk & validation plan")}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="sys-rf" className={lbl} style={{ color: "var(--text-muted)" }}>Risk factors</label>
            <textarea id="sys-rf" rows={3} className="input text-[12px] resize-none" placeholder={"Patient safety: High/Medium/Low \u2014 reason\nProduct quality: High/Medium/Low \u2014 reason\nDI impact: High/Medium/Low \u2014 reason\nInspection exposure: describe risk"} {...register("riskFactors")} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Appears in Risk &amp; Controls tab and inspector review</p>
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-pa" className={lbl} style={{ color: "var(--text-muted)" }}>Planned validation actions</label>
            <textarea id="sys-pa" rows={3} className="input text-[12px] resize-none" placeholder={"e.g. IQ/OQ/PQ planned Q2 2026\nAudit trail remediation \u2014 CAPA-0042\nE-sig binding fix \u2014 CAPA-0043"} {...register("plannedActions")} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Appears in Validation tab and CSV Roadmap</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" type="button" onClick={() => { setAddOpen(false); setEditOpen(false); }}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>{submitLabel}</Button>
        </div>
      </form>
    );
  }

  /* ── Progress helper ── */
  function activityProgress(a: RoadmapActivity) {
    if (a.status === "Complete") return 100;
    if (a.status === "Planned" && dayjs.utc(a.startDate).isAfter(dayjs())) return 0;
    const total = Math.max(1, dayjs(a.endDate).diff(dayjs(a.startDate), "day"));
    const elapsed = dayjs().diff(dayjs(a.startDate), "day");
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="CSV/CSA and systems risk register" className="w-full max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">CSV/CSA &amp; Systems Risk</h1>
          <p className="page-subtitle mt-1">
            {systems.length === 0 ? "No systems registered yet" : `${systems.length} systems \u00b7 ${highRisk} high risk \u00b7 ${valOverdue} validation overdue`}
          </p>
        </div>
        {!isViewOnly && (
          <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add system</Button>
        )}
      </header>

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
      <div role="tablist" aria-label="CSV/CSA sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors duration-150 bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ INVENTORY TAB ═══════════ */}
      <div role="tabpanel" id="panel-inventory" aria-labelledby="tab-inventory" tabIndex={0} hidden={activeTab !== "inventory"}>
        {/* Tiles */}
        <section aria-label="System statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card" role="region" aria-label="Total systems">
            <div className="flex items-center gap-2 mb-2"><Database className="w-5 h-5 text-[#0ea5e9]" aria-hidden="true" /><span className="stat-label mb-0">Total systems</span></div>
            <div className="stat-value">{systems.length}</div>
            <div className="stat-sub">{systems.length === 0 ? "Add your first GxP system to get started" : `across ${[...new Set(systems.map((s) => s.siteId))].length} sites`}</div>
          </div>
          <div className="stat-card" role="region" aria-label="High risk systems">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-[#ef4444]" aria-hidden="true" /><span className="stat-label mb-0">High risk</span></div>
            <div className={clsx("stat-value", highRisk > 0 ? "text-[#ef4444]" : "text-[#10b981]")}>{highRisk}</div>
            <div className="stat-sub">{systems.length === 0 ? "No systems registered" : "Require immediate attention"}</div>
          </div>
          <div className="stat-card" role="region" aria-label="Validation overdue">
            <div className="flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-[#f59e0b]" aria-hidden="true" /><span className="stat-label mb-0">Validation overdue</span></div>
            <div className={clsx("stat-value", valOverdue > 0 ? "text-[#ef4444]" : "text-[#10b981]")}>{valOverdue}</div>
            <div className="stat-sub">{systems.length === 0 ? "No systems registered" : "Past revalidation date"}</div>
          </div>
          <div className="stat-card" role="region" aria-label="Non-compliant systems">
            <div className="flex items-center gap-2 mb-2"><ShieldAlert className="w-5 h-5 text-[#ef4444]" aria-hidden="true" /><span className="stat-label mb-0">Non-compliant</span></div>
            <div className={clsx("stat-value", nonCompliant > 0 ? "text-[#ef4444]" : "text-[#10b981]")}>{nonCompliant}</div>
            <div className="stat-sub">{systems.length === 0 ? "No systems registered" : "Part 11 or Annex 11 gap"}</div>
          </div>
        </section>

        {/* Filters */}
        <section aria-label="System filters" className={clsx("flex items-center gap-3 flex-wrap mb-4 p-4 rounded-xl border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
          <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
          <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-36" options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
          <Dropdown placeholder="All types" value={typeFilter} onChange={setTypeFilter} width="w-32" options={[{ value: "", label: "All types" }, ...SYSTEM_TYPES.map((t) => ({ value: t, label: t }))]} />
          <Dropdown placeholder="All risks" value={riskFilter} onChange={setRiskFilter} width="w-32" options={[{ value: "", label: "All risks" }, { value: "HIGH", label: "HIGH" }, { value: "MEDIUM", label: "MEDIUM" }, { value: "LOW", label: "LOW" }]} />
          <Dropdown placeholder="All statuses" value={valFilter} onChange={setValFilter} width="w-36" options={[{ value: "", label: "All statuses" }, { value: "Validated", label: "Validated" }, { value: "In Progress", label: "In Progress" }, { value: "Overdue", label: "Overdue" }, { value: "Not Started", label: "Not Started" }]} />
          <div className="relative flex-1 max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input type="search" className="input pl-8 text-[12px]" placeholder="Search systems..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} aria-label="Search systems" />
          </div>
          {anyFilter && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
        </section>

        {/* Table */}
        {systems.length === 0 ? (
          <div className="card p-10 text-center">
            <Database className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No systems registered yet</p>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Add your GxP computerised systems to track validation status and compliance.</p>
            {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} className="mt-3" onClick={() => setAddOpen(true)}>Add first system</Button>}
          </div>
        ) : filteredSystems.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No systems match the current filters</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table" aria-label="GxP system inventory and risk register">
                <caption className="sr-only">GxP computerised systems with validation and compliance status</caption>
                <thead>
                  <tr>
                    <th scope="col">System</th>
                    <th scope="col">Type</th>
                    <th scope="col">GxP relevance</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Validation</th>
                    {showPart11 && <th scope="col">Part 11</th>}
                    {showAnnex11 && <th scope="col">Annex 11</th>}
                    {showGAMP5 && <th scope="col">GAMP 5</th>}
                    <th scope="col">Owner</th>
                    <th scope="col">Next review</th>
                    {role !== "viewer" && <th scope="col"><span className="sr-only">Edit/Remove</span></th>}
                    <th scope="col"><span className="sr-only">Open detail</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSystems.map((sys) => {
                    const si = getSystemIcon(sys.type);
                    return (
                    <tr key={sys.id} onClick={() => { setSelectedSystem(sys); setActiveTab("detail"); setDetailTab("overview"); }} className="cursor-pointer">
                      <th scope="row">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: si.color + "18" }}>
                            <si.icon className="w-3.5 h-3.5" style={{ color: si.color }} aria-hidden="true" />
                          </div>
                          <div>
                            <div className="font-medium text-[12px]" style={{ color: "var(--text-primary)" }}>{sys.name}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sys.vendor} v{sys.version}</div>
                          </div>
                        </div>
                      </th>
                      <td><Badge variant="gray">{sys.type}</Badge></td>
                      <td>{relevanceBadge(sys.gxpRelevance)}</td>
                      <td>{riskBadge(sys.riskLevel)}</td>
                      <td>{validationBadge(sys.validationStatus)}</td>
                      {showPart11 && <td>{complianceBadge(sys.part11Status)}</td>}
                      {showAnnex11 && <td>{complianceBadge(sys.annex11Status)}</td>}
                      {showGAMP5 && <td>{gampBadge(sys.gamp5Category)}</td>}
                      <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(sys.owner, users)}</td>
                      <td>
                        {sys.nextReview ? (
                          <>
                            <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(sys.nextReview).tz(timezone).format(dateFormat)}</div>
                            {dayjs.utc(sys.nextReview).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444] font-medium">Overdue</div>}
                          </>
                        ) : <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>&mdash;</span>}
                      </td>
                      {role !== "viewer" && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="xs" icon={Pencil} aria-label={`Edit ${sys.name}`} onClick={() => { setSelectedSystem(sys); openEdit(); }} />
                            <Button variant="ghost" size="xs" icon={Trash2} aria-label={`Remove ${sys.name}`} onClick={() => { setSystemToRemove(sys.id); setRemovePopup(true); }} />
                          </div>
                        </td>
                      )}
                      <td><Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View ${sys.name} detail`} /></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ DETAIL TAB ═══════════ */}
      <div role="tabpanel" id="panel-detail" aria-labelledby="tab-detail" tabIndex={0} hidden={activeTab !== "detail"}>
        {!selectedSystem ? (
          <div className="card p-10 text-center">
            <Server className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>{systems.length === 0 ? "No systems registered yet" : "Select a system from the inventory"}</p>
            <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>{systems.length === 0 ? "Add systems in the System Inventory tab to view detailed compliance information here." : "Click any row in the System Inventory tab to view its full detail here."}</p>
            <Button variant="ghost" size="sm" onClick={() => setActiveTab("inventory")}>Go to System Inventory</Button>
          </div>
        ) : (
          <>
            {/* System header */}
            {(() => { const si = getSystemIcon(selectedSystem.type); return (
            <div className={clsx("rounded-xl p-4 mb-4 border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: si.color + "18" }}>
                    <si.icon className="w-5 h-5" style={{ color: si.color }} aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{selectedSystem.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="gray">{selectedSystem.type}</Badge>
                      {riskBadge(selectedSystem.riskLevel)}
                      {validationBadge(selectedSystem.validationStatus)}
                      {gampBadge(selectedSystem.gamp5Category)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isViewOnly && <Button variant="ghost" size="sm" icon={Pencil} onClick={openEdit}>Edit</Button>}
                  <Button variant="ghost" size="sm" icon={X} aria-label="Back to inventory" onClick={() => { setSelectedSystem(null); setActiveTab("inventory"); }} />
                </div>
              </div>
            </div>
            ); })()}

            {/* Inner tabs */}
            <div role="tablist" aria-label="System detail sections" className="flex gap-1 border-b border-(--bg-border) mb-4">
              {DETAIL_TABS.map((t) => (
                <button key={t.id} type="button" role="tab" id={`dtab-${t.id}`} aria-selected={detailTab === t.id} aria-controls={`dpanel-${t.id}`}
                  onClick={() => setDetailTab(t.id)}
                  className={clsx("px-3 py-2 text-[11px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", detailTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview */}
            <div role="tabpanel" id="dpanel-overview" aria-labelledby="dtab-overview" tabIndex={0} hidden={detailTab !== "overview"}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Intended use</span></div></div><div className="card-body"><p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedSystem.intendedUse || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
                <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">GxP scope</span></div></div><div className="card-body"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{selectedSystem.gxpScope || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
                <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Critical GxP functions</span></div></div><div className="card-body"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{selectedSystem.criticalFunctions || <span className="italic" style={{ color: "var(--text-muted)" }}>Not documented</span>}</p></div></div>
                <div className="card col-span-full"><div className="card-header"><div className="flex items-center gap-2"><Server className="w-4 h-4" style={{ color: "#64748b" }} aria-hidden="true" /><span className="card-title">System information</span></div></div><div className="card-body">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 text-[12px]">
                    {([
                      ["Vendor", selectedSystem.vendor], ["Version", selectedSystem.version],
                      ["Owner", ownerName(selectedSystem.owner, users)],
                      ["Site", sites.find((s) => s.id === selectedSystem.siteId)?.name ?? "\u2014"],
                      ["GAMP Cat", `Category ${selectedSystem.gamp5Category}`],
                      ["GxP relevance", selectedSystem.gxpRelevance],
                      ["Risk level", selectedSystem.riskLevel],
                      ["System type", selectedSystem.type],
                    ] as const).map(([l, v]) => (
                      <div key={l} className="border-b pb-2" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}><span className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>{l}</span><span className="font-medium" style={{ color: "var(--text-primary)" }}>{v}</span></div>
                    ))}
                  </div>
                </div></div>
              </div>
            </div>

            {/* Risk & Controls */}
            <div role="tabpanel" id="dpanel-risk" aria-labelledby="dtab-risk" tabIndex={0} hidden={detailTab !== "risk"}>
              <div className="space-y-4">
                <section aria-labelledby="rbc-sys-heading" className="card">
                  <div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><h3 id="rbc-sys-heading" className="card-title">Risk-based classification</h3></div></div>
                  <div className="card-body space-y-0">
                    {[
                      { label: "Patient safety risk", level: selectedSystem.gxpRelevance === "Critical" ? "HIGH" : selectedSystem.gxpRelevance === "Major" ? "MEDIUM" : "LOW" },
                      { label: "Product quality impact", level: selectedSystem.riskLevel },
                      { label: "Regulatory exposure", level: (selectedSystem.part11Status === "Non-Compliant" || selectedSystem.annex11Status === "Non-Compliant") ? "HIGH" : (selectedSystem.part11Status === "In Progress" || selectedSystem.annex11Status === "In Progress") ? "MEDIUM" : "LOW" },
                      { label: "DI impact", level: selectedSystem.gamp5Category === "5" ? "HIGH" : selectedSystem.gamp5Category === "4" ? "MEDIUM" : "LOW" },
                    ].map((r, i, arr) => (
                      <div key={r.label} className={clsx("flex justify-between items-center py-3", i < arr.length - 1 && "border-b")} style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                        <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                        <Badge variant={r.level === "HIGH" ? "red" : r.level === "MEDIUM" ? "amber" : "green"}>{r.level}</Badge>
                      </div>
                    ))}
                  </div>
                </section>
                <div className="card">
                  <div className="card-header">
                    <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#f59e0b]" aria-hidden="true" /><span className="card-title">Risk factors</span></div>
                    {role !== "viewer" && (
                      <button type="button" onClick={() => { if (editingRiskFactors) setRiskFactorsText(selectedSystem.riskFactors ?? ""); setEditingRiskFactors((v) => !v); }}
                        aria-label={editingRiskFactors ? "Cancel editing risk factors" : "Edit risk factors"}
                        className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer transition-opacity", editingRiskFactors ? "text-[#64748b] hover:text-[#94a3b8]" : "text-[#0ea5e9] hover:opacity-80")}>
                        {editingRiskFactors ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
                        <span>{editingRiskFactors ? "Cancel" : "Edit"}</span>
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    {editingRiskFactors ? (
                      <div className="space-y-3">
                        <label htmlFor="risk-factors-input" className="text-[11px] block" style={{ color: "var(--text-muted)" }}>Describe patient safety, product quality and data integrity risk factors</label>
                        <textarea id="risk-factors-input" rows={5} className="input resize-none w-full text-[12px]" value={riskFactorsText} onChange={(e) => setRiskFactorsText(e.target.value)}
                          placeholder={"Patient safety: High/Medium/Low \u2014 reason\nProduct quality: High/Medium/Low \u2014 reason\nDI impact: High/Medium/Low \u2014 reason\nInspection exposure: describe risk"} aria-describedby="risk-factors-hint" />
                        <p id="risk-factors-hint" className="text-[10px]" style={{ color: "var(--text-muted)" }}>Visible to inspectors in system detail view.</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{riskFactorsText.length} characters</span>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" type="button" onClick={() => { setRiskFactorsText(selectedSystem.riskFactors ?? ""); setEditingRiskFactors(false); }}>Cancel</Button>
                            <Button variant="primary" size="sm" icon={Save} type="button" onClick={() => {
                              dispatch(updateSystem({ id: selectedSystem.id, patch: { riskFactors: riskFactorsText.trim() } }));
                              auditLog({ action: "SYSTEM_RISK_FACTORS_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { riskFactors: riskFactorsText.trim() } });
                              setEditingRiskFactors(false); setRiskFactorsSaved(true);
                            }}>Save</Button>
                          </div>
                        </div>
                      </div>
                    ) : selectedSystem.riskFactors?.trim() ? (
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedSystem.riskFactors}</p>
                    ) : (
                      <div className={clsx("flex items-start gap-2 p-3 rounded-lg", isDark ? "bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border border-[#fde68a]")}>
                        <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0" aria-hidden="true" />
                        <div>
                          <p className="text-[12px] font-medium text-[#f59e0b]">Risk factors not documented</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Click Edit above to document patient safety, product quality and DI risk factors.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {(showPart11 || showAnnex11 || showGAMP5) ? (
                  <div className="card"><div className="card-header"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="card-title">Compliance status</span></div></div><div className="card-body">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      {showPart11 && (
                        <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                          <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>21 CFR Part 11</span>
                          {complianceBadge(selectedSystem.part11Status)}
                          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{selectedSystem.part11Status === "Compliant" ? "Audit trail and e-sig validated" : selectedSystem.part11Status === "Non-Compliant" ? "Remediation required \u2014 raise CAPA" : selectedSystem.part11Status === "In Progress" ? "Remediation in progress" : "Not applicable for this system"}</p>
                        </div>
                      )}
                      {showAnnex11 && (
                        <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                          <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>EU GMP Annex 11</span>
                          {complianceBadge(selectedSystem.annex11Status)}
                          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{selectedSystem.annex11Status === "Compliant" ? "Computerised system validated" : selectedSystem.annex11Status === "Non-Compliant" ? "Lifecycle validation required" : selectedSystem.annex11Status === "In Progress" ? "Validation in progress" : "Not applicable"}</p>
                        </div>
                      )}
                      {showGAMP5 && (
                        <div className={clsx("rounded-lg p-3 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                          <span className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-muted)" }}>GAMP 5 Category</span>
                          {gampBadge(selectedSystem.gamp5Category)}
                          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>{selectedSystem.gamp5Category === "5" ? "Custom software \u2014 full IQ/OQ/PQ required" : selectedSystem.gamp5Category === "4" ? "Configured software \u2014 configured items tested" : selectedSystem.gamp5Category === "3" ? "Non-configured \u2014 standard testing applies" : "Infrastructure \u2014 minimal testing required"}</p>
                        </div>
                      )}
                    </div>
                  </div></div>
                ) : (
                  <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")}>
                    <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1">
                      <p className="text-[12px] font-medium text-[#f59e0b]">No compliance frameworks active</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Enable Part 11, Annex 11 or GAMP 5 in Settings &rarr; Frameworks to see compliance status.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>Settings</Button>
                  </div>
                )}
              </div>
            </div>

            {/* Validation */}
            <div role="tabpanel" id="dpanel-validation" aria-labelledby="dtab-validation" tabIndex={0} hidden={detailTab !== "validation"}>
              <div className="space-y-4">
                <div className="card"><div className="card-header"><span className="card-title">Validation status</span></div><div className="card-body">
                  <div className="flex items-center gap-4 flex-wrap">
                    {validationBadge(selectedSystem.validationStatus)}
                    <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      Last validated: {selectedSystem.lastValidated ? dayjs.utc(selectedSystem.lastValidated).tz(timezone).format(dateFormat) : "Not yet validated"}
                    </div>
                    {selectedSystem.nextReview && (
                      <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        Next review: {dayjs.utc(selectedSystem.nextReview).tz(timezone).format(dateFormat)}
                        {dayjs.utc(selectedSystem.nextReview).isBefore(dayjs()) && <span className="text-[#ef4444] ml-1 font-medium">(Overdue)</span>}
                      </div>
                    )}
                  </div>
                </div></div>
                <div className="card">
                  <div className="card-header">
                    <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Planned validation actions</span></div>
                    {role !== "viewer" && (
                      <button type="button" onClick={() => { if (editingActions) setActionsText(selectedSystem.plannedActions ?? ""); setEditingActions((v) => !v); }}
                        aria-label={editingActions ? "Cancel editing planned actions" : "Edit planned actions"}
                        className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer transition-opacity", editingActions ? "text-[#64748b] hover:text-[#94a3b8]" : "text-[#0ea5e9] hover:opacity-80")}>
                        {editingActions ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
                        <span>{editingActions ? "Cancel" : "Edit"}</span>
                      </button>
                    )}
                  </div>
                  <div className="card-body">
                    {editingActions ? (
                      <div className="space-y-3">
                        <label htmlFor="actions-input" className="text-[11px] block" style={{ color: "var(--text-muted)" }}>Describe planned IQ/OQ/PQ and remediation activities</label>
                        <textarea id="actions-input" rows={4} className="input resize-none w-full text-[12px]" value={actionsText} onChange={(e) => setActionsText(e.target.value)}
                          placeholder={"e.g. IQ/OQ/PQ planned Q2 2026.\nAudit trail remediation \u2014 see CAPA-0042.\nE-sig binding fix \u2014 CAPA-0043."} aria-describedby="actions-hint" />
                        <p id="actions-hint" className="text-[10px]" style={{ color: "var(--text-muted)" }}>Visible in system detail and roadmap planning.</p>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" type="button" onClick={() => { setActionsText(selectedSystem.plannedActions ?? ""); setEditingActions(false); }}>Cancel</Button>
                          <Button variant="primary" size="sm" icon={Save} type="button" onClick={() => {
                            dispatch(updateSystem({ id: selectedSystem.id, patch: { plannedActions: actionsText.trim() } }));
                            auditLog({ action: "SYSTEM_PLANNED_ACTIONS_UPDATED", module: "csv-csa", recordId: selectedSystem.id, newValue: { plannedActions: actionsText.trim() } });
                            setEditingActions(false); setActionsSaved(true);
                          }}>Save</Button>
                        </div>
                      </div>
                    ) : selectedSystem.plannedActions?.trim() ? (
                      <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedSystem.plannedActions}</p>
                    ) : (
                      <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No planned actions documented. Click Edit above to add a validation plan.</p>
                    )}
                  </div>
                </div>
                <div className="card"><div className="card-header"><span className="card-title">Roadmap activities</span></div><div className="card-body">
                  {(() => {
                    const acts = roadmap.filter((a) => a.systemId === selectedSystem.id);
                    if (acts.length === 0) return <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No roadmap activities planned yet.</p>;
                    return (
                      <table className="data-table" aria-label={`Roadmap for ${selectedSystem.name}`}>
                        <thead><tr><th scope="col">Activity</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Owner</th></tr></thead>
                        <tbody>{acts.map((a) => (
                          <tr key={a.id}>
                            <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</th>
                            <td><Badge variant="gray">{a.type}</Badge></td>
                            <td>{actStatusBadge(a.status)}</td>
                            <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.startDate).format("DD MMM YY")}</td>
                            <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.endDate).format("DD MMM YY")}</td>
                            <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    );
                  })()}
                </div></div>
              </div>
            </div>

            {/* DI & Audit Trail */}
            <div role="tabpanel" id="dpanel-di" aria-labelledby="dtab-di" tabIndex={0} hidden={detailTab !== "di"}>
              {(() => {
                const p11 = selectedSystem.part11Status;
                const a11 = selectedSystem.annex11Status;
                const isBad = p11 === "Non-Compliant" || a11 === "Non-Compliant";
                const isAmber = !isBad && (p11 === "In Progress" || a11 === "In Progress");
                const isGood = !isBad && !isAmber && (p11 === "Compliant" || a11 === "Compliant");
                const linkedFindings = findings.filter((f) => f.area === "CSV/IT" && (f.framework === "p11" || f.framework === "annex11"));
                const linkedCAPAs = capas.filter((c) => linkedFindings.some((f) => f.id === c.findingId));
                const openDIGateCAPAs = linkedCAPAs.filter((c) => c.diGate && c.status !== "Closed");

                function statusPanel(isBadS: boolean, isAmberS: boolean, icon: React.ReactNode, label: string, desc: string) {
                  const bg = isBadS ? "rgba(239,68,68,0.08)" : isAmberS ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)";
                  const border = isBadS ? "rgba(239,68,68,0.2)" : isAmberS ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)";
                  return (
                    <div className="flex items-start gap-2 p-3 rounded-lg text-[12px]" style={{ background: bg, border: `1px solid ${border}` }}>
                      {icon}
                      <div>
                        <span className="font-semibold block" style={{ color: isBadS ? "#ef4444" : isAmberS ? "#f59e0b" : "#10b981" }}>{label}</span>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">Data integrity status</span></div></div><div className="card-body space-y-2">
                      {statusPanel(isBad, isAmber,
                        isBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : isAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
                        isBad ? "Audit trail non-compliant" : isAmber ? "Audit trail remediation in progress" : isGood ? "Audit trail compliant" : "Audit trail status not applicable",
                        isBad ? "Part 11 / Annex 11 gap \u2014 CAPA required" : isAmber ? "Linked CAPA in progress" : isGood ? "Audit trail controls verified and validated" : "Not applicable for this system"
                      )}
                      {statusPanel(isBad, isAmber,
                        isBad ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : isAmber ? <AlertCircle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
                        isBad ? "E-signature non-compliant" : isAmber ? "E-signature remediation in progress" : isGood ? "E-signature compliant" : "E-signature status not applicable",
                        isBad ? "E-sig not cryptographically bound to records" : isAmber ? "E-sig binding remediation in progress" : isGood ? "E-sig binding validated under Part 11 / Annex 11" : "Not applicable"
                      )}
                      {statusPanel(openDIGateCAPAs.length > 0, false,
                        openDIGateCAPAs.length > 0 ? <AlertCircle className="w-4 h-4 text-[#ef4444] flex-shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" aria-hidden="true" />,
                        openDIGateCAPAs.length > 0 ? `DI gate open \u2014 ${openDIGateCAPAs.length} CAPA(s) pending` : "DI gate cleared",
                        openDIGateCAPAs.length > 0 ? "Data integrity review must complete before closure" : "No open data integrity issues for this system"
                      )}
                    </div></div>

                    <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Search className="w-4 h-4 text-[#a78bfa]" aria-hidden="true" /><span className="card-title">Linked findings</span>{linkedFindings.length > 0 && <Badge variant={linkedFindings.some((f) => f.severity === "Critical") ? "red" : "amber"}>{linkedFindings.length}</Badge>}</div></div><div className="card-body">
                      {linkedFindings.length === 0 ? (
                        <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No Part 11 or Annex 11 findings logged yet. Log findings in Gap Assessment with area &ldquo;CSV/IT&rdquo; to see them here.</p>
                      ) : (
                        <div className="space-y-2">{linkedFindings.map((f) => (
                          <div key={f.id} onClick={() => navigate("/gap-assessment", { state: { openFindingId: f.id } })} role="button" aria-label={`Open finding ${f.id} in Gap Assessment`}
                            className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{f.id}</span>
                              <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{f.requirement}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              <Badge variant={f.severity === "Critical" ? "red" : f.severity === "Major" ? "amber" : "gray"}>{f.severity}</Badge>
                              <Badge variant={f.status === "Closed" ? "green" : f.status === "In Progress" ? "amber" : "blue"}>{f.status}</Badge>
                            </div>
                          </div>
                        ))}</div>
                      )}
                    </div></div>

                    <div className="card"><div className="card-header"><div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Linked CAPAs</span>{linkedCAPAs.length > 0 && <Badge variant={linkedCAPAs.some((c) => c.status !== "Closed" && c.diGate) ? "red" : "blue"}>{linkedCAPAs.length}</Badge>}</div></div><div className="card-body">
                      {linkedCAPAs.length === 0 ? (
                        <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPAs linked to CSV/IT findings yet. Raise a CAPA from a Gap Assessment finding to see it tracked here.</p>
                      ) : (
                        <div className="space-y-2">{linkedCAPAs.map((c) => (
                          <div key={c.id} onClick={() => navigate("/capa", { state: { openCapaId: c.id } })} role="button" aria-label={`Open ${c.id} in CAPA Tracker`}
                            className={clsx("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:border-[#0ea5e9]", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="font-mono text-[11px] font-semibold text-[#0ea5e9] flex-shrink-0">{c.id}</span>
                              <span className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{c.description}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                              {c.diGate && c.status !== "Closed" && <Badge variant="red">DI gate</Badge>}
                              <Badge variant={c.status === "Closed" ? "green" : c.status === "Pending QA Review" ? "purple" : c.status === "In Progress" ? "amber" : "blue"}>{c.status}</Badge>
                            </div>
                          </div>
                        ))}</div>
                      )}
                    </div></div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>

      {/* ═══════════ ROADMAP TAB ═══════════ */}
      <div role="tabpanel" id="panel-roadmap" aria-labelledby="tab-roadmap" tabIndex={0} hidden={activeTab !== "roadmap"}>
        {/* Summary + Add button */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="blue">{roadmap.filter((a) => a.status === "Planned").length} planned</Badge>
            <Badge variant="amber">{roadmap.filter((a) => a.status === "In Progress").length} in progress</Badge>
            <Badge variant="green">{roadmap.filter((a) => a.status === "Complete").length} complete</Badge>
            <Badge variant="red">{roadmap.filter((a) => a.status === "Overdue").length} overdue</Badge>
          </div>
          {role !== "viewer" && systems.length > 0 && (
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddActivityOpen(true)}>Add activity</Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <Dropdown placeholder="All systems" value={rmSysFilter} onChange={setRmSysFilter} width="w-48" options={[{ value: "", label: "All systems" }, ...systems.map((s) => ({ value: s.id, label: s.name.split(" \u2014 ")[0] || s.name }))]} />
          <Dropdown placeholder="All types" value={rmTypeFilter} onChange={setRmTypeFilter} width="w-40" options={[{ value: "", label: "All types" }, ...["IQ", "OQ", "PQ", "PV", "UAT", "Risk Assessment", "Periodic Review"].map((t) => ({ value: t, label: t }))]} />
          <Dropdown placeholder="All statuses" value={rmStatusFilter} onChange={setRmStatusFilter} width="w-36" options={[{ value: "", label: "All statuses" }, { value: "Planned", label: "Planned" }, { value: "In Progress", label: "In Progress" }, { value: "Complete", label: "Complete" }, { value: "Overdue", label: "Overdue" }]} />
        </div>

        {/* Grouped timeline */}
        {roadmapGrouped.length === 0 ? (
          <div className="card p-10 text-center">
            <GitBranch className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            {systems.length === 0 ? (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No roadmap activities yet</p>
                <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>First add your GxP systems in the System Inventory tab. Roadmap activities are created when systems have planned validation actions.</p>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("inventory")}>Go to System Inventory</Button>
              </>
            ) : roadmap.length === 0 ? (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No roadmap activities planned yet</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Activities will appear here once systems have validation actions in progress.</p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No activities match the current filters</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setRmSysFilter(""); setRmTypeFilter(""); setRmStatusFilter(""); }}>Clear filters</Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {roadmapGrouped.map(({ system: sys, activities }) => (
              <div key={sys.id}>
                <div className="flex items-center gap-2 mb-2 mt-4">
                  <Badge variant="gray">{sys.type}</Badge>
                  <span className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{sys.name}</span>
                  {riskBadge(sys.riskLevel)}
                </div>
                <div className="space-y-2">
                  {activities.map((a) => {
                    const pct = activityProgress(a);
                    return (
                      <div key={a.id} className={clsx("p-3 rounded-lg border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ACTIVITY_COLORS[a.type] ?? "#64748b" }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="gray">{a.type}</Badge>
                              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(a.startDate).format("DD MMM")} &rarr; {dayjs.utc(a.endDate).format("DD MMM YYYY")}</span>
                            </div>
                          </div>
                          {actStatusBadge(a.status)}
                          <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</span>
                        </div>
                        <div className={clsx("h-1 rounded-full mt-2", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: a.status === "Overdue" ? "#ef4444" : a.status === "Complete" ? "#10b981" : a.status === "In Progress" ? "#f59e0b" : "#0ea5e9" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add System Modal ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add GxP system">
        {renderSystemForm(addForm, onAddSave, "Add system")}
      </Modal>

      {/* ── Edit System Modal ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${selectedSystem?.name ?? "system"}`}>
        {renderSystemForm(editForm, onEditSave, "Save changes")}
      </Modal>

      {/* ── Popups ── */}
      <Popup isOpen={addedPopup} variant="success" title="System added" description="Added to the inventory. Part 11 / Annex 11 columns appear based on active frameworks in Settings." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={editSavedPopup} variant="success" title="System updated" description="Changes saved to the system record." onDismiss={() => setEditSavedPopup(false)} />
      <Popup isOpen={riskFactorsSaved} variant="success" title="Risk factors saved" description="Risk factors updated. Visible in system detail and inspector review." onDismiss={() => setRiskFactorsSaved(false)} />
      <Popup isOpen={actionsSaved} variant="success" title="Planned actions saved" description="Validation plan updated." onDismiss={() => setActionsSaved(false)} />
      <Popup isOpen={removePopup} variant="confirmation" title="Remove this system?" description="The system will be removed from the inventory. Existing findings and CAPAs are not affected." onDismiss={() => { setRemovePopup(false); setSystemToRemove(null); }} actions={[{ label: "Cancel", style: "ghost", onClick: () => { setRemovePopup(false); setSystemToRemove(null); } }, { label: "Yes, remove", style: "primary", onClick: () => { if (systemToRemove) dispatch(removeSystem(systemToRemove)); if (selectedSystem?.id === systemToRemove) setSelectedSystemId(null); setRemovePopup(false); setSystemToRemove(null); } }]} />

      {/* Add Activity Modal */}
      <Modal open={addActivityOpen} onClose={() => setAddActivityOpen(false)} title="Add roadmap activity">
        <form onSubmit={activityForm.handleSubmit(onActivitySave)} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>System <span aria-hidden="true">*</span></label>
              <Controller name="systemId" control={activityForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} placeholder="Select system..." width="w-full" options={systems.map((s) => ({ value: s.id, label: s.name }))} />
              )} />
              {activityForm.formState.errors.systemId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{activityForm.formState.errors.systemId.message}</p>}
            </div>
            <div className="col-span-2">
              <label htmlFor="act-title" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Activity title <span aria-hidden="true">*</span></label>
              <input id="act-title" className="input text-[12px]" placeholder="e.g. LIMS IQ protocol execution" {...activityForm.register("title")} />
              {activityForm.formState.errors.title && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{activityForm.formState.errors.title.message}</p>}
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Activity type *</label>
              <Controller name="type" control={activityForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} placeholder="Select type..." width="w-full" options={[
                  { value: "IQ", label: "IQ \u2014 Installation Qualification" },
                  { value: "OQ", label: "OQ \u2014 Operational Qualification" },
                  { value: "PQ", label: "PQ \u2014 Performance Qualification" },
                  { value: "PV", label: "PV \u2014 Process Validation" },
                  { value: "UAT", label: "UAT \u2014 User Acceptance Testing" },
                  { value: "Risk Assessment", label: "Risk Assessment" },
                  { value: "Periodic Review", label: "Periodic Review" },
                ]} />
              )} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Status *</label>
              <Controller name="status" control={activityForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                  { value: "Planned", label: "Planned" },
                  { value: "In Progress", label: "In Progress" },
                  { value: "Complete", label: "Complete" },
                  { value: "Overdue", label: "Overdue" },
                ]} />
              )} />
            </div>
            <div>
              <label htmlFor="act-start" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Start date *</label>
              <input id="act-start" type="date" className="input text-[12px]" {...activityForm.register("startDate")} />
              {activityForm.formState.errors.startDate && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{activityForm.formState.errors.startDate.message}</p>}
            </div>
            <div>
              <label htmlFor="act-end" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>End date *</label>
              <input id="act-end" type="date" className="input text-[12px]" {...activityForm.register("endDate")} />
              {activityForm.formState.errors.endDate && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{activityForm.formState.errors.endDate.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Owner *</label>
              <Controller name="owner" control={activityForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner..." width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
              )} />
              {activityForm.formState.errors.owner && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{activityForm.formState.errors.owner.message}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={() => setAddActivityOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" icon={Save} loading={activityForm.formState.isSubmitting}>Add activity</Button>
          </div>
        </form>
      </Modal>
      <Popup isOpen={activityAddedPopup} variant="success" title="Activity added" description="Roadmap activity added. It will appear in the system's Validation tab and CSV Roadmap timeline." onDismiss={() => setActivityAddedPopup(false)} />
    </main>
  );
}
