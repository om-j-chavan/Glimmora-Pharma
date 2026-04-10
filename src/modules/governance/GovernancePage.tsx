import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { BarChart3, AlertTriangle, FileDown } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { addItem, closeItem, type RAIDItem, type RAIDType, type RAIDStatus, type RAIDPriority } from "@/store/raid.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";

import { KPIScorecardTab } from "./tabs/KPIScorecardTab";
import { RAIDTab } from "./tabs/RAIDTab";
import { ReportsTab } from "./tabs/ReportsTab";

/* ── Helpers ── */
function raidTypeBadge(t: RAIDType) { const m: Record<RAIDType, "red" | "blue" | "amber" | "green"> = { Risk: "red", Action: "blue", Issue: "amber", Decision: "green" }; return <Badge variant={m[t]}>{t}</Badge>; }
function priorityBadge(p: RAIDPriority) { const m: Record<RAIDPriority, "red" | "amber" | "blue" | "gray"> = { Critical: "red", High: "amber", Medium: "blue", Low: "gray" }; return <Badge variant={m[p]}>{p}</Badge>; }

type TabId = "kpis" | "raid" | "reports";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "kpis", label: "KPIs & Scorecards", Icon: BarChart3 },
  { id: "raid", label: "RAID & Risks", Icon: AlertTriangle },
  { id: "reports", label: "Reports & Exports", Icon: FileDown },
];

const raidSchema = z.object({
  type: z.enum(["Risk", "Action", "Issue", "Decision"]),
  title: z.string().min(3, "Title required"),
  description: z.string().min(5, "Description required"),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  status: z.enum(["Open", "In Progress", "Closed", "Escalated"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});
type RaidForm = z.infer<typeof raidSchema>;

/* ══════════════════════════════════════ */

export function GovernancePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { raidItems, capas, findings, systems, fda483Events: fda483, tenantId } = useTenantData();
  const { org, sites, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const companyName = org.companyName;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { role } = useRole();

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  /* ── Computed KPIs ── */
  const closedCAPAs = capas.filter((c) => c.status === "Closed");
  const onTimeCAPAs = closedCAPAs.filter((c) => !dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate)));
  const capaTimeliness = closedCAPAs.length === 0 ? 0 : Math.round((onTimeCAPAs.length / closedCAPAs.length) * 100);
  const diExceptions = capas.filter((c) => c.diGate && c.status !== "Closed").length;
  const csvDrift = systems.filter((s) => s.validationStatus === "Overdue" || s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant").length;
  const overdueCommitments = fda483.reduce((sum, e) => sum + e.commitments.filter((c) => c.status !== "Complete" && dayjs.utc(c.dueDate).isBefore(dayjs())).length, 0);
  const repeatObservationRisk = fda483.reduce((sum, e) => sum + e.observations.filter((o) => o.status !== "Closed").length, 0);
  const auditTrailCoverage = systems.length === 0 ? 0 : Math.round((systems.filter((s) => s.part11Status === "Compliant" || s.part11Status === "N/A").length / systems.length) * 100);
  const readinessScore = (() => { const sc: number[] = []; if (capas.length > 0) sc.push(capaTimeliness); if (systems.length > 0) sc.push(auditTrailCoverage); const oc = findings.filter((f) => f.severity === "Critical" && f.status !== "Closed").length; sc.push(findings.length === 0 ? 100 : Math.round((1 - oc / Math.max(1, findings.length)) * 100)); return sc.length === 0 ? 0 : Math.round(sc.reduce((a, b) => a + b, 0) / sc.length); })();
  const noData = capas.length === 0 && findings.length === 0;

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("kpis");
  const [addRaidOpen, setAddRaidOpen] = useState(false);
  const [closeRaidOpen, setCloseRaidOpen] = useState(false);
  const [selectedRaid, setSelectedRaid] = useState<RAIDItem | null>(null);
  const [closeResolution, setCloseResolution] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [raidAddedPopup, setRaidAddedPopup] = useState(false);
  const [raidClosedPopup, setRaidClosedPopup] = useState(false);

  const anyRaidFilter = !!(typeFilter || statusFilter || priorityFilter);
  const filteredRaid = raidItems.filter((r) => { if (typeFilter && r.type !== typeFilter) return false; if (statusFilter && r.status !== statusFilter) return false; if (priorityFilter && r.priority !== priorityFilter) return false; return true; });
  const raidForm = useForm<RaidForm>({ resolver: zodResolver(raidSchema), defaultValues: { type: "Risk", priority: "Medium", status: "Open" } });

  function onRaidSave(data: RaidForm) { const id = crypto.randomUUID(); dispatch(addItem({ ...data, id, tenantId: tenantId ?? "", siteId: selectedSiteId ?? "", impact: data.impact ?? "", mitigation: data.mitigation ?? "", raisedBy: user?.id ?? "", dueDate: dayjs(data.dueDate).utc().toISOString(), createdAt: "" })); auditLog({ action: "RAID_ITEM_ADDED", module: "governance", recordId: id, newValue: data }); setAddRaidOpen(false); setRaidAddedPopup(true); raidForm.reset(); }
  function handleCloseRaid() { if (!selectedRaid || !closeResolution.trim()) return; dispatch(closeItem({ id: selectedRaid.id, resolution: closeResolution.trim() })); auditLog({ action: "RAID_ITEM_CLOSED", module: "governance", recordId: selectedRaid.id, newValue: { resolution: closeResolution } }); setCloseRaidOpen(false); setSelectedRaid(null); setCloseResolution(""); setRaidClosedPopup(true); }

  /* ── Chart data ── */
  const capaTrend = (() => { const m = []; for (let i = 5; i >= 0; i--) { const mo = dayjs().subtract(i, "month"); const mc = capas.filter((c) => c.status === "Closed" && c.createdAt && dayjs.utc(c.createdAt).format("MMM YYYY") === mo.format("MMM YYYY")); const ot = mc.filter((c) => !dayjs.utc(c.closedAt || c.dueDate).isAfter(dayjs.utc(c.dueDate))).length; m.push({ month: mo.format("MMM"), onTime: ot, late: mc.length - ot }); } return m; })();
  const capaTrendEmpty = capaTrend.every((d) => d.onTime === 0 && d.late === 0);
  const valBreakdown = [{ name: "Validated", value: systems.filter((s) => s.validationStatus === "Validated").length, color: "#10b981" }, { name: "In Progress", value: systems.filter((s) => s.validationStatus === "In Progress").length, color: "#f59e0b" }, { name: "Overdue", value: systems.filter((s) => s.validationStatus === "Overdue").length, color: "#ef4444" }, { name: "Not Started", value: systems.filter((s) => s.validationStatus === "Not Started").length, color: "#64748b" }].filter((d) => d.value > 0);
  const diByArea = (() => { return ["Manufacturing", "QC Lab", "QMS", "CSV/IT", "Warehouse", "Utilities"].map((a) => ({ area: a === "Manufacturing" ? "Mfg" : a, value: capas.filter((c) => c.diGate && c.status !== "Closed" && findings.filter((f) => f.area === a).some((f) => f.id === c.findingId)).length })).filter((d) => d.value > 0); })();

  /* ── Site readiness ── */
  const siteReadiness = sites.map((site) => { const sf = findings.filter((f) => f.siteId === site.id && f.status !== "Closed"); const sc = capas.filter((c) => { const lf = findings.find((f) => f.id === c.findingId); return lf?.siteId === site.id && c.status !== "Closed"; }); const cr = sf.filter((f) => f.severity === "Critical").length; const score = sf.length === 0 && sc.length === 0 ? 100 : Math.max(0, 100 - cr * 15 - sf.length * 5); return { site, findingsCount: sf.length, capasCount: sc.length, criticalCount: cr, score }; });

  /* ── Export functions ── */
  function dl(html: string, fn: string) { const b = new Blob([html], { type: "text/html;charset=utf-8" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); auditLog({ action: "GOVERNANCE_REPORT_EXPORTED", module: "governance", recordId: fn, newValue: { filename: fn, exportedBy: user?.id } }); }

  function exportMonthly() {
    const org = companyName || "Pharma Glimmora"; const rd = dayjs().format("MMMM YYYY");
    const rows = [["CAPA Timeliness", closedCAPAs.length === 0 ? "N/A" : `${capaTimeliness}%`, capaTimeliness >= 90], ["Overdue Commitments", String(overdueCommitments), overdueCommitments === 0], ["Repeat Observation Risk", String(repeatObservationRisk), repeatObservationRisk === 0], ["DI Exceptions", String(diExceptions), diExceptions === 0], ["Audit Trail Coverage", systems.length === 0 ? "N/A" : `${auditTrailCoverage}%`, auditTrailCoverage >= 80], ["Validation Drift", String(csvDrift), csvDrift === 0]].map(([k, v, ok]) => `<tr><td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:500">${k}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:16px;font-weight:700">${v}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;color:${ok ? "#10b981" : "#f59e0b"}">${ok ? "\u2713 On target" : "\u26A0 Action needed"}</td></tr>`).join("");
    dl(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Monthly KPI Report \u2014 ${rd}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#0a1628}.header{border-bottom:2px solid #0ea5e9;padding-bottom:20px;margin-bottom:28px}.logo{font-size:14px;font-weight:700;color:#0ea5e9}h1{font-size:24px;font-weight:700;margin:12px 0 4px}.sub{color:#475569;font-size:13px}.score{display:inline-block;padding:16px 24px;border-radius:12px;background:#f0fdf4;border:1px solid #a7f3d0;margin:20px 0;font-size:40px;font-weight:700;color:${readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444"}}table{width:100%;border-collapse:collapse;margin:20px 0}thead tr{background:#0a1f38}th{padding:10px 12px;text-align:left;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;border:1px solid #1e3a5a}.footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:10px;color:#94a3b8}</style></head><body><div class="header"><div class="logo">${org}</div><h1>Monthly Quality KPI Report</h1><p class="sub">Period: ${rd} \u00b7 Generated: ${dayjs().format("DD MMM YYYY HH:mm")} UTC</p></div><p style="font-size:11px;color:#94a3b8;text-transform:uppercase">Overall readiness score</p><p class="score">${readinessScore}%</p><table><thead><tr><th>KPI</th><th>Value</th><th>Assessment</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated by ${org} \u00b7 Prepared by: ${ownerName(user?.id ?? "")}</div></body></html>`, `Monthly-KPI-Report-${dayjs().format("YYYY-MM")}.html`);
  }

  function exportRAID() {
    const rows = raidItems.map((r, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}"><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:11px">${r.id.slice(0, 8).toUpperCase()}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${r.type}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:500">${r.title}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${r.priority}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${r.status}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${ownerName(r.owner)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${dayjs.utc(r.dueDate).format(dateFormat)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px">${r.resolution || r.mitigation || r.impact || "\u2014"}</td></tr>`).join("");
    dl(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>RAID Log Export</title><style>body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#0a1628}h1{font-size:22px;font-weight:700;margin-bottom:4px}.meta{color:#475569;font-size:12px;margin-bottom:20px}table{width:100%;border-collapse:collapse}thead tr{background:#0a1f38}th{padding:9px 12px;text-align:left;color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;border:1px solid #1e3a5a}.footer{margin-top:24px;font-size:10px;color:#94a3b8}</style></head><body><h1>RAID Log Export</h1><p class="meta">${raidItems.length} items \u00b7 Generated: ${dayjs().format("DD MMM YYYY HH:mm")} UTC \u00b7 ${companyName || "Pharma Glimmora"}</p><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Priority</th><th>Status</th><th>Owner</th><th>Due date</th><th>Resolution / Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">No RAID items</td></tr>'}</tbody></table><div class="footer">Exported by: ${ownerName(user?.id ?? "")}</div></body></html>`, `RAID-Log-${dayjs().format("YYYY-MM-DD")}.html`);
  }

  function exportReadiness() {
    const siteRows = sites.map((site) => { const sr = siteReadiness.find((s) => s.site.id === site.id)!; const col = sr.score >= 80 ? "#10b981" : sr.score >= 60 ? "#f59e0b" : "#ef4444"; return `<tr><td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:500">${site.name}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${site.risk}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:18px;font-weight:700;color:${col}">${sr.score}%</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.findingsCount}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.capasCount}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.criticalCount}</td></tr>`; }).join("");
    dl(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Inspection Readiness Pack</title><style>body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#0a1628}.header{border-bottom:2px solid #10b981;padding-bottom:16px;margin-bottom:24px}.logo{font-size:13px;font-weight:700;color:#10b981}h1{font-size:22px;font-weight:700;margin:10px 0 4px}.score-big{font-size:48px;font-weight:700;color:${readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444"}}table{width:100%;border-collapse:collapse;margin:20px 0}thead tr{background:#0a1f38}th{padding:9px 12px;text-align:left;color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;border:1px solid #1e3a5a}</style></head><body><div class="header"><div class="logo">${companyName || "Pharma Glimmora"}</div><h1>Inspection Readiness Pack</h1><p style="color:#475569;font-size:12px">Generated: ${dayjs().format("DD MMM YYYY HH:mm")} UTC \u00b7 Prepared by: ${ownerName(user?.id ?? "")}</p></div><p style="font-size:12px;color:#475569;margin-bottom:8px">Overall readiness score</p><p class="score-big">${readinessScore}%</p><table style="margin-top:28px"><thead><tr><th>Site</th><th>Risk</th><th>Readiness</th><th>Open findings</th><th>Open CAPAs</th><th>Critical</th></tr></thead><tbody>${siteRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">No sites configured</td></tr>'}</tbody></table></body></html>`, `Inspection-Readiness-Pack-${dayjs().format("YYYY-MM-DD")}.html`);
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Governance and KPIs command center" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div><h1 className="page-title">Governance &amp; KPIs</h1><p className="page-subtitle mt-1">{sites.length} sites &middot; {capas.length} CAPAs &middot; {findings.length} findings &middot; {raidItems.length} RAID items</p></div>
        <div className={clsx("flex items-center gap-2 px-4 py-2 rounded-xl border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Readiness</span><span className="text-[20px] font-bold" style={{ color: noData ? "var(--text-muted)" : readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444" }}>{noData ? "\u2014" : `${readinessScore}%`}</span></div>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Governance sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (<button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActiveTab(t.id)} className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}><t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}</button>))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id="panel-kpis" aria-labelledby="tab-kpis" tabIndex={0} hidden={activeTab !== "kpis"}>
        <KPIScorecardTab companyName={companyName} readinessScore={readinessScore} noData={noData} capaTimeliness={capaTimeliness} closedCAPAsCount={closedCAPAs.length} overdueCommitments={overdueCommitments} repeatObservationRisk={repeatObservationRisk} diExceptions={diExceptions} auditTrailCoverage={auditTrailCoverage} csvDrift={csvDrift} systemsCount={systems.length} capaTrend={capaTrend} capaTrendEmpty={capaTrendEmpty} valBreakdown={valBreakdown} diByArea={diByArea} siteReadiness={siteReadiness} sites={sites} isDark={isDark} currentMonth={dayjs().format("MMMM YYYY")} onNavigateSettings={() => navigate("/settings")} />
      </div>

      <div role="tabpanel" id="panel-raid" aria-labelledby="tab-raid" tabIndex={0} hidden={activeTab !== "raid"}>
        <RAIDTab raidItems={raidItems} filteredRaid={filteredRaid} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} anyRaidFilter={anyRaidFilter} role={role} timezone={timezone} dateFormat={dateFormat} ownerName={ownerName} onAddRaidOpen={() => setAddRaidOpen(true)} onCloseRaid={(item) => { setSelectedRaid(item); setCloseResolution(""); setCloseRaidOpen(true); }} />
      </div>

      <div role="tabpanel" id="panel-reports" aria-labelledby="tab-reports" tabIndex={0} hidden={activeTab !== "reports"}>
        <ReportsTab raidItemsCount={raidItems.length} openRaidCount={raidItems.filter((r) => r.status !== "Closed").length} readinessScore={readinessScore} sitesCount={sites.length} noData={noData} exportMonthly={exportMonthly} exportRAID={exportRAID} exportReadiness={exportReadiness} />
      </div>

      {/* Add RAID Modal */}
      <Modal open={addRaidOpen} onClose={() => setAddRaidOpen(false)} title="Add RAID item">
        <form onSubmit={raidForm.handleSubmit(onRaidSave)} noValidate className="space-y-4"><div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Type *</label><Controller name="type" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={["Risk", "Action", "Issue", "Decision"].map((t) => ({ value: t, label: t }))} />} /></div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Priority *</label><Controller name="priority" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={["Critical", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }))} />} /></div>
          <div className="col-span-2"><label htmlFor="raid-title" className={lbl} style={{ color: "var(--text-muted)" }}>Title *</label><input id="raid-title" className="input text-[12px]" placeholder="e.g. LIMS validation overdue" {...raidForm.register("title")} />{raidForm.formState.errors.title && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{raidForm.formState.errors.title.message}</p>}</div>
          <div className="col-span-2"><label htmlFor="raid-desc" className={lbl} style={{ color: "var(--text-muted)" }}>Description *</label><textarea id="raid-desc" rows={2} className="input text-[12px] resize-none" {...raidForm.register("description")} />{raidForm.formState.errors.description && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{raidForm.formState.errors.description.message}</p>}</div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Owner *</label><Controller name="owner" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} /></div>
          <div><label htmlFor="raid-due" className={lbl} style={{ color: "var(--text-muted)" }}>Due date *</label><input id="raid-due" type="date" className="input text-[12px]" {...raidForm.register("dueDate")} /></div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Status</label><Controller name="status" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={["Open", "In Progress", "Escalated"].map((s) => ({ value: s, label: s }))} />} /></div>
          <div className="col-span-2"><label htmlFor="raid-impact" className={lbl} style={{ color: "var(--text-muted)" }}>Impact (optional)</label><input id="raid-impact" className="input text-[12px]" placeholder="Business or compliance impact" {...raidForm.register("impact")} /></div>
          <div className="col-span-2"><label htmlFor="raid-mitig" className={lbl} style={{ color: "var(--text-muted)" }}>Mitigation (optional)</label><input id="raid-mitig" className="input text-[12px]" placeholder="How is this being mitigated?" {...raidForm.register("mitigation")} /></div>
        </div><div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => setAddRaidOpen(false)}>Cancel</Button><Button variant="primary" type="submit" loading={raidForm.formState.isSubmitting}>Add item</Button></div></form>
      </Modal>

      {/* Close RAID Modal */}
      <Modal open={closeRaidOpen} onClose={() => { setCloseRaidOpen(false); setSelectedRaid(null); }} title="Close RAID item">
        {selectedRaid && (<><div className={clsx("rounded-lg p-3 mb-4", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}><div className="flex items-center gap-2 mb-1">{raidTypeBadge(selectedRaid.type)}{priorityBadge(selectedRaid.priority)}</div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{selectedRaid.title}</p></div><label htmlFor="raid-resolution" className={lbl} style={{ color: "var(--text-muted)" }}>Resolution *</label><textarea id="raid-resolution" rows={3} className="input text-[12px] resize-none" placeholder="Describe how this was resolved..." value={closeResolution} onChange={(e) => setCloseResolution(e.target.value)} /><div className="flex justify-end gap-2 mt-4"><Button variant="ghost" type="button" onClick={() => { setCloseRaidOpen(false); setSelectedRaid(null); }}>Cancel</Button><Button variant="primary" disabled={!closeResolution.trim()} onClick={handleCloseRaid}>Close item</Button></div></>)}
      </Modal>

      {/* Popups */}
      <Popup isOpen={raidAddedPopup} variant="success" title="RAID item added" description="Added to the governance log." onDismiss={() => setRaidAddedPopup(false)} />
      <Popup isOpen={raidClosedPopup} variant="success" title="RAID item closed" description="Resolution recorded." onDismiss={() => setRaidClosedPopup(false)} />
    </main>
  );
}
