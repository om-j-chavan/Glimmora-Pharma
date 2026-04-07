import {
  FolderOpen, ChevronDown, FileCheck, ExternalLink, Paperclip,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { UserConfig } from "@/store/settings.slice";

interface EvidenceRow {
  findingId: string;
  framework: string;
  docType: string;
  name: string;
  evidenceLink: string;
  status: "Complete" | "Partial" | "Missing";
  severity: string;
  findingStatus: string;
  owner: string;
  linkedCapa?: { id: string; status: string } | undefined;
}

interface EvidenceArea {
  area: string;
  rows: EvidenceRow[];
  status: "Complete" | "Partial" | "Missing";
}

interface GapEvidenceTabProps {
  evidenceAreas: EvidenceArea[];
  allEvidenceRows: EvidenceRow[];
  completeCount: number;
  partialCount: number;
  missingCount: number;
  expandedAreas: Set<string>;
  onToggleArea: (area: string) => void;
  isDark: boolean;
  isViewOnly: boolean;
  users: UserConfig[];
  onLinkEvidence: (findingId: string, currentLink: string) => void;
  onFindingClick: (findingId: string) => void;
  onExport: () => void;
  onGoToRegister: () => void;
}

export function GapEvidenceTab({
  evidenceAreas, allEvidenceRows, completeCount, partialCount, missingCount,
  expandedAreas, onToggleArea, isDark, isViewOnly, users,
  onLinkEvidence, onFindingClick, onExport, onGoToRegister,
}: GapEvidenceTabProps) {
  function ownerName(uid: string) { return users.find((u) => u.id === uid)?.name ?? uid; }

  return (
    <div role="tabpanel" id="panel-evidence" aria-labelledby="tab-evidence" tabIndex={0}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Evidence index</h2>
        <Button variant="primary" size="sm" icon={() => <span className="w-4 h-4" aria-hidden="true">↓</span>} onClick={onExport}>Export evidence pack</Button>
      </div>

      {allEvidenceRows.length === 0 ? (
        <div className="card p-10 text-center">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
          <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No evidence to show yet</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Log findings in the Findings Register tab. Each finding will appear here as an evidence row.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={onGoToRegister}>Go to Findings Register</Button>
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
                  <button type="button" onClick={() => onToggleArea(area)} aria-expanded={isExp} aria-controls={`evidence-area-${areaKey}`}
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
                                    <button type="button" onClick={() => onFindingClick(row.findingId)}
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
                                          onClick={() => onLinkEvidence(row.findingId, row.evidenceLink ?? "")} />
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
  );
}
