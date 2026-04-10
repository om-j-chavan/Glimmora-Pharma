import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Bot, BookOpen, Shield, Activity, Settings, AlertTriangle, Plus,
  ClipboardCheck, Search, Database, FileWarning, FolderOpen, TrendingUp,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { addAlert, resolveAlert, type DriftAlert, type DriftSeverity, type DriftStatus, type DriftType } from "@/store/agiDrift.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";

import { AGIOverviewTab } from "./tabs/AGIOverviewTab";
import { IntendedUseTab } from "./tabs/IntendedUseTab";
import { OversightTab } from "./tabs/OversightTab";
import { DriftMonitoringTab } from "./tabs/DriftMonitoringTab";

/* ── Types & constants ── */

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const AGENT_ICONS: Record<string, LucideIcon> = { capa: ClipboardCheck, gap: Search, csv: Database, fda483: FileWarning, evidence: FolderOpen, riskScore: TrendingUp, driftDetect: Activity };

type TabId = "overview" | "intended" | "oversight" | "drift";
const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: "overview", label: "AGI Overview", Icon: Bot },
  { id: "intended", label: "Intended Use", Icon: BookOpen },
  { id: "oversight", label: "Human Oversight", Icon: Shield },
  { id: "drift", label: "Drift & Monitoring", Icon: Activity },
];

const alertSchema = z.object({
  type: z.enum(["Configuration Change", "Access Creep", "Audit Trail Anomaly", "Validation Drift", "Model Performance", "Data Quality"]),
  severity: z.enum(["Critical", "Major", "Minor"]),
  description: z.string().min(5, "Description required"),
  agent: z.string().min(1, "Agent required"),
  owner: z.string().min(1, "Owner required"),
});
type AlertForm = z.infer<typeof alertSchema>;

/* ══════════════════════════════════════ */

export function AGIPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const agiSettings = useAppSelector((s) => s.settings.agi);
  const { driftAlerts, driftMetrics, capas, findings, systems, fda483Events, tenantId } = useTenantData();
  const { org, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  const activeAgents = Object.entries(agiSettings.agents).filter(([, v]) => v).map(([k]) => k);
  const isManualMode = agiSettings.mode === "manual";
  const isAutoMode = agiSettings.mode === "autonomous";
  const openAlerts = driftAlerts.filter((a) => a.status !== "Resolved");
  const insightsGenerated = findings.length + capas.length + fda483Events.length;
  const actionsTriggered = isAutoMode ? capas.filter((c) => c.source === "Gap Assessment").length : 0;
  const hitlApprovals = capas.filter((c) => c.status === "Pending QA Review" || c.status === "Closed").length;

  const capabilities = [
    { key: "monitoring", title: "Compliance Monitoring", icon: Activity, color: "#0ea5e9", agent: "capa" as const, desc: "CAPA aging, overdue actions, training delinquency, audit commitments, DI exception patterns.", live: capas.filter((c) => c.status !== "Closed").length, liveLabel: "open CAPAs monitored" },
    { key: "riskPriority", title: "Risk Prioritization", icon: TrendingUp, color: "#6366f1", agent: "riskScore" as const, desc: "ICH Q9-aligned scoring. Patient safety, product quality, DI impact, inspection proximity.", live: findings.filter((f) => f.severity === "Critical" && f.status !== "Closed").length, liveLabel: "critical findings in queue" },
    { key: "readiness", title: "Readiness Orchestration", icon: Activity, color: "#10b981", agent: "evidence" as const, desc: "Evidence kit completeness checks, DIL drill simulation, SME readiness mapping.", live: systems.filter((s) => s.validationStatus === "Overdue").length, liveLabel: "overdue validations flagged" },
    { key: "drift", title: "Drift Detection", icon: Activity, color: "#ef4444", agent: "driftDetect" as const, desc: "Configuration changes, access creep, audit trail anomalies, validation drift signals.", live: openAlerts.length, liveLabel: "drift signals detected" },
  ].map((cap) => ({ ...cap, isOn: !isManualMode && agiSettings.agents[cap.agent as keyof typeof agiSettings.agents] }));

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [addAlertOpen, setAddAlertOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<DriftAlert | null>(null);
  const [resolveAction, setResolveAction] = useState("");
  const [alertAddedPopup, setAlertAddedPopup] = useState(false);
  const [resolvedPopup, setResolvedPopup] = useState(false);

  const alertForm = useForm<AlertForm>({ resolver: zodResolver(alertSchema), defaultValues: { severity: "Major", type: "Configuration Change" } });

  function onAlertSave(data: AlertForm) {
    const id = crypto.randomUUID();
    dispatch(addAlert({ ...data, id, tenantId: tenantId ?? "", detectedAt: dayjs().toISOString(), status: "Open" }));
    auditLog({ action: "AGI_DRIFT_ALERT_ADDED", module: "agi-console", recordId: id, newValue: data });
    setAddAlertOpen(false); setAlertAddedPopup(true); alertForm.reset();
  }

  function handleResolve() {
    if (!selectedAlert || !resolveAction.trim()) return;
    dispatch(resolveAlert({ id: selectedAlert.id, action: resolveAction.trim(), resolvedAt: dayjs().toISOString() }));
    auditLog({ action: "AGI_DRIFT_ALERT_RESOLVED", module: "agi-console", recordId: selectedAlert.id, newValue: { action: resolveAction } });
    setResolveOpen(false); setSelectedAlert(null); setResolveAction(""); setResolvedPopup(true);
  }

  function driftSevBadge(s: DriftSeverity) { return <Badge variant={s === "Critical" ? "red" : s === "Major" ? "amber" : "gray"}>{s}</Badge>; }

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Glimmora AGI and Autonomy Console" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">AGI &amp; Autonomy Console</h1>
          <p className="page-subtitle mt-1">{activeAgents.length} agents active &middot; {agiSettings.mode} mode &middot; {openAlerts.length} drift alerts</p>
        </div>
        <div className="flex items-center gap-2">
          {isManualMode ? <Badge variant="gray">Manual mode</Badge> : isAutoMode ? <Badge variant="green">Autonomous mode</Badge> : <Badge variant="blue">Assisted mode</Badge>}
          <Button variant="ghost" size="sm" icon={Settings} onClick={() => navigate("/settings")}>AGI settings</Button>
        </div>
      </header>

      {/* Manual mode banner */}
      {isManualMode && (
        <div className={clsx("flex items-start gap-3 p-4 rounded-xl border", isDark ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.15)]" : "bg-[#fffbeb] border-[#fde68a]")} role="status">
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1"><p className="text-[13px] font-medium text-[#f59e0b]">AGI is in manual mode</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>All AGI capabilities are disabled. Enable agents in Settings &rarr; AGI Policy to activate intelligence features.</p></div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>Configure</Button>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="AGI Console sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActiveTab(t.id)}
            className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" tabIndex={0} hidden={activeTab !== "overview"}>
        <AGIOverviewTab isManualMode={isManualMode} isAutoMode={isAutoMode} insightsGenerated={insightsGenerated} actionsTriggered={actionsTriggered} hitlApprovals={hitlApprovals} openAlertsCount={openAlerts.length} capabilities={capabilities} isDark={isDark} onNavigateSettings={() => navigate("/settings")} />
      </div>

      <div role="tabpanel" id="panel-intended" aria-labelledby="tab-intended" tabIndex={0} hidden={activeTab !== "intended"}>
        <IntendedUseTab isManualMode={isManualMode} agiAgents={agiSettings.agents} confidence={agiSettings.confidence} onNavigateSettings={() => navigate("/settings")} />
      </div>

      <div role="tabpanel" id="panel-oversight" aria-labelledby="tab-oversight" tabIndex={0} hidden={activeTab !== "oversight"}>
        <OversightTab pendingReviewCount={capas.filter((c) => c.status === "Pending QA Review").length} approvedCount={capas.filter((c) => c.status === "Closed").length} agiAssistedCount={capas.filter((c) => c.source === "Gap Assessment").length} closedCAPAs={capas.filter((c) => c.status === "Closed")} isDark={isDark} ownerName={ownerName} />
      </div>

      <div role="tabpanel" id="panel-drift" aria-labelledby="tab-drift" tabIndex={0} hidden={activeTab !== "drift"}>
        <DriftMonitoringTab driftAlerts={driftAlerts} openAlertsCount={openAlerts.length} driftMetrics={driftMetrics} role={role} timezone={timezone} dateFormat={dateFormat} ownerName={ownerName} onAddAlertOpen={() => setAddAlertOpen(true)} onResolveAlert={(a) => { setSelectedAlert(a); setResolveAction(""); setResolveOpen(true); }} />
      </div>

      {/* Log Alert Modal */}
      <Modal open={addAlertOpen} onClose={() => setAddAlertOpen(false)} title="Log drift alert">
        <form onSubmit={alertForm.handleSubmit(onAlertSave)} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Drift type *</label><Controller name="type" control={alertForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={(["Configuration Change", "Access Creep", "Audit Trail Anomaly", "Validation Drift", "Model Performance", "Data Quality"] as DriftType[]).map((t) => ({ value: t, label: t }))} />} /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Severity *</label><Controller name="severity" control={alertForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />} /></div>
            <div><label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Agent *</label><Controller name="agent" control={alertForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select agent" width="w-full" options={Object.entries(AGENT_ICONS).map(([k]) => ({ value: k, label: k }))} />} /></div>
            <div className="col-span-2"><label htmlFor="alert-desc" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Description *</label><textarea id="alert-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the drift event..." {...alertForm.register("description")} />{alertForm.formState.errors.description && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{alertForm.formState.errors.description.message}</p>}</div>
            <div className="col-span-2"><label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Owner *</label><Controller name="owner" control={alertForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => setAddAlertOpen(false)}>Cancel</Button><Button variant="primary" type="submit" loading={alertForm.formState.isSubmitting}>Log alert</Button></div>
        </form>
      </Modal>

      {/* Resolve Alert Modal */}
      <Modal open={resolveOpen} onClose={() => { setResolveOpen(false); setSelectedAlert(null); }} title="Resolve drift alert">
        {selectedAlert && (
          <>
            <div className={clsx("rounded-lg p-3 mb-4", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")}>
              <div className="flex items-center gap-2 flex-wrap mb-1">{driftSevBadge(selectedAlert.severity)}<Badge variant="gray">{selectedAlert.type}</Badge></div>
              <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>{selectedAlert.description}</p>
            </div>
            <label htmlFor="resolve-action" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Action taken *</label>
            <textarea id="resolve-action" rows={3} className="input text-[12px] resize-none" placeholder="Describe the corrective action taken..." value={resolveAction} onChange={(e) => setResolveAction(e.target.value)} />
            <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" type="button" onClick={() => { setResolveOpen(false); setSelectedAlert(null); }}>Cancel</Button><Button variant="primary" disabled={!resolveAction.trim()} onClick={handleResolve}>Resolve alert</Button></div>
          </>
        )}
      </Modal>

      {/* Popups */}
      <Popup isOpen={alertAddedPopup} variant="success" title="Drift alert logged" description="Alert added to the monitoring board." onDismiss={() => setAlertAddedPopup(false)} />
      <Popup isOpen={resolvedPopup} variant="success" title="Alert resolved" description="Drift alert marked as resolved with action documented." onDismiss={() => setResolvedPopup(false)} />
    </main>
  );
}
