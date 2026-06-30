import { useState } from "react";
import {
  FolderOpen, ChevronDown, FileCheck, ExternalLink, Paperclip,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/shared";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import type { FindingSeverity } from "@/store/findings.slice";
import type { UserConfig } from "@/store/settings.slice";
import { displayUserName } from "@/lib/identity-display";

interface EvidenceRow {
  findingId: string;
  reference: string;
  framework: string;
  docType: string;
  name: string;
  evidenceLink: string;
  /** Resolved viewable URL — external link or in-app download route. Absent
   *  when the evidence is a typed reference with no retrievable file. */
  evidenceHref?: string | undefined;
  status: "Complete" | "Partial" | "Missing";
  severity: FindingSeverity;
  findingStatus: string;
  owner: string;
  linkedCapa?: { id: string; reference?: string | null; status: string } | undefined;
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
  onToggleArea: (area: string) => void;  isViewOnly: boolean;
  users: UserConfig[];
  onLinkEvidence: (findingId: string, currentLink: string) => void;
  onFindingClick: (findingId: string) => void;
  onGoToRegister: () => void;
}

export function GapEvidenceTab({
  evidenceAreas, allEvidenceRows, completeCount, partialCount, missingCount,
  expandedAreas, onToggleArea, isViewOnly, users,
  onLinkEvidence, onFindingClick, onGoToRegister,
}: GapEvidenceTabProps) {
  // Capability mirror of the server (excludes super_admin from authoring).
  const gapCan = usePermissions("gap");
  function ownerName(uid: string) { return displayUserName(uid, users); }

  // Row selection for export, keyed by findingId (empty = export all rows)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  function toggleSelect(id: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectArea(rows: EvidenceRow[]) {
    const allIn = rows.length > 0 && rows.every((r) => selectedKeys.has(r.findingId));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (allIn ? next.delete(r.findingId) : next.add(r.findingId)));
      return next;
    });
  }

  const EXPORT_HEADERS = [
    "Area", "Gap ID", "Doc type", "Requirement", "Severity",
    "Evidence link", "Status", "Owner", "Linked CAPA",
  ];
  function buildExportRows(): (string | number)[][] {
    const rows: (string | number)[][] = [];
    for (const a of evidenceAreas) {
      for (const row of a.rows) {
        if (selectedKeys.size > 0 && !selectedKeys.has(row.findingId)) continue;
        rows.push([
          a.area, row.reference, row.docType, row.name, row.severity,
          row.evidenceLink || "", row.status, ownerName(row.owner),
          row.linkedCapa ? (row.linkedCapa.reference ?? row.linkedCapa.id) : "",
        ]);
      }
    }
    return rows;
  }

  return (
    <div role="tabpanel" id="panel-evidence" aria-labelledby="tab-evidence" tabIndex={0}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Evidence index</h2>
        {allEvidenceRows.length > 0 && (
          <div className="flex items-center gap-2">
            {selectedKeys.size > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{selectedKeys.size} selected</span>
            )}
            <ExportMenu
              filename={`evidence-index-${dayjs().format("YYYY-MM-DD")}`}
              title="Evidence index"
              subtitle={`Generated ${dayjs().format("DD MMM YYYY HH:mm")}`}
              headers={EXPORT_HEADERS}
              rows={buildExportRows}
              label={selectedKeys.size > 0 ? `Export (${selectedKeys.size})` : "Export all"}
            />
          </div>
        )}
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
                    className="w-full flex items-center justify-between p-4 rounded-xl border cursor-pointer text-left transition-all duration-150 bg-(--bg-elevated) border-(--bg-border) hover:bg-(--bg-hover)">
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
                        <DataTable
                          ariaLabel={`Evidence for ${area}`}
                          caption={`Evidence documents for ${area} area findings`}
                          data={rows}
                          rowKey={(row) => row.findingId}
                          columns={[
                            {
                              key: "select",
                              // Per-area select-all checkbox lives in the column
                              // header (ReactNode), wired to toggleSelectArea.
                              header: (
                                <input type="checkbox"
                                  checked={rows.length > 0 && rows.every((r) => selectedKeys.has(r.findingId))}
                                  onChange={() => toggleSelectArea(rows)}
                                  className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label={`Select all evidence in ${area}`} />
                              ),
                              width: "w-8",
                              render: (row) => (
                                <input type="checkbox" checked={selectedKeys.has(row.findingId)} onChange={() => toggleSelect(row.findingId)}
                                  className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label={`Select ${row.reference}`} />
                              ),
                            },
                            {
                              key: "findingId",
                              header: "Finding ID",
                              render: (row) => (
                                <button type="button" onClick={() => onFindingClick(row.findingId)}
                                  className="font-mono text-[11px] font-semibold text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0"
                                  aria-label={`Open ${row.reference} in register`}>{row.reference}</button>
                              ),
                            },
                            {
                              key: "docType",
                              header: "Doc type",
                              render: (row) => <Badge variant="gray">{row.docType}</Badge>,
                            },
                            {
                              key: "requirement",
                              header: "Requirement",
                              render: (row) => <span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 220, color: "var(--text-primary)" }}>{row.name}</span>,
                            },
                            {
                              key: "severity",
                              header: "Severity",
                              render: (row) => <Badge variant={getSeverityVariant(row.severity, "generic")}>{normalizeSeverityForDisplay(row.severity, "generic") ?? row.severity}</Badge>,
                            },
                            {
                              key: "evidenceLink",
                              header: "Evidence link",
                              render: (row) =>
                                row.evidenceHref ? (
                                  <a href={row.evidenceHref} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-[11px] text-[#0ea5e9] hover:underline"
                                    aria-label={`View evidence document ${row.evidenceLink} for ${row.reference}`}>
                                    <FileCheck className="w-3.5 h-3.5 text-[#10b981] shrink-0" aria-hidden="true" />
                                    <span className="truncate" style={{ maxWidth: 180 }}>{row.evidenceLink}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                                  </a>
                                ) : row.evidenceLink ? (
                                  <div className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-[#10b981]" aria-hidden="true" /><span className="text-[11px] truncate" style={{ maxWidth: 180, color: "var(--text-secondary)" }}>{row.evidenceLink}</span></div>
                                ) : (
                                  <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No document linked</span>
                                ),
                            },
                            {
                              key: "status",
                              header: "Status",
                              render: (row) => <Badge variant={row.status === "Complete" ? "green" : row.status === "Partial" ? "amber" : "red"}>{row.status}</Badge>,
                            },
                            {
                              key: "owner",
                              header: "Owner",
                              cellClassName: "text-[12px] text-(--text-secondary)",
                              render: (row) => ownerName(row.owner),
                            },
                            {
                              key: "actions",
                              header: "Actions",
                              srOnly: true,
                              render: (row) => (
                                <div className="flex items-center gap-1">
                                  {!isViewOnly && gapCan.canEdit && (
                                    <Button variant="ghost" size="xs" icon={Paperclip}
                                      aria-label={row.evidenceLink ? `Update evidence for ${row.findingId}` : `Link evidence to ${row.findingId}`}
                                      onClick={() => onLinkEvidence(row.findingId, row.evidenceLink ?? "")} />
                                  )}
                                  {row.evidenceHref && (
                                    <a href={row.evidenceHref} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-(--text-secondary) hover:bg-(--bg-elevated) hover:text-(--text-primary) transition-colors"
                                      aria-label={`View evidence document for ${row.reference}`}>
                                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    </a>
                                  )}
                                </div>
                              ),
                            },
                          ] satisfies Column<EvidenceRow>[]}
                        />
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
