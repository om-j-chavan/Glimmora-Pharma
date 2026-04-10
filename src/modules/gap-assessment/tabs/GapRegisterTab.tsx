import { useState, type ReactNode } from "react";
import {
  ClipboardList, Plus, Search, ChevronRight, Link2, Bot, AlertTriangle, Pencil,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import type { Finding, FindingSeverity, FindingStatus } from "@/store/findings.slice";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

const FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};

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

interface GapRegisterTabProps {
  filteredFindings: Finding[];
  findingsTotal: number;
  selectedFinding: Finding | null;
  onSelectFinding: (f: Finding | null) => void;
  isDark: boolean;
  isViewOnly: boolean;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  capas: CAPA[];
  agiMode: string;
  agiCapa: boolean;
  isAnyFilterActive: boolean;
  renderFilters: (compact?: boolean) => ReactNode;
  onAddOpen: () => void;
  onRaiseCapa: (finding: Finding) => void;
  onStatusUpdate: (id: string, status: FindingStatus) => void;
  onNavigateCapa: (capaId: string) => void;
}

export function GapRegisterTab({
  filteredFindings, findingsTotal, selectedFinding, onSelectFinding,
  isDark, isViewOnly, users, timezone, dateFormat, capas,
  agiMode, agiCapa, isAnyFilterActive, renderFilters,
  onAddOpen, onRaiseCapa, onStatusUpdate, onNavigateCapa,
}: GapRegisterTabProps) {
  const [searchQuery, setSearchQuery] = useState("");

  function ownerName(uid: string) { return users.find((u) => u.id === uid)?.name ?? uid; }

  const displayed = searchQuery
    ? filteredFindings.filter((f) => {
        const q = searchQuery.toLowerCase();
        return f.id.toLowerCase().includes(q) || f.area.toLowerCase().includes(q) || f.requirement.toLowerCase().includes(q);
      })
    : filteredFindings;

  return (
    <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search findings..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search findings" />
        </div>
        {renderFilters(true)}
        {!isViewOnly && <Button variant="primary" size="sm" icon={Plus} onClick={onAddOpen}>Log finding</Button>}
      </div>

      <div className={clsx("grid gap-4", selectedFinding ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1")}>
        {/* Table */}
        <div className={clsx(selectedFinding ? "lg:col-span-2" : "", "overflow-x-auto")}>
          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <ClipboardList className="w-12 h-12 text-[#334155]" aria-hidden="true" />
              {findingsTotal === 0 ? (
                <>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No findings logged yet</p>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Log your first finding to start tracking GxP compliance gaps.</p>
                  {!isViewOnly && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Log your first finding</Button>}
                </>
              ) : (
                <>
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No findings match the current filters</p>
                  {isAnyFilterActive && <Button variant="ghost" size="sm" onClick={() => {}}>Clear filters</Button>}
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
                {displayed.map((f) => (
                  <tr key={f.id} onClick={() => onSelectFinding(selectedFinding?.id === f.id ? null : f)} className="cursor-pointer" aria-selected={selectedFinding?.id === f.id}
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
              <Button variant="ghost" size="xs" aria-label="Close detail panel" onClick={() => onSelectFinding(null)}>&times;</Button>
            </div>
            <div className="card-body space-y-4 overflow-y-auto" style={{ maxHeight: 600 }}>
              <div className="flex gap-2 flex-wrap">{severityBadge(selectedFinding.severity)}{statusBadge(selectedFinding.status)}</div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Requirement</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.requirement}</p>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Area &amp; Framework</h3>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedFinding.area} &middot; {FRAMEWORK_LABELS[selectedFinding.framework] ?? selectedFinding.framework}</p>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Owner</h3>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(selectedFinding.owner)}</p>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Target date</h3>
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
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">Linked CAPA</h3>
                  {(() => {
                    const lc = capas.find((c) => c.id === selectedFinding.capaId);
                    return (
                      <>
                        <div className="flex items-center gap-2 mt-1">
                          <button type="button" onClick={() => onNavigateCapa(selectedFinding.capaId!)} className="flex items-center gap-1.5 text-[12px] text-[#0ea5e9] hover:underline bg-transparent border-none cursor-pointer p-0">
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
                  <Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button>
                )
              )}

              {/* Status update */}
              {!isViewOnly && selectedFinding.status !== "Closed" && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1.5">Update status</p>
                  <Dropdown value={selectedFinding.status} onChange={(val) => onStatusUpdate(selectedFinding.id, val as FindingStatus)}
                    options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Closed", label: "Closed" }]} width="w-full" />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
