import { useState } from "react";
import {
  ClipboardCheck, Plus, Search, ChevronRight, X, Link2, Pencil,
  AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, FileText,
  ShieldCheck, Send, Shield,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import type { CAPA, CAPARisk, CAPAStatus } from "@/store/capa.slice";
import type { AuthUser } from "@/store/auth.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

/* ── Helpers ── */
const RISK_VARIANT: Record<CAPARisk, "red" | "amber" | "gray"> = { Critical: "red", Major: "amber", Minor: "gray" };
const STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green"> = { Open: "blue", "In Progress": "amber", "Pending QA Review": "purple", Closed: "green" };
function riskBadge(r: CAPARisk) { return <Badge variant={RISK_VARIANT[r]}>{r}</Badge>; }
function capaStatusBadge(s: CAPAStatus) { return <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>; }
function ownerName(uid: string, users: UserConfig[]) { return users.find((u) => u.id === uid)?.name ?? uid; }
function riskLevel(r: CAPARisk): string { return r === "Critical" ? "High" : r === "Major" ? "Medium" : "Low"; }
function riskVariant(r: CAPARisk): "red" | "amber" | "green" { return r === "Critical" ? "red" : r === "Major" ? "amber" : "green"; }

interface SiteOption {
  id: string;
  name: string;
}

interface CAPATrackerTabProps {
  capas: CAPA[];
  filteredCAPAs: CAPA[];
  selectedCAPA: CAPA | null;
  onSelectCAPA: (c: CAPA | null) => void;
  isDark: boolean;
  isViewOnly: boolean;
  users: UserConfig[];
  user: AuthUser | null;
  sites: SiteOption[];
  timezone: string;
  dateFormat: string;
  canSign: boolean;
  canCloseCapa: boolean;
  onAddOpen: () => void;
  onEditOpen: () => void;
  onSignOpen: () => void;
  onSubmitForReview: (id: string) => void;
  onStatusUpdate: (id: string, status: CAPAStatus) => void;
  onNavigateGap: (findingId: string) => void;
  onNavigateCapa: () => void;
}

export function CAPATrackerTab({
  capas, filteredCAPAs, selectedCAPA, onSelectCAPA,
  isDark, isViewOnly, users, user, sites, timezone, dateFormat,
  canSign, canCloseCapa,
  onAddOpen, onEditOpen, onSignOpen, onSubmitForReview,
  onStatusUpdate, onNavigateGap, onNavigateCapa,
}: CAPATrackerTabProps) {
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const anyFilterActive = !!(search || siteFilter || statusFilter || riskFilter || sourceFilter);
  function clearFilters() { setSearch(""); setSiteFilter(""); setStatusFilter(""); setRiskFilter(""); setSourceFilter(""); }

  const displayed = filteredCAPAs.filter((c) => {
    if (siteFilter && c.siteId !== siteFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    if (riskFilter && c.risk !== riskFilter) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (search && !c.id.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div role="tabpanel" id="panel-tracker" aria-labelledby="tab-tracker" tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search CAPAs..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search CAPAs" />
        </div>
        <Dropdown placeholder="All sites" value={siteFilter} onChange={setSiteFilter} width="w-40" options={[{ value: "", label: "All sites" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, { value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Pending QA Review", label: "Pending QA Review" }, { value: "Closed", label: "Closed" }]} />
        <Dropdown placeholder="All risks" value={riskFilter} onChange={setRiskFilter} width="w-32" options={[{ value: "", label: "All risks" }, { value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />
        <Dropdown placeholder="All sources" value={sourceFilter} onChange={setSourceFilter} width="w-40" options={[{ value: "", label: "All sources" }, { value: "483", label: "483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />
        {anyFilterActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
        {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} onClick={onAddOpen}>New CAPA</Button>}
      </div>

      {/* Table — always full width */}
      <div className="overflow-x-auto">
        {displayed.length === 0 ? (
          <div className="card p-8 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
            {capas.length === 0 ? (
              <>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No CAPAs raised yet</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>CAPAs are raised from Gap Assessment findings, or you can create one manually.</p>
                <div className="flex gap-3 justify-center mt-3">
                  {!isViewOnly && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Create CAPA</Button>}
                  <Button variant="ghost" onClick={onNavigateCapa}>Go to Gap Assessment</Button>
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
              {displayed.map((c) => (
                <tr key={c.id} onClick={() => onSelectCAPA(c)} className="cursor-pointer" aria-selected={selectedCAPA?.id === c.id}
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

      {/* ── CAPA detail popup ── */}
      <Modal open={!!selectedCAPA} onClose={() => onSelectCAPA(null)} title={selectedCAPA?.id ?? "CAPA Detail"}>
        {selectedCAPA && (
          <div className="space-y-4">
            {/* Header actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2 flex-wrap">{capaStatusBadge(selectedCAPA.status)}{riskBadge(selectedCAPA.risk)}</div>
              {!isViewOnly && selectedCAPA.status !== "Closed" && (
                <Button variant="ghost" size="xs" icon={Pencil} aria-label={`Edit ${selectedCAPA.id}`} onClick={onEditOpen} />
              )}
            </div>

            {/* Description */}
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Description</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedCAPA.description}</p>
            </div>

            {/* Risk-based classification */}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Source</p>
                <Badge variant="gray">{selectedCAPA.source}</Badge>
              </div>
              {selectedCAPA.findingId && (
                <div>
                  <p className="text-[11px] mb-1" style={{ color: "var(--text-muted)" }}>Linked finding</p>
                  <button type="button" onClick={() => onNavigateGap(selectedCAPA.findingId!)} className="flex items-center gap-1.5 text-[12px] text-[#0ea5e9] hover:underline bg-transparent border-none cursor-pointer p-0">
                    <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{selectedCAPA.findingId}
                  </button>
                </div>
              )}
            </div>

            {/* RCA */}
            <section aria-labelledby="rca-heading">
              <h3 id="rca-heading" className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Root cause analysis</h3>
              {selectedCAPA.rcaMethod && <div className="flex items-center gap-2 mb-2"><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Method:</span><Badge variant="purple">{selectedCAPA.rcaMethod}</Badge></div>}
              {selectedCAPA.rca ? (
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedCAPA.rca}</p>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: isDark ? "rgba(245,158,11,0.06)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.2)" : "1px solid #fde68a" }}>
                  <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" aria-hidden="true" />
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
            <div className="grid grid-cols-3 gap-3">
              {[{ label: "Owner", value: ownerName(selectedCAPA.owner, users) }, { label: "Due", value: dayjs.utc(selectedCAPA.dueDate).tz(timezone).format(dateFormat) }, ...(selectedCAPA.createdAt ? [{ label: "Created", value: dayjs.utc(selectedCAPA.createdAt).fromNow() }] : [])].map((r) => (
                <div key={r.label}>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                  <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.value}</p>
                </div>
              ))}
            </div>

            {/* Submit for QA */}
            {(selectedCAPA.status === "Open" || selectedCAPA.status === "In Progress") && (user?.id === selectedCAPA.owner || canCloseCapa) && (
              (selectedCAPA.rca?.trim().length ?? 0) > 0 ? (
                <Button variant="secondary" icon={Send} fullWidth onClick={() => onSubmitForReview(selectedCAPA.id)}>Submit for QA review</Button>
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
              <Button variant="primary" icon={ShieldCheck} fullWidth onClick={onSignOpen}>Sign &amp; Close CAPA</Button>
            )}

            {/* Status update */}
            {!isViewOnly && selectedCAPA.status !== "Closed" && selectedCAPA.status !== "Pending QA Review" && (
              <div>
                <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>Update status</p>
                <Dropdown value={selectedCAPA.status} onChange={(val) => onStatusUpdate(selectedCAPA.id, val as CAPAStatus)}
                  width="w-full" options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }]} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
