import clsx from "clsx";
import { Server, Pencil, X } from "lucide-react";
import type { GxPSystem, RiskLevel, ValidationStatus, GAMP5Category, SystemType, RoadmapActivity } from "@/store/systems.slice";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import type { Finding } from "@/store/findings.slice";
import type { CAPA } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { OverviewPanel } from "@/modules/csv-csa/detail/OverviewPanel";
import { RiskControlsPanel } from "@/modules/csv-csa/detail/RiskControlsPanel";
import { ValidationPanel } from "@/modules/csv-csa/detail/ValidationPanel";
import { DIAuditPanel } from "@/modules/csv-csa/detail/DIAuditPanel";

/* ── Shared badge helpers ── */

import { FlaskConical, BarChart2, Activity, ClipboardCheck, Cpu, Factory, Wrench } from "lucide-react";

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

function riskBadge(r: RiskLevel) {
  const m: Record<RiskLevel, "red" | "amber" | "green"> = { HIGH: "red", MEDIUM: "amber", LOW: "green" };
  return <Badge variant={m[r]}>{r}</Badge>;
}

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function gampBadge(c: GAMP5Category) {
  return <Badge variant="blue">Cat {c}</Badge>;
}

/* ── Detail tab types ── */

type DetailTab = "overview" | "risk" | "validation" | "di";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "risk", label: "Risk Assessment" },
  { id: "validation", label: "Validation Lifecycle" },
  { id: "di", label: "Data Integrity" },
];

/* ── Props ── */

export interface SystemDetailTabProps {
  selectedSystem: GxPSystem | null;
  systems: GxPSystem[];
  roadmap: RoadmapActivity[];
  findings: Finding[];
  capas: CAPA[];
  sites: SiteConfig[];
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  isViewOnly: boolean;
  role: string;
  showPart11: boolean;
  showAnnex11: boolean;
  showGAMP5: boolean;
  detailTab: DetailTab;
  onDetailTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  onEdit: () => void;
  onGoToInventory: () => void;
  onNavigateSettings: () => void;
  onNavigateGap: (findingId: string) => void;
  onNavigateCapa: (capaId: string) => void;
  onSaveRemediation: (patch: { remediationTargetDate?: string; remediationNotes?: string }) => void;
  onSaveRiskFactors: (text: string) => void;
  onSavePlannedActions: (text: string) => void;
  onSaveStage: (stage: import("@/store/systems.slice").ValidationStage) => void;
  onSaveNextReview: (iso: string) => void;
  onSaveRiskClassification: (patch: import("@/modules/csv-csa/detail/RiskControlsPanel").RiskClassificationPatch) => void;
}

export function SystemDetailTab({
  selectedSystem, systems, roadmap, findings, capas,
  sites, users, timezone, dateFormat,
  isViewOnly, role, showPart11, showAnnex11, showGAMP5,
  detailTab, onDetailTabChange,
  onBack, onEdit, onGoToInventory,
  onNavigateSettings, onNavigateGap, onNavigateCapa, onSaveRemediation,
  onSaveRiskFactors, onSavePlannedActions, onSaveStage, onSaveNextReview, onSaveRiskClassification,
}: SystemDetailTabProps) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (!selectedSystem) {
    return (
      <div className="card p-10 text-center">
        <Server className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
        <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>{systems.length === 0 ? "No systems registered yet" : "Select a system from the inventory"}</p>
        <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>{systems.length === 0 ? "Add systems in the System Inventory tab to view detailed compliance information here." : "Click any row in the System Inventory tab to view its full detail here."}</p>
        <Button variant="ghost" size="sm" onClick={onGoToInventory}>Go to System Inventory</Button>
      </div>
    );
  }

  const si = getSystemIcon(selectedSystem.type);
  const systemActivities = roadmap.filter((a) => a.systemId === selectedSystem.id);

  return (
    <>
      {/* System header */}
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
            {!isViewOnly && <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>}
            <Button variant="ghost" size="sm" icon={X} aria-label="Back to inventory" onClick={onBack} />
          </div>
        </div>
      </div>

      {/* Inner tabs */}
      <div role="tablist" aria-label="System detail sections" className="flex gap-1 border-b border-(--bg-border) mb-4">
        {DETAIL_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`dtab-${t.id}`} aria-selected={detailTab === t.id} aria-controls={`dpanel-${t.id}`}
            onClick={() => onDetailTabChange(t.id)}
            className={clsx("px-3 py-2 text-[11px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", detailTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      <div role="tabpanel" id="dpanel-overview" aria-labelledby="dtab-overview" tabIndex={0} hidden={detailTab !== "overview"}>
        <OverviewPanel system={selectedSystem} sites={sites} users={users} />
      </div>

      {/* Risk & Controls */}
      <div role="tabpanel" id="dpanel-risk" aria-labelledby="dtab-risk" tabIndex={0} hidden={detailTab !== "risk"}>
        <RiskControlsPanel
          system={selectedSystem} role={role}
          showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
          onNavigateSettings={onNavigateSettings}
          onSaveRiskFactors={onSaveRiskFactors}
          onSaveRiskClassification={onSaveRiskClassification}
        />
      </div>

      {/* Validation */}
      <div role="tabpanel" id="dpanel-validation" aria-labelledby="dtab-validation" tabIndex={0} hidden={detailTab !== "validation"}>
        <ValidationPanel
          system={selectedSystem} roadmapActivities={systemActivities}
          users={users} timezone={timezone} dateFormat={dateFormat} role={role}
          onSavePlannedActions={onSavePlannedActions}
          onSaveStage={onSaveStage}
          onSaveNextReview={onSaveNextReview}
        />
      </div>

      {/* DI & Audit Trail */}
      <div role="tabpanel" id="dpanel-di" aria-labelledby="dtab-di" tabIndex={0} hidden={detailTab !== "di"}>
        <DIAuditPanel
          system={selectedSystem} findings={findings} capas={capas} role={role}
          onNavigateGap={onNavigateGap} onNavigateCapa={onNavigateCapa}
          onSaveRemediation={onSaveRemediation}
        />
      </div>
    </>
  );
}
