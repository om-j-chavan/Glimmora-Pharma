import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  BarChart3, ClipboardList, FolderOpen, Plus, Search, Filter,
  X, ChevronRight, ChevronDown, AlertCircle, AlertTriangle,
  Info, Clock, Link2, Bot, ExternalLink, Download, FileCheck, Paperclip,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import dayjs from "@/lib/dayjs";
import { chartDefaults } from "@/lib/chartColors";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import {
  addFinding, updateFinding,
  type Finding, type FindingSeverity, type FindingStatus,
} from "@/store/findings.slice";
import { addCAPA } from "@/store/capa.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { Badge } from "@/components/ui/Badge";

/* ── Constants ── */

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];

const FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};

type TabId = "summary" | "register" | "evidence";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "summary", label: "Summary", Icon: BarChart3 },
  { id: "register", label: "Findings Register", Icon: ClipboardList },
  { id: "evidence", label: "Evidence Index", Icon: FolderOpen },
];

const AREA_OPTIONS = [{ value: "", label: "All areas" }, ...AREAS.map((a) => ({ value: a, label: a }))];
const SEVERITY_OPTIONS = [
  { value: "", label: "All severities" },
  { value: "Critical", label: "Critical", badge: "C", badgeVariant: "red" as const },
  { value: "Major", label: "Major", badge: "M", badgeVariant: "amber" as const },
  { value: "Minor", label: "Minor" },
];
const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Open", label: "Open" },
  { value: "In Progress", label: "In Progress" },
  { value: "Closed", label: "Closed" },
];

/* ── Helpers ── */

function severityBadge(s: FindingSeverity) {
  const m: Record<string, string> = { Critical: "badge badge-red", Major: "badge badge-amber", Minor: "badge badge-gray" };
  return <span className={m[s]}>{s}</span>;
}
function statusBadge(s: FindingStatus) {
  const m: Record<string, string> = { Open: "badge badge-blue", "In Progress": "badge badge-amber", Closed: "badge badge-green" };
  return <span className={m[s]}>{s}</span>;
}
function capaStatusBadge(s: string) {
  const m: Record<string, string> = { Open: "badge badge-blue", "In Progress": "badge badge-amber", "Pending QA Review": "badge badge-purple", Closed: "badge badge-green" };
  return <span className={m[s] ?? "badge badge-gray"}>{s}</span>;
}
/* ── Evidence helpers ── */

const DOC_TYPE_MAP: Record<string, string> = {
  p210: "Record", p11: "Audit Trail", annex11: "Audit Trail",
  annex15: "Validation", ichq9: "Report", ichq10: "Report",
  gamp5: "Validation", who: "SOP", mhra: "SOP",
};

function getEvidenceStatus(f: Finding): "Complete" | "Partial" | "Missing" {
  if (f.status === "Closed" && f.evidenceLink.trim().length > 0) return "Complete";
  if (f.evidenceLink.trim().length > 0) return "Partial";
  return "Missing";
}

function getAreaStatus(rows: { status: "Complete" | "Partial" | "Missing" }[]): "Complete" | "Partial" | "Missing" {
  if (rows.length === 0) return "Complete";
  if (rows.every((r) => r.status === "Complete")) return "Complete";
  if (rows.some((r) => r.status === "Missing")) return "Missing";
  return "Partial";
}

/* ── Zod ── */
const findingSchema = z.object({
  siteId: z.string().min(1, "Site required"),
  area: z.string().min(1, "Area required"),
  requirement: z.string().min(5, "Requirement required"),
  framework: z.string().min(1, "Framework required"),
  severity: z.enum(["Critical", "Major", "Minor"]),
  status: z.enum(["Open", "In Progress", "Closed"]),
  owner: z.string().min(1, "Owner required"),
  targetDate: z.string().min(1, "Target date required"),
  evidenceLink: z.string().optional(),
});
type FindingForm = z.infer<typeof findingSchema>;

/* ══════════════════════════════════════ */

export function GapPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { isViewOnly } = useRole();

  const findings = useAppSelector((s) => s.findings.items);
  const capas = useAppSelector((s) => s.capa.items);
  const sites = useAppSelector((s) => s.settings.sites);
  const users = useAppSelector((s) => s.settings.users);
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const agiMode = useAppSelector((s) => s.settings.agi.mode);
  const agiCapa = useAppSelector((s) => s.settings.agi.agents.capa);
  const timezone = useAppSelector((s) => s.settings.org.timezone);
  const dateFormat = useAppSelector((s) => s.settings.org.dateFormat);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  const activeFrameworks = useMemo(
    () => (Object.keys(frameworks) as (keyof typeof frameworks)[]).filter((k) => frameworks[k]),
    [frameworks],
  );

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [siteFilter, setSiteFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [capaRaisedPopup, setCapaRaisedPopup] = useState(false);
  const [raisedCapaId, setRaisedCapaId] = useState("");
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(() => new Set(AREAS));
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceFindingId, setEvidenceFindingId] = useState("");
  const [evidenceInput, setEvidenceInput] = useState("");
  const [evidenceLinkedPopup, setEvidenceLinkedPopup] = useState(false);
  const [exportPopup, setExportPopup] = useState(false);

  const isAnyFilterActive = !!(siteFilter || areaFilter || frameworkFilter || severityFilter || statusFilter);
  function clearFilters() { setSiteFilter(""); setAreaFilter(""); setFrameworkFilter(""); setSeverityFilter(""); setStatusFilter(""); }

  /* ── Open from route state ── */
  useEffect(() => {
    const openId = (location.state as { openFindingId?: string } | null)?.openFindingId;
    if (openId) {
      const found = findings.find((f) => f.id === openId);
      if (found) { setActiveTab("register"); setSelectedFinding(found); }
    }
  }, []);

  /* ── Filtered ── */
  const baseFindings = useMemo(() =>
    findings.filter((f) => {
      if (siteFilter && f.siteId !== siteFilter) return false;
      if (areaFilter && f.area !== areaFilter) return false;
      if (frameworkFilter && f.framework !== frameworkFilter) return false;
      if (severityFilter && f.severity !== severityFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      return true;
    }),
  [findings, siteFilter, areaFilter, frameworkFilter, severityFilter, statusFilter]);

  const filteredFindings = useMemo(() => {
    if (!searchQuery) return baseFindings;
    const q = searchQuery.toLowerCase();
    return baseFindings.filter((f) => f.id.toLowerCase().includes(q) || f.area.toLowerCase().includes(q) || f.requirement.toLowerCase().includes(q));
  }, [baseFindings, searchQuery]);

  /* ── Computed ── */
  const criticalCount = baseFindings.filter((f) => f.severity === "Critical").length;
  const majorCount = baseFindings.filter((f) => f.severity === "Major").length;
  const minorCount = baseFindings.filter((f) => f.severity === "Minor").length;
  const openCount = baseFindings.filter((f) => f.status !== "Closed").length;
  const closedCount = baseFindings.filter((f) => f.status === "Closed").length;
  const overdueCount = baseFindings.filter((f) => f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs())).length;

  const topDrivers = useMemo(() => {
    const map: Record<string, { count: number; critical: number; major: number }> = {};
    baseFindings.filter((f) => f.status !== "Closed").forEach((f) => {
      if (!map[f.area]) map[f.area] = { count: 0, critical: 0, major: 0 };
      map[f.area].count++;
      if (f.severity === "Critical") map[f.area].critical++;
      if (f.severity === "Major") map[f.area].major++;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [baseFindings]);

  const severityData = useMemo(
    () => [
      { name: "Critical", value: criticalCount, fill: "#ef4444" },
      { name: "Major", value: majorCount, fill: "#f59e0b" },
      { name: "Minor", value: minorCount, fill: "#10b981" },
    ].filter((d) => d.value > 0),
    [criticalCount, majorCount, minorCount],
  );

  function ownerName(uid: string) { return users.find((u) => u.id === uid)?.name ?? uid; }
  function toggleArea(a: string) { setExpandedAreas((p) => { const n = new Set(p); n.has(a) ? n.delete(a) : n.add(a); return n; }); }

  /* ── Raise CAPA ── */
  function handleRaiseCapa(finding: Finding) {
    const capaId = `CAPA-${String(Date.now()).slice(-4)}`;
    dispatch(updateFinding({ id: finding.id, patch: { capaId } }));
    dispatch(addCAPA({
      id: capaId, findingId: finding.id, source: "Gap Assessment",
      risk: finding.severity, owner: finding.owner, dueDate: finding.targetDate,
      status: "Open", description: finding.requirement,
      rca: "", rcaMethod: undefined, correctiveActions: "",
      effectivenessCheck: finding.severity !== "Minor",
      evidenceLinks: [], diGate: ["p11", "annex11"].includes(finding.framework), createdAt: "",
    }));
    auditLog({ action: "CAPA_RAISED_FROM_FINDING", module: "gap-assessment", recordId: finding.id, newValue: { capaId, findingId: finding.id } });
    setSelectedFinding((prev) => prev ? { ...prev, capaId } : null);
    setRaisedCapaId(capaId);
    setCapaRaisedPopup(true);
  }

  /* ── Form ── */
  const { register: reg, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FindingForm>({
    resolver: zodResolver(findingSchema),
    defaultValues: { severity: "Major", status: "Open" },
  });

  function onSubmit(data: FindingForm) {
    const nf: Finding = { ...data, id: `FIND-${String(findings.length + 1).padStart(3, "0")}`, evidenceLink: data.evidenceLink ?? "", createdAt: "", capaId: undefined, agiSummary: undefined };
    dispatch(addFinding(nf));
    auditLog({ action: "FINDING_CREATED", module: "gap-assessment", recordId: nf.id, newValue: nf });
    setAddOpen(false); setAddedPopup(true); reset();
  }

  /* ── Evidence data (derived from findings) ── */
  const evidenceAreas = useMemo(() =>
    AREAS.map((area) => {
      const areaFindings = findings.filter((f) => f.area === area);
      const rows = areaFindings.map((f) => ({
        findingId: f.id, framework: f.framework,
        docType: DOC_TYPE_MAP[f.framework] ?? "Record",
        name: f.requirement, evidenceLink: f.evidenceLink,
        status: getEvidenceStatus(f), severity: f.severity,
        findingStatus: f.status, owner: f.owner,
        linkedCapa: capas.find((c) => c.id === f.capaId),
      }));
      return { area, rows, status: getAreaStatus(rows) };
    }).filter((a) => a.rows.length > 0),
  [findings, capas]);

  const allEvidenceRows = evidenceAreas.flatMap((a) => a.rows);
  const completeCount = allEvidenceRows.filter((r) => r.status === "Complete").length;
  const partialCount = allEvidenceRows.filter((r) => r.status === "Partial").length;
  const missingCount = allEvidenceRows.filter((r) => r.status === "Missing").length;

  /* ── Shared filter dropdowns ── */
  const siteOptions = useMemo(() => [{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))], [sites]);
  const fwOptions = useMemo(() => [{ value: "", label: "All frameworks" }, ...activeFrameworks.map((k) => ({ value: k, label: FRAMEWORK_LABELS[k] ?? k }))], [activeFrameworks]);

  function renderFilters(compact = false) {
    return (
      <>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width={compact ? "w-36" : "w-44"} options={siteOptions} />
        <Dropdown placeholder="All areas" value={areaFilter} onChange={setAreaFilter} width="w-36" options={AREA_OPTIONS} />
        {!compact && <Dropdown placeholder="All frameworks" value={frameworkFilter} onChange={setFrameworkFilter} width="w-40" options={fwOptions} />}
        <Dropdown placeholder="All severities" value={severityFilter} onChange={setSeverityFilter} width="w-36" options={SEVERITY_OPTIONS} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-36" options={STATUS_OPTIONS} />
        {isAnyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
      </>
    );
  }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="GxP/GMP gap assessment and findings" className="w-full max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Gap Assessment &amp; Findings</h1>
          <p className="page-subtitle mt-1">{findings.length === 0 ? "No findings logged yet" : `${findings.length} findings \u00b7 ${criticalCount} critical \u00b7 ${openCount} open`}</p>
        </div>
        {!isViewOnly && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Log finding</Button>}
      </header>

      {/* Tab bar */}
      <div role="tablist" aria-label="Gap assessment sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={clsx(
              "inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors duration-150 bg-transparent border-x-0 border-t-0 cursor-pointer outline-none",
              activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)",
            )}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ SUMMARY ═══════════ */}
      <div role="tabpanel" id="panel-summary" aria-labelledby="tab-summary" tabIndex={0} hidden={activeTab !== "summary"}>
        {/* Filters */}
        <section aria-label="Finding filters" className="flex items-center gap-3 flex-wrap mb-6 p-4 rounded-xl border"
          style={{ background: isDark ? "#0a1f38" : "#f8fafc", borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
          <Filter className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
          {renderFilters()}
        </section>

        {/* Tiles */}
        <section aria-label="Finding statistics" className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { icon: ClipboardList, iconCls: "text-[#0ea5e9]", label: "Total findings", value: baseFindings.length, color: "", sub: findings.length === 0 ? "Log your first finding to get started" : `${openCount} open \u00b7 ${closedCount} closed` },
            { icon: AlertCircle, iconCls: "text-[#ef4444]", label: "Critical", value: criticalCount, color: "text-[#ef4444]", sub: criticalCount > 0 ? "Immediate action required" : "None" },
            { icon: AlertTriangle, iconCls: "text-[#f59e0b]", label: "Major", value: majorCount, color: "text-[#f59e0b]", sub: "Prompt attention needed" },
            { icon: Info, iconCls: "text-[#10b981]", label: "Minor", value: minorCount, color: "text-[#10b981]", sub: "Low inspection risk" },
            { icon: Clock, iconCls: overdueCount > 0 ? "text-[#ef4444]" : "text-[#10b981]", label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "text-[#ef4444]" : "text-[#10b981]", sub: overdueCount > 0 ? "Past target date" : "All on track" },
          ].map((tile) => (
            <div key={tile.label} className="stat-card" role="region" aria-label={tile.label}>
              <div className="flex items-center gap-2 mb-2">
                <tile.icon className={clsx("w-5 h-5", tile.iconCls)} aria-hidden="true" />
                <span className="stat-label mb-0">{tile.label}</span>
              </div>
              <div className={clsx("stat-value", tile.color)}>{tile.value}</div>
              <div className="stat-sub">{tile.sub}</div>
            </div>
          ))}
        </section>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <section aria-labelledby="drivers-title" className="card lg:col-span-2">
            <div className="card-header"><h2 id="drivers-title" className="card-title">Top 5 risk drivers</h2></div>
            <div className="card-body">
              {topDrivers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <BarChart3 className="w-8 h-8 text-[#334155]" aria-hidden="true" />
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No open findings</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topDrivers} layout="vertical" barSize={10}>
                    <CartesianGrid {...chartDefaults.cartesianGrid} horizontal={false} />
                    <XAxis type="number" {...chartDefaults.xAxis} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...chartDefaults.tooltip} />
                    <Bar dataKey="critical" name="Critical" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="major" name="Major" stackId="a" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section aria-labelledby="donut-title" className="card">
            <div className="card-header"><h2 id="donut-title" className="card-title">Severity breakdown</h2></div>
            <div className="card-body">
              {severityData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <ClipboardList className="w-8 h-8 text-[#334155]" aria-hidden="true" />
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No findings yet</p>
                </div>
              ) : (
                <div className="relative">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                        {severityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip {...chartDefaults.tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{baseFindings.length}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>findings</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ═══════════ FINDINGS REGISTER ═══════════ */}
      <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" tabIndex={0} hidden={activeTab !== "register"}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
            <input type="search" className="input pl-8 text-[12px]" placeholder="Search findings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search findings" />
          </div>
          {renderFilters(true)}
          {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Log finding</Button>}
        </div>

        <div className={clsx("grid gap-4", selectedFinding ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1")}>
          {/* Table */}
          <div className={clsx(selectedFinding ? "lg:col-span-2" : "", "overflow-x-auto")}>
            {filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ClipboardList className="w-12 h-12 text-[#334155]" aria-hidden="true" />
                {findings.length === 0 ? (
                  <>
                    <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No findings logged yet</p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Log your first finding to start tracking GxP compliance gaps.</p>
                    {!isViewOnly && <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Log your first finding</Button>}
                  </>
                ) : (
                  <>
                    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No findings match the current filters</p>
                    {isAnyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
                  </>
                )}
              </div>
            ) : (
              <table className="data-table" aria-label="GxP/GMP findings register">
                <caption className="sr-only">List of all GxP/GMP findings with severity, status and target dates</caption>
                <thead><tr>
                  <th scope="col">ID</th><th scope="col">Area</th><th scope="col">Requirement</th>
                  <th scope="col">Framework</th><th scope="col">Severity</th><th scope="col">Status</th>
                  <th scope="col">Owner</th><th scope="col">Target date</th><th scope="col">Evidence</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr></thead>
                <tbody>
                  {filteredFindings.map((f) => (
                    <tr key={f.id} onClick={() => setSelectedFinding(selectedFinding?.id === f.id ? null : f)} className="cursor-pointer" aria-selected={selectedFinding?.id === f.id}
                      style={selectedFinding?.id === f.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}>
                      <th scope="row">
                        <div className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{f.id}</div>
                        {f.capaId && <div className="flex items-center gap-1 mt-0.5"><Link2 className="w-3 h-3 text-[#0ea5e9]" aria-hidden="true" /><span className="text-[10px] text-[#0ea5e9]">{f.capaId}</span></div>}
                      </th>
                      <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{f.area}</td>
                      <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }}>{f.requirement}</span></td>
                      <td><span className="badge badge-blue text-[10px]">{FRAMEWORK_LABELS[f.framework] ?? f.framework}</span></td>
                      <td>{severityBadge(f.severity)}</td>
                      <td>{statusBadge(f.status)}</td>
                      <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{ownerName(f.owner)}</td>
                      <td className="whitespace-nowrap">
                        <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(f.targetDate).tz(timezone).format(dateFormat)}</div>
                        {f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}
                      </td>
                      <td>{f.evidenceLink ? <span className="text-[11px] text-[#0ea5e9]">{f.evidenceLink}</span> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>}</td>
                      <td><Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View detail for ${f.id}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Detail panel */}
          {selectedFinding && (
            <aside aria-label="Finding detail" className="card lg:col-span-1">
              <div className="card-header">
                <span className="font-mono text-[12px] text-[#0ea5e9] font-semibold">{selectedFinding.id}</span>
                <Button variant="ghost" size="xs" icon={X} aria-label="Close detail panel" onClick={() => setSelectedFinding(null)} />
              </div>
              <div className="card-body space-y-4 overflow-y-auto" style={{ maxHeight: 600 }}>
                <div className="flex gap-2 flex-wrap">{severityBadge(selectedFinding.severity)}{statusBadge(selectedFinding.status)}</div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">Requirement</h3>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.requirement}</p>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">Area &amp; Framework</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedFinding.area} &middot; {FRAMEWORK_LABELS[selectedFinding.framework] ?? selectedFinding.framework}</p>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">Owner</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(selectedFinding.owner)}</p>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">Target date</h3>
                  <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
                    {dayjs.utc(selectedFinding.targetDate).tz(timezone).format(dateFormat)}
                    {selectedFinding.status !== "Closed" && dayjs.utc(selectedFinding.targetDate).isBefore(dayjs()) && <span className="badge badge-red text-[10px] ml-2">Overdue</span>}
                  </p>
                </div>

                {selectedFinding.agiSummary && agiMode !== "manual" && agiCapa && (
                  <div className="agi-panel" role="status" aria-live="polite">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>AGI Risk Analysis</span>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.agiSummary}</p>
                  </div>
                )}

                {/* CAPA link or Raise button */}
                {selectedFinding.capaId ? (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1">Linked CAPA</h3>
                    {(() => {
                      const lc = capas.find((c) => c.id === selectedFinding.capaId);
                      return (
                        <>
                          <div className="flex items-center gap-2 mt-1">
                            <button type="button" onClick={() => navigate("/capa", { state: { openCapaId: selectedFinding.capaId } })} className="flex items-center gap-1.5 text-[12px] text-[#0ea5e9] hover:underline bg-transparent border-none cursor-pointer p-0">
                              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{selectedFinding.capaId}
                            </button>
                            {lc && capaStatusBadge(lc.status)}
                          </div>
                          {lc?.status === "Pending QA Review" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--info-bg)", color: "var(--info)" }}>CAPA pending QA review. Once closed, this finding will be automatically closed.</p>}
                          {lc?.status === "Closed" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)" }}>CAPA closed. This finding has been automatically closed.</p>}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  !isViewOnly && selectedFinding.status !== "Closed" && (
                    <Button variant="secondary" icon={Plus} fullWidth onClick={() => handleRaiseCapa(selectedFinding)}>Raise CAPA</Button>
                  )
                )}

                {/* Status update */}
                {!isViewOnly && selectedFinding.status !== "Closed" && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#475569] mb-1.5">Update status</p>
                    <Dropdown value={selectedFinding.status} onChange={(val) => {
                      dispatch(updateFinding({ id: selectedFinding.id, patch: { status: val as FindingStatus } }));
                      auditLog({ action: "FINDING_STATUS_UPDATED", module: "gap-assessment", recordId: selectedFinding.id, oldValue: selectedFinding.status, newValue: val });
                      setSelectedFinding({ ...selectedFinding, status: val as FindingStatus });
                    }} options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Closed", label: "Closed" }]} width="w-full" />
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ═══════════ EVIDENCE INDEX ═══════════ */}
      <div role="tabpanel" id="panel-evidence" aria-labelledby="tab-evidence" tabIndex={0} hidden={activeTab !== "evidence"}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Evidence index</h2>
          <Button variant="primary" size="sm" icon={Download} onClick={() => setExportPopup(true)}>Export evidence pack</Button>
        </div>

        {allEvidenceRows.length === 0 ? (
          <div className="card p-10 text-center">
            <FolderOpen className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No evidence to show yet</p>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Log findings in the Findings Register tab. Each finding will appear here as an evidence row.</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setActiveTab("register")}>Go to Findings Register</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <Badge variant="green">{completeCount} complete</Badge>
              <Badge variant="amber">{partialCount} partial</Badge>
              <Badge variant="red">{missingCount} missing</Badge>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>across {allEvidenceRows.length} findings in {evidenceAreas.length} areas</span>
            </div>

            <div className="space-y-3">
              {evidenceAreas.map(({ area, rows, status }) => {
                const isExp = expandedAreas.has(area);
                const areaKey = area.replace(/\s+/g, "-");
                return (
                  <div key={area}>
                    <button type="button" onClick={() => toggleArea(area)} aria-expanded={isExp} aria-controls={`evidence-area-${areaKey}`}
                      className={clsx("w-full flex items-center justify-between p-4 rounded-xl border cursor-pointer text-left transition-all duration-150",
                        isDark ? "bg-[#0a1f38] border-[#1e3a5a] hover:bg-[#0d2a4a]" : "bg-white border-[#e2e8f0] hover:bg-[#f8fafc]")}>
                      <span className="flex items-center gap-2">
                        <ChevronDown className={clsx("w-4 h-4 transition-transform duration-150 shrink-0", isExp && "rotate-180")} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                        <span className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{area}</span>
                        <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>({rows.length} finding{rows.length !== 1 ? "s" : ""})</span>
                      </span>
                      <Badge variant={status === "Complete" ? "green" : status === "Partial" ? "amber" : "red"}>{status}</Badge>
                    </button>

                    {isExp && (
                      <div id={`evidence-area-${areaKey}`} className="mt-2">
                        <div className="card overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="data-table" aria-label={`Evidence for ${area}`}>
                              <caption className="sr-only">Evidence documents for {area} area findings</caption>
                              <thead><tr>
                                <th scope="col">Finding ID</th><th scope="col">Doc type</th><th scope="col">Requirement</th>
                                <th scope="col">Severity</th><th scope="col">Evidence link</th><th scope="col">Status</th>
                                <th scope="col">Owner</th><th scope="col"><span className="sr-only">Actions</span></th>
                              </tr></thead>
                              <tbody>
                                {rows.map((row) => (
                                  <tr key={row.findingId}>
                                    <th scope="row">
                                      <button type="button" onClick={() => { setActiveTab("register"); const f = findings.find((x) => x.id === row.findingId); if (f) setSelectedFinding(f); }}
                                        className="font-mono text-[11px] font-semibold text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0"
                                        aria-label={`Open ${row.findingId} in register`}>{row.findingId}</button>
                                    </th>
                                    <td><Badge variant="gray">{row.docType}</Badge></td>
                                    <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 220, color: "var(--text-primary)" }}>{row.name}</span></td>
                                    <td><Badge variant={row.severity === "Critical" ? "red" : row.severity === "Major" ? "amber" : "gray"}>{row.severity}</Badge></td>
                                    <td>
                                      {row.evidenceLink ? (
                                        <div className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-[#10b981]" aria-hidden="true" /><span className="text-[11px] text-[#0ea5e9]">{row.evidenceLink}</span></div>
                                      ) : (
                                        <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No document linked</span>
                                      )}
                                    </td>
                                    <td><Badge variant={row.status === "Complete" ? "green" : row.status === "Partial" ? "amber" : "red"}>{row.status}</Badge></td>
                                    <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(row.owner)}</td>
                                    <td>
                                      <div className="flex items-center gap-1">
                                        {!isViewOnly && (
                                          <Button variant="ghost" size="xs" icon={Paperclip}
                                            aria-label={row.evidenceLink ? `Update evidence for ${row.findingId}` : `Link evidence to ${row.findingId}`}
                                            onClick={() => { setEvidenceFindingId(row.findingId); setEvidenceInput(row.evidenceLink ?? ""); setEvidenceModalOpen(true); }} />
                                        )}
                                        {row.evidenceLink && (
                                          <Button variant="ghost" size="xs" icon={ExternalLink} aria-label={`View evidence for ${row.findingId}`} />
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Add Finding Modal ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Log new finding">
        <form onSubmit={handleSubmit(onSubmit)} aria-label="Add new finding" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select site..." value={watch("siteId") ?? ""} onChange={(v) => setValue("siteId", v, { shouldValidate: true })} width="w-full"
                options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />
              {errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Area <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select area..." value={watch("area") ?? ""} onChange={(v) => setValue("area", v, { shouldValidate: true })} width="w-full"
                options={AREAS.map((a) => ({ value: a, label: a }))} />
              {errors.area && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.area.message}</p>}
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Framework <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select framework..." value={watch("framework") ?? ""} onChange={(v) => setValue("framework", v, { shouldValidate: true })} width="w-full"
                options={activeFrameworks.map((k) => ({ value: k, label: FRAMEWORK_LABELS[k] ?? k }))} />
              {errors.framework && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.framework.message}</p>}
            </div>
            <div className="col-span-2">
              <label htmlFor="f-req" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Requirement <span className="text-(--danger)">*</span></label>
              <input id="f-req" type="text" className="input text-[12px]" placeholder="e.g. Annex 11 §11 — Audit trail completeness" {...reg("requirement")} />
              {errors.requirement && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.requirement.message}</p>}
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Severity <span className="text-(--danger)">*</span></p>
              <Dropdown value={watch("severity") ?? "Major"} onChange={(v) => setValue("severity", v as FindingSeverity)} width="w-full"
                options={[{ value: "Critical", label: "Critical", badge: "C", badgeVariant: "red" as const }, { value: "Major", label: "Major", badge: "M", badgeVariant: "amber" as const }, { value: "Minor", label: "Minor" }]} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Status</p>
              <Dropdown value={watch("status") ?? "Open"} onChange={(v) => setValue("status", v as FindingStatus)} width="w-full"
                options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Closed", label: "Closed" }]} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select owner..." value={watch("owner") ?? ""} onChange={(v) => setValue("owner", v, { shouldValidate: true })} width="w-full"
                options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
              {errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}
            </div>
            <div>
              <label htmlFor="f-target" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Target date <span className="text-(--danger)">*</span></label>
              <input id="f-target" type="date" className="input text-[12px]" {...reg("targetDate")} />
              {errors.targetDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.targetDate.message}</p>}
            </div>
            <div className="col-span-2">
              <label htmlFor="f-evidence" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Evidence link (optional)</label>
              <input id="f-evidence" type="text" className="input text-[12px]" placeholder="Document reference or URL" {...reg("evidenceLink")} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" icon={Plus} loading={isSubmitting}>Log finding</Button>
          </div>
        </form>
      </Modal>

      {/* ── Link evidence modal ── */}
      <Modal open={evidenceModalOpen} onClose={() => { setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceInput(""); }} title={evidenceInput ? "Update evidence document" : "Link evidence document"}>
        <div className={clsx("rounded-lg p-3 mb-4 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Linking evidence for</p>
          <p className="font-mono text-[12px] font-semibold text-[#0ea5e9] mt-0.5">{evidenceFindingId}</p>
          {(() => { const f = findings.find((x) => x.id === evidenceFindingId); return f ? <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{f.requirement}</p> : null; })()}
        </div>
        <label htmlFor="evidence-input" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Document reference or link <span className="text-(--danger)">*</span></label>
        <input id="evidence-input" type="text" className="input text-[12px]" value={evidenceInput} onChange={(e) => setEvidenceInput(e.target.value)} placeholder="e.g. SOP-QC-042-v3 or https://docs.company.com/..." aria-required="true" aria-describedby="evidence-hint" />
        <p id="evidence-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Enter a document ID, filename, or URL.</p>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="ghost" type="button" onClick={() => { setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceInput(""); }}>Cancel</Button>
          <Button variant="primary" icon={Paperclip} disabled={!evidenceInput.trim()} onClick={() => {
            dispatch(updateFinding({ id: evidenceFindingId, patch: { evidenceLink: evidenceInput.trim() } }));
            auditLog({ action: "EVIDENCE_LINKED", module: "gap-assessment", recordId: evidenceFindingId, newValue: { evidenceLink: evidenceInput.trim() } });
            setEvidenceModalOpen(false); setEvidenceFindingId(""); setEvidenceInput(""); setEvidenceLinkedPopup(true);
          }}>{evidenceInput ? "Update evidence" : "Link evidence"}</Button>
        </div>
      </Modal>

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="Finding logged" description="Added to the register. Raise a CAPA if corrective action is needed." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={capaRaisedPopup} variant="success" title="CAPA raised"
        description={`${raisedCapaId} created and linked. Go to CAPA Tracker to add RCA.`}
        onDismiss={() => setCapaRaisedPopup(false)}
        actions={[{ label: "Go to CAPA Tracker", style: "primary", onClick: () => { setCapaRaisedPopup(false); navigate("/capa", { state: { openCapaId: raisedCapaId } }); } }]} />
      <Popup isOpen={evidenceLinkedPopup} variant="success" title="Evidence linked" description="Document reference saved. Close the finding to mark evidence as Complete." onDismiss={() => setEvidenceLinkedPopup(false)} />
      <Popup isOpen={exportPopup} variant="success" title="Evidence pack exported"
        description={`${allEvidenceRows.length} evidence items across ${evidenceAreas.length} areas. ${missingCount > 0 ? `${missingCount} items still missing.` : "All areas have evidence linked."}`}
        onDismiss={() => setExportPopup(false)} />
    </main>
  );
}
