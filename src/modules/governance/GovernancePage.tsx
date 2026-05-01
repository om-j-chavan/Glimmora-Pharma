"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { BarChart3, AlertTriangle, Download, BarChart2, Shield } from "lucide-react";
import type { RAIDItem as PrismaRAIDItem } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { setRAIDItems, type RAIDItem, type RAIDType, type RAIDStatus, type RAIDPriority } from "@/store/raid.slice";
import {
  createRAIDItem as createRAIDAction,
  updateRAIDItem as updateRAIDAction,
  closeRAIDItem as closeRAIDAction,
  reopenRAIDItem as reopenRAIDAction,
  deleteRAIDItem as deleteRAIDAction,
} from "@/actions/raid";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";

/* ── Adapt Prisma RAIDItem → slice RAIDItem shape ── */
function adaptRAID(p: PrismaRAIDItem): RAIDItem {
  return {
    id: p.id,
    tenantId: p.tenantId,
    siteId: "",
    type: p.type as RAIDType,
    title: p.title,
    description: p.description,
    priority: p.priority as RAIDPriority,
    status: p.status as RAIDStatus,
    owner: p.owner,
    dueDate: p.dueDate ? p.dueDate.toISOString() : "",
    impact: p.impact ?? "",
    mitigation: p.mitigation ?? "",
    resolution: p.mitigation ?? "",
    raisedBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    closedAt: p.closedAt ? p.closedAt.toISOString() : undefined,
    reopenedBy: p.reopenedBy ?? undefined,
    reopenedDate: p.reopenedAt ? p.reopenedAt.toISOString() : undefined,
    reopenReason: p.reopenReason ?? undefined,
  };
}

import { KPIScorecardTab, type SiteKPI } from "./tabs/KPIScorecardTab";
import { RAIDTab } from "./tabs/RAIDTab";

// TODO: replace with /api/governance/kpis fetch once the route exists.
const MOCK_SITE_KPIS: SiteKPI[] = [];
const MOCK_SITE_TREND: { month: string; chennai: number; mumbai: number; bangalore: number; hyderabad: number }[] = [];

type TabId = "kpis" | "raid";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "kpis", label: "KPIs & Scorecards", Icon: BarChart3 },
  { id: "raid", label: "RAID & Risks", Icon: AlertTriangle },
];

const raidSchema = z.object({
  type: z.enum(["Risk", "Action", "Issue", "Decision"]),
  title: z.string().min(3, "Title required"),
  description: z.string().min(5, "Description required"),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});
type RaidForm = z.infer<typeof raidSchema>;

/* ══════════════════════════════════════ */

export interface GovernancePageProps {
  /** Lowest readiness % across active inspections — server-computed. */
  readinessScore?: number;
  /** Server-fetched RAID items (Prisma rows) — seeded into Redux on mount. */
  raidItems?: PrismaRAIDItem[];
}

export function GovernancePage({ readinessScore: readinessScoreProp, raidItems: serverRaidItems }: GovernancePageProps = {}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Seed Redux from server-fetched RAID items on mount / when props change.
  useEffect(() => {
    if (serverRaidItems) {
      dispatch(setRAIDItems(serverRaidItems.map(adaptRAID)));
    }
  }, [serverRaidItems, dispatch]);

  const { raidItems, capas, findings, systems, fda483Events: fda483 } = useTenantData();
  const { org, users, allSites } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const companyName = org.companyName;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { role } = useRole();

  // Non-admin users see only their selected site; admins see all
  const visibleSites = selectedSiteId
    ? allSites.filter((s) => s.id === selectedSiteId)
    : allSites;

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
  // Prefer server-computed score (Prisma actions completion %); fall back to
  // the legacy Redux card-based score for backward-compat during migration.
  const reduxReadinessScore = useAppSelector((s) => s.readiness.score);
  const readinessScore = readinessScoreProp ?? reduxReadinessScore;
  const noData = capas.length === 0 && findings.length === 0;

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("kpis");
  const [addRaidOpen, setAddRaidOpen] = useState(false);
  const [editingRaid, setEditingRaid] = useState<RAIDItem | null>(null);
  const [closeRaidOpen, setCloseRaidOpen] = useState(false);
  const [reopenRaidOpen, setReopenRaidOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenedPopup, setReopenedPopup] = useState(false);
  const [selectedRaid, setSelectedRaid] = useState<RAIDItem | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [raidAddedPopup, setRaidAddedPopup] = useState(false);
  const [raidClosedPopup, setRaidClosedPopup] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [reportGeneratedPopup, setReportGeneratedPopup] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportMenuOpen]);

  const anyRaidFilter = !!(typeFilter || statusFilter || priorityFilter);
  const filteredRaid = raidItems.filter((r) => {
    // Default view: hide Closed items unless explicitly filtered in
    if (!statusFilter && r.status === "Closed") return false;
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (priorityFilter && r.priority !== priorityFilter) return false;
    return true;
  });
  const raidForm = useForm<RaidForm>({ resolver: zodResolver(raidSchema), defaultValues: { type: "Risk", priority: "Medium" } });

  async function onRaidSave(data: RaidForm) {
    const payload = {
      type: data.type,
      title: data.title,
      description: data.description,
      priority: data.priority,
      owner: data.owner,
      dueDate: dayjs(data.dueDate).utc().toISOString(),
      impact: data.impact ?? "",
      mitigation: data.mitigation ?? "",
    };
    const result = editingRaid
      ? await updateRAIDAction(editingRaid.id, payload)
      : await createRAIDAction(payload);
    if (!result.success) {
      console.error("[governance] saveRaid failed:", result.error);
      return;
    }
    setEditingRaid(null);
    setAddRaidOpen(false);
    setRaidAddedPopup(true);
    raidForm.reset();
    router.refresh();
  }

  async function handleDeleteRaid(item: RAIDItem) {
    const result = await deleteRAIDAction(item.id);
    if (!result.success) {
      console.error("[governance] deleteRaid failed:", result.error);
      return;
    }
    router.refresh();
  }

  function handleEditRaid(item: RAIDItem) {
    setEditingRaid(item);
    raidForm.reset({
      type: item.type,
      title: item.title,
      description: item.description,
      priority: item.priority,
      owner: item.owner,
      dueDate: dayjs.utc(item.dueDate).format("YYYY-MM-DD"),
      impact: item.impact ?? "",
      mitigation: item.mitigation ?? "",
    });
    setAddRaidOpen(true);
  }

  async function handleCloseRaid() {
    if (!selectedRaid) return;
    const result = await closeRAIDAction(selectedRaid.id, "");
    if (!result.success) {
      console.error("[governance] closeRaid failed:", result.error);
      return;
    }
    setCloseRaidOpen(false);
    setSelectedRaid(null);
    setRaidClosedPopup(true);
    router.refresh();
  }

  async function handleReopenRaid() {
    if (!selectedRaid || !reopenReason.trim()) return;
    const result = await reopenRAIDAction(selectedRaid.id, reopenReason.trim());
    if (!result.success) {
      console.error("[governance] reopenRaid failed:", result.error);
      return;
    }
    setReopenRaidOpen(false);
    setSelectedRaid(null);
    setReopenReason("");
    setReopenedPopup(true);
    router.refresh();
  }

  /* ── Chart data ── */
  const capaTrend = (() => { const m = []; for (let i = 5; i >= 0; i--) { const mo = dayjs().subtract(i, "month"); const mc = capas.filter((c) => c.status === "Closed" && c.closedAt && dayjs.utc(c.closedAt).format("MMM YYYY") === mo.format("MMM YYYY")); const ot = mc.filter((c) => !dayjs.utc(c.closedAt).isAfter(dayjs.utc(c.dueDate))).length; m.push({ month: mo.format("MMM"), onTime: ot, late: mc.length - ot }); } return m; })();
  const capaTrendEmpty = capaTrend.every((d) => d.onTime === 0 && d.late === 0);
  const valBreakdown = [{ name: "Validated", value: systems.filter((s) => s.validationStatus === "Validated").length, color: "#10b981" }, { name: "In Progress", value: systems.filter((s) => s.validationStatus === "In Progress").length, color: "#f59e0b" }, { name: "Overdue", value: systems.filter((s) => s.validationStatus === "Overdue").length, color: "#ef4444" }, { name: "Not Started", value: systems.filter((s) => s.validationStatus === "Not Started").length, color: "#64748b" }].filter((d) => d.value > 0);
  const diByArea = (() => { return ["Manufacturing", "QC Lab", "QMS", "CSV/IT", "Warehouse", "Utilities"].map((a) => {
    const diCapas = capas.filter((c) => c.diGate && c.status !== "Closed" && findings.filter((f) => f.area === a).some((f) => f.id === c.findingId)).length;
    // For CSV/IT area, also count systems with non-compliant Part 11 or Annex 11
    const diSystems = a === "CSV/IT" ? systems.filter((s) => s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant").length : 0;
    return { area: a === "Manufacturing" ? "Mfg" : a, value: diCapas + diSystems };
  }).filter((d) => d.value > 0); })();

  /* ── Site readiness ── */
  const siteReadiness = visibleSites.map((site) => { const sf = findings.filter((f) => f.siteId === site.id && f.status !== "Closed"); const sc = capas.filter((c) => { const lf = findings.find((f) => f.id === c.findingId); return lf?.siteId === site.id && c.status !== "Closed"; }); const cr = sf.filter((f) => f.severity === "Critical").length; const sysRisk = systems.filter((s) => s.siteId === site.id && (s.part11Status === "Non-Compliant" || s.annex11Status === "Non-Compliant" || (s.riskLevel === "HIGH" && s.validationStatus !== "Validated"))).length; const score = Math.max(0, 100 - cr * 15 - sf.length * 5 - sysRisk * 25); return { site, findingsCount: sf.length, capasCount: sc.length, criticalCount: cr, score }; });

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
    const siteRows = visibleSites.map((site) => { const sr = siteReadiness.find((s) => s.site.id === site.id)!; const col = sr.score >= 80 ? "#10b981" : sr.score >= 60 ? "#f59e0b" : "#ef4444"; return `<tr><td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:500">${site.name}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${site.risk}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:18px;font-weight:700;color:${col}">${sr.score}%</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.findingsCount}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.capasCount}</td><td style="padding:10px 12px;border:1px solid #e2e8f0">${sr.criticalCount}</td></tr>`; }).join("");
    dl(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Inspection Readiness Pack</title><style>body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#0a1628}.header{border-bottom:2px solid #10b981;padding-bottom:16px;margin-bottom:24px}.logo{font-size:13px;font-weight:700;color:#10b981}h1{font-size:22px;font-weight:700;margin:10px 0 4px}.score-big{font-size:48px;font-weight:700;color:${readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444"}}table{width:100%;border-collapse:collapse;margin:20px 0}thead tr{background:#0a1f38}th{padding:9px 12px;text-align:left;color:#94a3b8;font-size:10px;font-weight:600;text-transform:uppercase;border:1px solid #1e3a5a}</style></head><body><div class="header"><div class="logo">${companyName || "Pharma Glimmora"}</div><h1>Inspection Readiness Pack</h1><p style="color:#475569;font-size:12px">Generated: ${dayjs().format("DD MMM YYYY HH:mm")} UTC \u00b7 Prepared by: ${ownerName(user?.id ?? "")}</p></div><p style="font-size:12px;color:#475569;margin-bottom:8px">Overall readiness score</p><p class="score-big">${readinessScore}%</p><table style="margin-top:28px"><thead><tr><th>Site</th><th>Risk</th><th>Readiness</th><th>Open findings</th><th>Open CAPAs</th><th>Critical</th></tr></thead><tbody>${siteRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">No sites configured</td></tr>'}</tbody></table></body></html>`, `Inspection-Readiness-Pack-${dayjs().format("YYYY-MM-DD")}.html`);
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Governance and KPIs command center" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div><h1 className="page-title">Governance &amp; KPIs</h1><p className="page-subtitle mt-1">{visibleSites.length} sites &middot; {capas.length} CAPAs &middot; {findings.length} findings &middot; {raidItems.length} RAID items</p></div>
        <div className="flex items-center gap-2">
          <div className={clsx("flex items-center gap-2 px-4 py-2 rounded-xl border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Readiness</span><span className="text-[20px] font-bold" style={{ color: noData ? "var(--text-muted)" : readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444" }}>{noData ? "\u2014" : `${readinessScore}%`}</span></div>
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
            >
              Export Reports
            </Button>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-60 rounded-lg py-1 shadow-lg"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
              >
                {[
                  { label: "Monthly Quality KPI Report", Icon: BarChart2, onClick: exportMonthly },
                  { label: "RAID Log Export", Icon: AlertTriangle, onClick: exportRAID },
                  { label: "Inspection Readiness Pack", Icon: Shield, onClick: exportReadiness },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="menuitem"
                    onClick={() => { opt.onClick(); setExportMenuOpen(false); setReportGeneratedPopup(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <opt.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Governance sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (<button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActiveTab(t.id)} className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}><t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}</button>))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id="panel-kpis" aria-labelledby="tab-kpis" tabIndex={0} hidden={activeTab !== "kpis"}>
        <KPIScorecardTab companyName={companyName} readinessScore={readinessScore} noData={noData} capaTimeliness={capaTimeliness} closedCAPAsCount={closedCAPAs.length} overdueCommitments={overdueCommitments} repeatObservationRisk={repeatObservationRisk} diExceptions={diExceptions} auditTrailCoverage={auditTrailCoverage} csvDrift={csvDrift} systemsCount={systems.length} capaTrend={capaTrend} capaTrendEmpty={capaTrendEmpty} valBreakdown={valBreakdown} diByArea={diByArea} siteReadiness={siteReadiness} sites={visibleSites} isDark={isDark} currentMonth={dayjs().format("MMMM YYYY")} onNavigateSettings={() => router.push("/settings")} siteKPIs={MOCK_SITE_KPIS} siteTrend={MOCK_SITE_TREND} />
      </div>

      <div role="tabpanel" id="panel-raid" aria-labelledby="tab-raid" tabIndex={0} hidden={activeTab !== "raid"}>
        <RAIDTab raidItems={raidItems} filteredRaid={filteredRaid} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} anyRaidFilter={anyRaidFilter} role={role} currentUserId={user?.id ?? ""} timezone={timezone} dateFormat={dateFormat} ownerName={ownerName} onAddRaidOpen={() => { setEditingRaid(null); raidForm.reset({ type: "Risk", priority: "Medium" }); setAddRaidOpen(true); }} onCloseRaid={(item) => { setSelectedRaid(item); setCloseRaidOpen(true); }} onEditRaid={handleEditRaid} onDeleteRaid={handleDeleteRaid} onReopenRaid={(item) => { setSelectedRaid(item); setReopenReason(""); setReopenRaidOpen(true); }} />
      </div>

      {/* Add RAID Modal */}
      <Modal open={addRaidOpen} onClose={() => { setAddRaidOpen(false); setEditingRaid(null); }} title={editingRaid ? "Edit RAID Entry" : "Log RAID Entry"}>
        <form onSubmit={raidForm.handleSubmit(onRaidSave)} noValidate className="space-y-4"><div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Type *</label><Controller name="type" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={["Risk", "Action", "Issue", "Decision"].map((t) => ({ value: t, label: t }))} />} /></div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Priority *</label><Controller name="priority" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={["Critical", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }))} />} /></div>
          <div className="col-span-2"><label htmlFor="raid-title" className={lbl} style={{ color: "var(--text-muted)" }}>Title *</label><input id="raid-title" className="input text-[12px]" placeholder="e.g. LIMS validation overdue" {...raidForm.register("title")} />{raidForm.formState.errors.title && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{raidForm.formState.errors.title.message}</p>}</div>
          <div className="col-span-2"><label htmlFor="raid-desc" className={lbl} style={{ color: "var(--text-muted)" }}>Description *</label><textarea id="raid-desc" rows={2} className="input text-[12px] resize-none" {...raidForm.register("description")} />{raidForm.formState.errors.description && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{raidForm.formState.errors.description.message}</p>}</div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Owner *</label><Controller name="owner" control={raidForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} /></div>
          <div><label htmlFor="raid-due" className={lbl} style={{ color: "var(--text-muted)" }}>Due date *</label><input id="raid-due" type="date" className="input text-[12px]" {...raidForm.register("dueDate")} /></div>
          <div className="col-span-2"><label htmlFor="raid-impact" className={lbl} style={{ color: "var(--text-muted)" }}>Impact (optional)</label><input id="raid-impact" className="input text-[12px]" placeholder="Business or compliance impact" {...raidForm.register("impact")} /></div>
          <div className="col-span-2"><label htmlFor="raid-mitig" className={lbl} style={{ color: "var(--text-muted)" }}>Mitigation (optional)</label><input id="raid-mitig" className="input text-[12px]" placeholder="How is this being mitigated?" {...raidForm.register("mitigation")} /></div>
        </div><div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => { setAddRaidOpen(false); setEditingRaid(null); }}>Cancel</Button><Button variant="primary" type="submit" loading={raidForm.formState.isSubmitting}>{editingRaid ? "Save changes" : "Add item"}</Button></div></form>
      </Modal>

      {/* Close RAID confirmation */}
      <Popup
        isOpen={closeRaidOpen}
        variant="confirmation"
        title="Mark this item as closed?"
        description={selectedRaid ? selectedRaid.title : ""}
        onDismiss={() => { setCloseRaidOpen(false); setSelectedRaid(null); }}
        actions={[
          { label: "Cancel", style: "ghost", onClick: () => { setCloseRaidOpen(false); setSelectedRaid(null); } },
          { label: "Confirm", style: "primary", onClick: handleCloseRaid },
        ]}
      />

      {/* Reopen RAID modal */}
      <Modal open={reopenRaidOpen} onClose={() => { setReopenRaidOpen(false); setSelectedRaid(null); setReopenReason(""); }} title="Reopen RAID item?">
        {selectedRaid && (
          <div className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{selectedRaid.title}</p>
            <div>
              <label htmlFor="raid-reopen-reason" className={lbl} style={{ color: "var(--text-muted)" }}>Reason <span aria-hidden="true">*</span></label>
              <textarea
                id="raid-reopen-reason"
                rows={3}
                className="input text-[12px] resize-none w-full"
                placeholder="Why is this being reopened?"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={() => { setReopenRaidOpen(false); setSelectedRaid(null); setReopenReason(""); }}>Cancel</Button>
              <Button variant="primary" type="button" disabled={!reopenReason.trim()} onClick={handleReopenRaid}>Reopen item</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Popups */}
      <Popup isOpen={raidAddedPopup} variant="success" title="RAID item added" description="Added to the governance log." onDismiss={() => setRaidAddedPopup(false)} />
      <Popup isOpen={raidClosedPopup} variant="success" title="RAID item closed" description="Resolution recorded." onDismiss={() => setRaidClosedPopup(false)} />
      <Popup isOpen={reopenedPopup} variant="success" title="RAID item reopened \u2705" description="The item is back in the active list." onDismiss={() => setReopenedPopup(false)} />
      <Popup isOpen={reportGeneratedPopup} variant="success" title="Report generated \u2705" description="Exported successfully." onDismiss={() => setReportGeneratedPopup(false)} />
    </main>
  );
}