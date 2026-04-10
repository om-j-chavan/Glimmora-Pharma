import { useState, useEffect, type ReactNode } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  ClipboardList, Plus, Search, ChevronRight, Link2, Bot, Pencil, Save, History,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import type { Finding, FindingSeverity, FindingStatus } from "@/store/findings.slice";
import { editFinding } from "@/store/findings.slice";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";

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

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1 block";
const LOCKED_HINT = <span className="text-[10px] text-[#64748b] italic ml-1.5">(cannot change)</span>;

/* ── Form type ── */
interface EditForm {
  requirement: string;
  owner: string;
  targetDate: string;
  evidenceLink: string;
}

/* ── Props ── */
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
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();
  const [searchQuery, setSearchQuery] = useState("");

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [savedPopup, setSavedPopup] = useState(false);

  const canEdit =
    !isViewOnly &&
    selectedFinding?.status !== "Closed" &&
    (role === "super_admin" || role === "customer_admin" || role === "qa_head" || selectedFinding?.owner === user?.id);

  const form = useForm<EditForm>({
    defaultValues: {
      requirement: "",
      owner: "",
      targetDate: "",
      evidenceLink: "",
    },
  });

  // Reset form when selected finding changes
  useEffect(() => {
    if (selectedFinding) {
      form.reset({
        requirement: selectedFinding.requirement,
        owner: selectedFinding.owner,
        targetDate: selectedFinding.targetDate ? dayjs.utc(selectedFinding.targetDate).format("YYYY-MM-DD") : "",
        evidenceLink: selectedFinding.evidenceLink ?? "",
      });
    }
    setIsEditing(false);
    setEditReason("");
  }, [selectedFinding?.id]);

  function ownerName(uid: string) { return users.find((u) => u.id === uid)?.name ?? uid; }

  const displayed = searchQuery
    ? filteredFindings.filter((f) => {
        const q = searchQuery.toLowerCase();
        return f.id.toLowerCase().includes(q) || f.area.toLowerCase().includes(q) || f.requirement.toLowerCase().includes(q);
      })
    : filteredFindings;

  function onSave(data: EditForm) {
    if (!selectedFinding || !user) return;

    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
    const targetDateISO = dayjs(data.targetDate).utc().toISOString();

    if (data.requirement !== selectedFinding.requirement) changes.push({ field: "requirement", oldValue: selectedFinding.requirement, newValue: data.requirement });
    if (data.owner !== selectedFinding.owner) changes.push({ field: "owner", oldValue: ownerName(selectedFinding.owner), newValue: ownerName(data.owner) });
    if (targetDateISO !== selectedFinding.targetDate) changes.push({ field: "targetDate", oldValue: selectedFinding.targetDate, newValue: targetDateISO });
    if (data.evidenceLink !== (selectedFinding.evidenceLink ?? "")) changes.push({ field: "evidenceLink", oldValue: selectedFinding.evidenceLink ?? "", newValue: data.evidenceLink });

    if (changes.length === 0) {
      setIsEditing(false);
      return;
    }

    dispatch(editFinding({
      id: selectedFinding.id,
      patch: {
        requirement: data.requirement,
        owner: data.owner,
        targetDate: targetDateISO,
        evidenceLink: data.evidenceLink,
      },
      editedBy: user.id,
      editedAt: dayjs().toISOString(),
      editReason: editReason || undefined,
    }));

    auditLog({
      action: "FINDING_EDITED",
      module: "findings",
      recordId: selectedFinding.id,
      newValue: { changes, editedBy: user.id, reason: editReason },
    });

    setIsEditing(false);
    setEditReason("");
    setSavedPopup(true);
  }

  const isOverdue = selectedFinding ? selectedFinding.status !== "Closed" && dayjs.utc(selectedFinding.targetDate).isBefore(dayjs()) : false;

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

      {/* Table */}
      <div className="overflow-x-auto">
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
                <tr key={f.id} onClick={() => onSelectFinding(f)} className="cursor-pointer" aria-selected={selectedFinding?.id === f.id}
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

      {/* ── Finding detail popup ── */}
      <Modal open={!!selectedFinding} onClose={() => { setIsEditing(false); onSelectFinding(null); }} title={selectedFinding?.id ?? "Finding Detail"}>
        {selectedFinding && (
          <div className="space-y-4">
            {/* Header: badges + edit/save buttons */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2 flex-wrap">{severityBadge(selectedFinding.severity)}{statusBadge(selectedFinding.status)}</div>
              <div className="flex items-center gap-2">
                {canEdit && !isEditing && (
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Button>
                )}
                {isEditing && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditReason(""); form.reset(); }}>Cancel</Button>
                    <Button variant="primary" size="sm" icon={Save} onClick={form.handleSubmit(onSave)}>Save</Button>
                  </>
                )}
              </div>
            </div>

            {/* ── Requirement ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-requirement">Requirement</label>
                <textarea
                  id="edit-requirement"
                  rows={3}
                  {...form.register("requirement", { required: "Requirement is required", minLength: { value: 5, message: "Too short" } })}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 resize-none bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                />
                {form.formState.errors.requirement && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.requirement.message}</p>}
              </div>
            ) : (
              <div>
                <h3 className={LABEL}>Requirement</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.requirement}</p>
              </div>
            )}

            {/* ── Area + Framework (LOCKED) ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className={LABEL}>Area</h3>
                <div className="flex items-center">
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedFinding.area}</p>
                  {isEditing && LOCKED_HINT}
                </div>
              </div>
              <div>
                <h3 className={LABEL}>Framework</h3>
                <div className="flex items-center">
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{FRAMEWORK_LABELS[selectedFinding.framework] ?? selectedFinding.framework}</p>
                  {isEditing && LOCKED_HINT}
                </div>
              </div>
            </div>

            {/* ── Severity (LOCKED) ── */}
            {isEditing && (
              <div>
                <h3 className={LABEL}>Severity</h3>
                <div className="flex items-center">{severityBadge(selectedFinding.severity)}{LOCKED_HINT}</div>
              </div>
            )}

            {/* ── Owner ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className={LABEL}>Owner</h3>
                {isEditing ? (
                  <Controller
                    name="owner"
                    control={form.control}
                    rules={{ required: "Owner required" }}
                    render={({ field }) => (
                      <Dropdown
                        value={field.value}
                        onChange={field.onChange}
                        options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))}
                        placeholder="Select owner..."
                        width="w-full"
                      />
                    )}
                  />
                ) : (
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(selectedFinding.owner)}</p>
                )}
              </div>

              {/* ── Target date ── */}
              <div>
                <h3 className={LABEL}>Target date</h3>
                {isEditing ? (
                  <>
                    <input
                      type="date"
                      {...form.register("targetDate", { required: "Target date required" })}
                      className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                    />
                    {isOverdue && <p className="text-[11px] text-[#f59e0b] mt-1">Current date is overdue — consider a future date</p>}
                    {form.formState.errors.targetDate && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.targetDate.message}</p>}
                  </>
                ) : (
                  <p className="text-[12px]" style={{ color: isOverdue ? "#ef4444" : "var(--text-primary)" }}>
                    {dayjs.utc(selectedFinding.targetDate).tz(timezone).format(dateFormat)}
                    {isOverdue && <span className="badge badge-red text-[10px] ml-2">Overdue</span>}
                  </p>
                )}
              </div>
            </div>

            {/* ── Evidence link ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-evidence">Evidence link <span className="text-[10px] font-normal italic">(optional)</span></label>
                <input
                  id="edit-evidence"
                  type="text"
                  {...form.register("evidenceLink")}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="Document reference or URL"
                />
              </div>
            ) : selectedFinding.evidenceLink ? (
              <div>
                <h3 className={LABEL}>Evidence</h3>
                <span className="text-[12px] text-[#0ea5e9]">{selectedFinding.evidenceLink}</span>
              </div>
            ) : null}

            {/* ── Edit reason (only in edit mode) ── */}
            {isEditing && (
              <div className="pt-4 border-t border-(--bg-border)">
                <label className={LABEL} htmlFor="edit-reason">
                  Reason for edit <span className="text-[10px] font-normal italic">(optional — helps audit trail)</span>
                </label>
                <input
                  id="edit-reason"
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="e.g. Wrong owner assigned, correcting typo..."
                />
              </div>
            )}

            {/* ── AGI Risk Analysis ── */}
            {!isEditing && selectedFinding.agiSummary && agiMode !== "manual" && agiCapa && (
              <div className="agi-panel" role="status" aria-live="polite">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>AGI Risk Analysis</span>
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.agiSummary}</p>
              </div>
            )}

            {/* ── CAPA link or Raise button ── */}
            {!isEditing && (
              selectedFinding.capaId ? (
                <div>
                  <h3 className={LABEL}>Linked CAPA</h3>
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
              )
            )}

            {/* ── Status update ── */}
            {!isEditing && !isViewOnly && selectedFinding.status !== "Closed" && (
              <div>
                <p className={LABEL}>Update status</p>
                <Dropdown value={selectedFinding.status} onChange={(val) => onStatusUpdate(selectedFinding.id, val as FindingStatus)}
                  options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Closed", label: "Closed" }]} width="w-full" />
              </div>
            )}

            {/* ── Edit history ── */}
            {!isEditing && selectedFinding.editHistory && selectedFinding.editHistory.length > 0 && (
              <div className="pt-4 border-t border-(--bg-border)">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  <p className={LABEL} style={{ marginBottom: 0 }}>Edit history</p>
                </div>
                {selectedFinding.editHistory.slice().reverse().map((edit, i) => (
                  <div
                    key={i}
                    className={clsx("text-[11px] mb-2 pb-2", i < selectedFinding.editHistory!.length - 1 && "border-b border-(--bg-border)")}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{ownerName(edit.editedBy)}</span>
                      <span style={{ color: "var(--text-muted)" }}>{dayjs.utc(edit.editedAt).tz(timezone).format("DD MMM YYYY HH:mm")}</span>
                    </div>
                    {edit.reason && (
                      <p className="italic mb-1" style={{ color: "var(--text-secondary)" }}>"{edit.reason}"</p>
                    )}
                    {edit.changes.map((c, ci) => (
                      <p key={ci} style={{ color: "var(--text-secondary)" }}>
                        {c.field}: <span style={{ color: "#ef4444" }}>{String(c.oldValue)}</span>{" → "}<span style={{ color: "#10b981" }}>{String(c.newValue)}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Save success popup */}
      <Popup isOpen={savedPopup} variant="success" title="Finding updated" description="Changes saved and recorded in audit trail." onDismiss={() => setSavedPopup(false)} />
    </div>
  );
}
