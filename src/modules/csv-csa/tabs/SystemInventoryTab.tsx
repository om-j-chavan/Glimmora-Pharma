import clsx from "clsx";
import {
  Database, AlertTriangle, Clock, ShieldAlert, Filter, Search, Plus,
  ChevronRight, Pencil, Trash2,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem, ValidationStatus, ComplianceStatus, RiskLevel, GAMP5Category, GxPRelevance, SystemType } from "@/store/systems.slice";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers (pure, no Redux) ── */

const SYSTEM_TYPES: SystemType[] = ["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"];

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

import { FlaskConical, BarChart2, Activity, ClipboardCheck, Cpu, Factory, Wrench, Server } from "lucide-react";

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

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function getValidationProgress(sys: GxPSystem): number {
  const stages = sys.validationStages ?? [];
  if (stages.length === 0) return sys.validationStatus === "Validated" ? 100 : 0;
  const skipped = stages.filter((s) => s.status === "skipped").length;
  const completed = stages.filter((s) => s.status === "complete").length;
  const denominator = stages.length - skipped;
  return denominator > 0 ? Math.round((completed / denominator) * 100) : 0;
}

function isReviewOverdue(sys: GxPSystem): boolean {
  return !!sys.nextReview && dayjs.utc(sys.nextReview).isBefore(dayjs());
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

/* ── Props ── */

export interface SystemInventoryTabProps {
  systems: GxPSystem[];
  filteredSystems: GxPSystem[];
  highRisk: number;
  valOverdue: number;
  nonCompliant: number;
  sites: SiteConfig[];
  users: UserConfig[];
  timezone: string;
  dateFormat: string;  showPart11: boolean;
  showAnnex11: boolean;
  showGAMP5: boolean;
  isViewOnly: boolean;
  role: string;
  siteFilter: string;
  typeFilter: string;
  riskFilter: string;
  valFilter: string;
  searchQ: string;
  anyFilter: boolean;
  onSiteFilterChange: (v: string) => void;
  onTypeFilterChange: (v: string) => void;
  onRiskFilterChange: (v: string) => void;
  onValFilterChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onClearFilters: () => void;
  onAddOpen: () => void;
  onSelectSystem: (sys: GxPSystem) => void;
  onEditSystem: (sys: GxPSystem) => void;
  onRemoveSystem: (id: string) => void;
}

export function SystemInventoryTab({
  systems, filteredSystems, highRisk, valOverdue, nonCompliant,
  sites, users, timezone, dateFormat,
  showPart11, showAnnex11, showGAMP5,
  isViewOnly, role,
  siteFilter, typeFilter, riskFilter, valFilter, searchQ, anyFilter,
  onSiteFilterChange, onTypeFilterChange, onRiskFilterChange, onValFilterChange, onSearchChange, onClearFilters,
  onAddOpen, onSelectSystem, onEditSystem, onRemoveSystem,
}: SystemInventoryTabProps) {
  return (
    <>
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
      <section aria-label="System filters" className={clsx("flex items-center gap-3 flex-wrap mb-4 p-4 rounded-xl border", "bg-(--bg-elevated) border-(--bg-border)")}>
        <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Filters</span>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={onSiteFilterChange} width="w-36" options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All types" value={typeFilter} onChange={onTypeFilterChange} width="w-32" options={[{ value: "", label: "All types" }, ...SYSTEM_TYPES.map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All risks" value={riskFilter} onChange={onRiskFilterChange} width="w-32" options={[{ value: "", label: "All risks" }, { value: "HIGH", label: "HIGH" }, { value: "MEDIUM", label: "MEDIUM" }, { value: "LOW", label: "LOW" }]} />
        <Dropdown placeholder="All statuses" value={valFilter} onChange={onValFilterChange} width="w-36" options={[{ value: "", label: "All statuses" }, { value: "Validated", label: "Validated" }, { value: "In Progress", label: "In Progress" }, { value: "Overdue", label: "Overdue" }, { value: "Not Started", label: "Not Started" }]} />
        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search systems..." value={searchQ} onChange={(e) => onSearchChange(e.target.value)} aria-label="Search systems" />
        </div>
        {anyFilter && <Button variant="ghost" size="sm" onClick={onClearFilters}>Clear</Button>}
      </section>

      {/* Table */}
      {systems.length === 0 ? (
        <div className="card p-10 text-center">
          <Database className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No systems registered yet</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Add your GxP computerised systems to track validation status and compliance.</p>
          {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} className="mt-3" onClick={onAddOpen}>Add first system</Button>}
        </div>
      ) : filteredSystems.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No systems match the current filters</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={onClearFilters}>Clear filters</Button>
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
                  <th scope="col">Progress</th>
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
                  <tr key={sys.id} onClick={() => onSelectSystem(sys)} className="cursor-pointer">
                    <th scope="row">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: si.color + "18" }}>
                          <si.icon className="w-3.5 h-3.5" style={{ color: si.color }} aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-[12px]" style={{ color: "var(--text-primary)" }}>{sys.name}</span>
                            {isReviewOverdue(sys) && <Badge variant="red">Review overdue</Badge>}
                          </div>
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{sys.vendor} v{sys.version}</div>
                        </div>
                      </div>
                    </th>
                    <td><Badge variant="gray">{sys.type}</Badge></td>
                    <td>{relevanceBadge(sys.gxpRelevance)}</td>
                    <td>{riskBadge(sys.riskLevel)}</td>
                    <td>{validationBadge(sys.validationStatus)}</td>
                    <td>
                      {(() => {
                        const pct = getValidationProgress(sys);
                        const col = pct >= 100 ? "#10b981" : pct >= 50 ? "#f59e0b" : pct > 0 ? "#ef4444" : "#64748b";
                        return (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums" style={{ color: col }}>{pct}%</span>
                          </div>
                        );
                      })()}
                    </td>
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
                          <Button variant="ghost" size="xs" icon={Pencil} aria-label={`Edit ${sys.name}`} onClick={() => onEditSystem(sys)} />
                          <Button variant="ghost" size="xs" icon={Trash2} aria-label={`Remove ${sys.name}`} onClick={() => onRemoveSystem(sys.id)} />
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
    </>
  );
}
