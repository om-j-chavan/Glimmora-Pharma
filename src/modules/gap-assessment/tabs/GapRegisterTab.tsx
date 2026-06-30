import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import {
  ClipboardList, Plus, Search, ChevronRight, Link2, Bot, Pencil, Save, History, Paperclip,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { usePermissions } from "@/hooks/usePermissions";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { formatReference } from "@/lib/reference";
import { ExportMenu } from "@/components/ui/ExportMenu";
import type { Finding, FindingSeverity, FindingStatus } from "@/store/findings.slice";
import { updateFinding as updateFindingAction, assignFinding as assignFindingAction } from "@/actions/findings";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { Dropdown } from "@/components/ui/Dropdown";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { displayName, displayUserName, displaySiteName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { DatePicker } from "@/components/ui/DatePicker";
import { RcaMethodFields, parseRcaDetail, rcaDetailToText, type RcaDetail } from "@/modules/capa/modals/components/RcaMethodFields";
import { CAPA_RCA_METHODS, rcaMethodOptions, type CapaRCAMethod } from "@/constants/rcaMethods";
import { DocumentSummaryPanel } from "@/components/search/DocumentSummaryPanel";

/* ── Helpers ── */

const FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};

function severityBadge(s: FindingSeverity) {
  return <Badge variant={getSeverityVariant(s, "generic")}>{normalizeSeverityForDisplay(s, "generic") ?? s}</Badge>;
}
// Defensive: normalize casing/underscores so the badge never prints a raw
// value (e.g. legacy "in_progress") — mirrors capaStatusBadge's LABEL ?? s.
const FINDING_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  "in progress": "In Progress",
  closed: "Closed",
};
const FINDING_STATUS_CLASS: Record<string, string> = {
  open: "badge badge-blue",
  "in progress": "badge badge-amber",
  closed: "badge badge-green",
};
function statusBadge(s: FindingStatus) {
  const key = String(s).toLowerCase().replace(/_/g, " ");
  const label = FINDING_STATUS_LABEL[key] ?? s;
  const cls = FINDING_STATUS_CLASS[key] ?? "badge badge-gray";
  return <span className={cls}>{label}</span>;
}
function capaStatusBadge(s: string) {
  const m: Record<string, string> = { open: "badge badge-blue", in_progress: "badge badge-amber", pending_qa_review: "badge badge-purple", closed: "badge badge-green", rejected: "badge badge-red" };
  const label = CAPA_STATUS_LABEL[s as keyof typeof CAPA_STATUS_LABEL] ?? s;
  return <span className={m[s] ?? "badge badge-gray"}>{label}</span>;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1 block";
const LOCKED_HINT = <span className="text-[10px] text-[#64748b] italic ml-1.5">(cannot change)</span>;

/* ── Form type ── */
interface EditForm {
  requirement: string;
  purpose: string;
  owner: string;
  targetDate: string;
  evidenceLink: string;
  rootCause: string;
  rcaMethod?: string;
}

/** Seed structured RCA detail from the row; fall back to the flat rootCause
 *  text for findings that predate rcaDetail (so old gaps still show it). */
function seedRcaDetail(f: { rcaDetail?: string; rootCause?: string }): RcaDetail {
  const d = parseRcaDetail(f.rcaDetail);
  if (Object.keys(d).length === 0 && f.rootCause) return { text: f.rootCause, faultTree: f.rootCause };
  return d;
}

/* ── Props ── */
interface GapRegisterTabProps {
  filteredFindings: Finding[];
  findingsTotal: number;
  selectedFinding: Finding | null;
  onSelectFinding: (f: Finding | null) => void;
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
  onNavigateCapa: (capaId: string) => void;
  /** Opens the shared evidence modal (link + file upload + current doc). */
  onManageEvidence: (findingId: string, currentLink: string) => void;
}

export function GapRegisterTab({
  filteredFindings, findingsTotal, selectedFinding, onSelectFinding,
  isViewOnly, users, timezone, dateFormat, capas,
  agiMode, agiCapa, isAnyFilterActive, renderFilters,
  onAddOpen, onRaiseCapa, onNavigateCapa, onManageEvidence,
}: GapRegisterTabProps) {
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  // Capability mirrors of the server (exclude super_admin from authoring).
  const gapCan = usePermissions("gap");
  const capaCan = usePermissions("capa");
  // Gap Step 1 — QA assigns the finding to the person who will work it.
  const { isQAHead } = usePermissions();
  const complianceUsers = useComplianceUsers();
  const [assignTo, setAssignTo] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  async function handleAssignFinding() {
    if (!selectedFinding || !assignTo) return;
    setAssignBusy(true); setAssignError(null);
    const res = await assignFindingAction(selectedFinding.id, { assigneeId: assignTo });
    setAssignBusy(false);
    if (!res.success) { setAssignError(res.error || "Failed to assign finding."); return; }
    setAssignTo("");
    router.refresh();
  }
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { sites: accessibleSites } = useTenantConfig();
  const showSiteColumn = !selectedSiteId && accessibleSites.length > 1;
  const siteName = (id: string) => displaySiteName(id, accessibleSites);
  const [searchQuery, setSearchQuery] = useState("");

  // Row selection for export (empty = export all currently displayed rows)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [savedPopup, setSavedPopup] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Mirrors the server author set (COMPLIANCE_AUTHOR_ROLES via gapCan.canEdit):
  // any author role (csv_val_lead / qa_head / regulatory_affairs /
  // customer_admin) may edit any finding — the server's updateFinding has no
  // owner restriction, so the old admin/qa/owner role-list is dropped.
  const canEdit =
    !isViewOnly &&
    selectedFinding?.status !== "Closed" &&
    gapCan.canEdit;

  const form = useForm<EditForm>({
    defaultValues: {
      requirement: "",
      purpose: "",
      owner: "",
      targetDate: "",
      evidenceLink: "",
      rootCause: "",
      rcaMethod: "",
    },
  });
  // Gap RCA (Batch B) — structured detail, prefilled from rcaDetail (or the
  // rootCause text for findings that predate it).
  const [detail, setDetail] = useState<RcaDetail>({});

  // Reset form when selected finding changes
  useEffect(() => {
    if (selectedFinding) {
      form.reset({
        requirement: selectedFinding.requirement,
        purpose: selectedFinding.purpose ?? "",
        owner: selectedFinding.owner,
        targetDate: selectedFinding.targetDate ? dayjs.utc(selectedFinding.targetDate).format("YYYY-MM-DD") : "",
        evidenceLink: selectedFinding.evidenceLink ?? "",
        rootCause: selectedFinding.rootCause ?? "",
        rcaMethod: selectedFinding.rcaMethod ?? "",
      });
      setDetail(seedRcaDetail(selectedFinding));
    }
    // Reset edit form when the selected finding changes.

    setIsEditing(false);
    setEditReason("");
    setSaveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFinding?.id]);

  function ownerName(uid: string) { return displayUserName(uid, users); }
  function findingRef(f: Finding) { return formatReference("FND", f); }

  const displayed = searchQuery
    ? filteredFindings.filter((f) => {
        const q = searchQuery.toLowerCase();
        return (
          findingRef(f).toLowerCase().includes(q) ||
          f.area.toLowerCase().includes(q) ||
          f.requirement.toLowerCase().includes(q) ||
          (f.purpose?.toLowerCase().includes(q) ?? false)
        );
      })
    : filteredFindings;

  /* ── Selection + export ── */
  const allSelected = displayed.length > 0 && displayed.every((f) => selectedIds.has(f.id));
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(displayed.map((f) => f.id)));
  }

  const EXPORT_HEADERS = [
    "Gap ID", "Area", "Requirement", "Purpose", "Framework",
    "Severity", "Status", "Owner", "Target date", "Evidence", "Linked CAPA",
  ];
  function buildExportRows() {
    const source = selectedIds.size > 0 ? displayed.filter((f) => selectedIds.has(f.id)) : displayed;
    return source.map((f) => {
      const linkedCapa = capas.find((c) => c.id === f.capaId) ?? capas.find((c) => c.findingId === f.id);
      return [
        findingRef(f),
        f.area,
        f.requirement,
        f.purpose ?? "",
        FRAMEWORK_LABELS[f.framework] ?? f.framework,
        f.severity,
        f.status,
        ownerName(f.owner),
        f.targetDate ? dayjs.utc(f.targetDate).tz(timezone).format(dateFormat) : "",
        f.evidenceLink ?? "",
        linkedCapa ? (linkedCapa.reference ?? linkedCapa.id) : "",
      ];
    });
  }

  async function onSave(data: EditForm) {
    if (!selectedFinding || !user) return;
    setSaveError("");

    const targetDateISO = dayjs(data.targetDate).utc().toISOString();

    // Gap RCA (Batch B) — serialize structured RCA: rootCause = readable mirror
    // (shared rcaDetailToText; preserve prior text if the structured fields are
    // empty), rcaDetail = JSON source. Mirrors CAPA's edit modal.
    const method = (data.rcaMethod || undefined) as CapaRCAMethod | undefined;
    const rcaText = (method ? rcaDetailToText(method, detail) : "") || (selectedFinding.rootCause ?? "");
    const rcaDetailJson = method ? JSON.stringify(detail) : undefined;

    const noChange =
      data.requirement === selectedFinding.requirement &&
      (data.purpose ?? "") === (selectedFinding.purpose ?? "") &&
      data.owner === selectedFinding.owner &&
      targetDateISO === selectedFinding.targetDate &&
      data.evidenceLink === (selectedFinding.evidenceLink ?? "") &&
      (rcaText ?? "") === (selectedFinding.rootCause ?? "") &&
      (data.rcaMethod ?? "") === (selectedFinding.rcaMethod ?? "") &&
      (rcaDetailJson ?? "") === (selectedFinding.rcaDetail ?? "");

    if (noChange) {
      setIsEditing(false);
      return;
    }

    const result = await updateFindingAction(selectedFinding.id, {
      requirement: data.requirement,
      purpose: data.purpose,
      owner: data.owner,
      targetDate: targetDateISO,
      evidenceLink: data.evidenceLink,
      rootCause: rcaText,
      rcaMethod: method,
      rcaDetail: rcaDetailJson,
      reason: editReason,
    });

    if (!result.success) {
      console.error("[gap] updateFinding failed:", result.error);
      setSaveError(result.error || "Failed to save changes. Please try again.");
      return;
    }

    setIsEditing(false);
    setEditReason("");
    setSavedPopup(true);
    router.refresh();
  }

  const isOverdue = selectedFinding ? selectedFinding.status !== "Closed" && dayjs.utc(selectedFinding.targetDate).isBefore(dayjs()) : false;

  return (
    <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" tabIndex={0}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
          <input type="search" className="input pl-8 text-[12px]" placeholder="Search findings…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search findings" />
        </div>
        {renderFilters(true)}
        {displayed.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            {selectedIds.size > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{selectedIds.size} selected</span>
            )}
            <ExportMenu
              filename={`findings-register-${dayjs().format("YYYY-MM-DD")}`}
              title="Findings register"
              subtitle={`Generated ${dayjs().format("DD MMM YYYY HH:mm")}`}
              headers={EXPORT_HEADERS}
              rows={buildExportRows}
              label={selectedIds.size > 0 ? `Export (${selectedIds.size})` : "Export all"}
            />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <ClipboardList className="w-12 h-12 text-[#334155]" aria-hidden="true" />
            {findingsTotal === 0 ? (
              <>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>No findings logged yet</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Log your first finding to start tracking GxP compliance gaps.</p>
                {!isViewOnly && gapCan.canCreate && <Button variant="primary" icon={Plus} onClick={onAddOpen}>Log your first finding</Button>}
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
              <th scope="col" className="w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label="Select all findings" />
              </th>
              <th scope="col" className="whitespace-nowrap">ID</th>
              {showSiteColumn && <th scope="col">Site</th>}
              <th scope="col">Area</th><th scope="col">Requirement</th><th scope="col">Purpose</th>
              <th scope="col">Framework</th><th scope="col">Severity</th><th scope="col">Status</th>
              <th scope="col">CAPA</th>
              <th scope="col">Owner</th><th scope="col">Target date</th><th scope="col">Evidence</th>
              <th scope="col"><span className="sr-only">Open</span></th>
            </tr></thead>
            <tbody>
              {displayed.map((f) => {
                // Reverse lookup in case finding.capaId hasn't been updated but a CAPA references it
                const linkedCapa = capas.find((c) => c.id === f.capaId) ?? capas.find((c) => c.findingId === f.id);
                return (
                <tr key={f.id} onClick={() => onSelectFinding(f)} className="cursor-pointer" aria-selected={selectedFinding?.id === f.id}
                  style={selectedFinding?.id === f.id ? { background: isDark ? "#0c2f5a" : "#eff6ff" } : {}}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)}
                      className="w-3.5 h-3.5 cursor-pointer accent-(--brand)" aria-label={`Select ${findingRef(f)}`} />
                  </td>
                  <th scope="row" className="whitespace-nowrap">
                    <div className="font-mono text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{findingRef(f)}</div>
                  </th>
                  {showSiteColumn && <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{siteName(f.siteId)}</td>}
                  <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{f.area}</td>
                  <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 200, color: "var(--text-primary)" }}>{f.requirement}</span></td>
                  <td><span className="text-[12px] line-clamp-2 block" style={{ maxWidth: 180, color: "var(--text-secondary)" }}>{f.purpose ? f.purpose : <span style={{ color: "var(--text-muted)" }}>&mdash;</span>}</span></td>
                  <td><span className="badge badge-blue text-[10px]">{FRAMEWORK_LABELS[f.framework] ?? f.framework}</span></td>
                  <td>{severityBadge(f.severity)}</td>
                  <td>{statusBadge(f.status)}</td>
                  <td className="whitespace-nowrap">
                    {linkedCapa ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onNavigateCapa(linkedCapa.id); }}
                        className="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer hover:underline"
                        aria-label={`Open ${linkedCapa.reference ?? linkedCapa.id}`}
                      >
                        <Link2 className="w-3 h-3 text-[#0ea5e9]" aria-hidden="true" />
                        <span className="font-mono text-[11px] font-semibold text-[#0ea5e9]">{linkedCapa.reference ?? linkedCapa.id}</span>
                        {capaStatusBadge(linkedCapa.status)}
                      </button>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>
                    )}
                  </td>
                  <td className="text-[12px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{ownerName(f.owner)}</td>
                  <td className="whitespace-nowrap">
                    <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(f.targetDate).tz(timezone).format(dateFormat)}</div>
                    {f.status !== "Closed" && dayjs.utc(f.targetDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}
                  </td>
                  <td>{f.evidenceLink ? <span className="text-[11px] text-[#0ea5e9]">{f.evidenceLink}</span> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>&mdash;</span>}</td>
                  <td><Button variant="ghost" size="xs" icon={ChevronRight} aria-label={`View detail for ${f.id}`} /></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Finding detail popup ── */}
      <Modal
        open={!!selectedFinding}
        onClose={() => { setIsEditing(false); onSelectFinding(null); }}
        title={selectedFinding ? findingRef(selectedFinding) : "Finding Detail"}
        footer={selectedFinding && isEditing ? (
          <div className="flex justify-end gap-2">
            {/* Edit-mode actions only; the modal's ✕ handles closing (no
                redundant bottom Close). Edit lives in the header. */}
            <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setEditReason(""); setSaveError(""); form.reset(); }}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={form.handleSubmit(onSave)}>Save</Button>
          </div>
        ) : undefined}
      >
        {selectedFinding && (
          <div className="space-y-4">
            {/* Header: severity + status badges, with the Edit action on the
                right (header action; ✕ closes; Save/Cancel in footer on edit). */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2 flex-wrap">{severityBadge(selectedFinding.severity)}{statusBadge(selectedFinding.status)}</div>
              {canEdit && !isEditing && (
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>Edit</Button>
              )}
            </div>

            {/* Feature 3 — Document Summarizing (view mode only) */}
            {!isEditing && (
              <DocumentSummaryPanel
                title={findingRef(selectedFinding)}
                recordId={selectedFinding.id}
                module="finding"
                content={[
                  `Requirement: ${selectedFinding.requirement}`,
                  selectedFinding.purpose ? `Purpose: ${selectedFinding.purpose}` : "",
                  `Framework: ${selectedFinding.framework}; Area: ${selectedFinding.area}; Severity: ${selectedFinding.severity}`,
                  selectedFinding.rootCause ? `Root cause: ${selectedFinding.rootCause}` : "",
                  selectedFinding.agiSummary ? `AI summary: ${selectedFinding.agiSummary}` : "",
                ].filter(Boolean).join("\n\n")}
              />
            )}

            {/* ── Requirement ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-requirement">Requirement</label>
                <textarea
                  id="edit-requirement"
                  rows={3}
                  {...form.register("requirement", { required: "Requirement is required", minLength: { value: 10, message: "Add the requirement (at least 10 characters)" } })}
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

            {/* ── Purpose ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-purpose">Purpose <span className="text-[10px] font-normal italic">(optional)</span></label>
                <textarea
                  id="edit-purpose"
                  rows={2}
                  {...form.register("purpose")}
                  className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-all duration-150 resize-none bg-(--bg-elevated) border border-(--bg-border) text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--brand) focus:ring-[3px] focus:ring-(--brand-muted)"
                  placeholder="Why this gap matters / what closing it achieves"
                />
              </div>
            ) : selectedFinding.purpose ? (
              <div>
                <h3 className={LABEL}>Purpose</h3>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{selectedFinding.purpose}</p>
              </div>
            ) : null}

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
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {ownerName(selectedFinding.owner)}
                  {(() => { const u = users.find((x) => x.id === selectedFinding.owner); return u ? ` (${roleLabel(u.role)})` : ""; })()}
                </p>
                {/* Gap Step 1 — QA reassigns the finding to whoever will work it
                    (mirrors the deviation task assign). Active staff only. */}
                {isQAHead && selectedFinding.status !== "Closed" && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <Dropdown
                      placeholder="Assign to…"
                      value={assignTo}
                      onChange={setAssignTo}
                      width="w-56"
                      size="sm"
                      options={complianceUsers.map((u) => ({ value: u.id, label: `${u.name} · ${roleLabel(u.role)}` }))}
                    />
                    <Button variant="secondary" size="sm" disabled={assignBusy || !assignTo} loading={assignBusy} onClick={() => void handleAssignFinding()}>Assign</Button>
                  </div>
                )}
                {assignError && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{assignError}</p>}
              </div>

              {/* ── Target date ── */}
              <div>
                <h3 className={LABEL}>Target date</h3>
                {isEditing ? (
                  <>
                    <Controller
                      name="targetDate"
                      control={form.control}
                      rules={{ required: "Target date required" }}
                      render={({ field }) => (
                        <DatePicker id="edit-target" value={field.value ?? ""} onChange={field.onChange}
                          error={form.formState.errors.targetDate?.message} />
                      )}
                    />
                    {isOverdue && <p className="text-[11px] mt-1" style={{ color: "var(--status-waiting)" }}>Current date is overdue — consider a future date</p>}
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
                {/* Reuse the shared evidence modal (upload a file + see the
                    current document) — same flow as the register table. */}
                <Button variant="secondary" size="sm" icon={Paperclip} className="mt-2"
                  onClick={() => onManageEvidence(selectedFinding.id, selectedFinding.evidenceLink ?? "")}>
                  Upload / manage evidence document
                </Button>
              </div>
            ) : selectedFinding.evidenceLink ? (
              <div>
                <h3 className={LABEL}>Evidence</h3>
                <span className="text-[12px] text-[#0ea5e9]">{selectedFinding.evidenceLink}</span>
              </div>
            ) : null}

            {/* ── Root cause analysis — method-driven (reuses CAPA's
                RcaMethodFields + canonical CAPA_RCA_METHODS). Prefills from
                rcaDetail; rootCause stays the readable mirror. ── */}
            {isEditing ? (
              <div>
                <label className={LABEL} htmlFor="edit-rcamethod">Root cause analysis <span className="text-[10px] font-normal italic">(optional)</span></label>
                <Controller
                  name="rcaMethod"
                  control={form.control}
                  render={({ field }) => (
                    <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={rcaMethodOptions(CAPA_RCA_METHODS)} />
                  )}
                />
                <div className="mt-2">
                  <RcaMethodFields
                    method={(form.watch("rcaMethod") || undefined) as CapaRCAMethod | undefined}
                    detail={detail}
                    onChange={setDetail}
                    recordId={selectedFinding.id}
                    draftContext={[selectedFinding.requirement, selectedFinding.purpose].filter(Boolean).join("\n\n")}
                  />
                </div>
              </div>
            ) : selectedFinding.rootCause ? (
              <div>
                <h3 className={LABEL}>Root cause analysis {selectedFinding.rcaMethod && <Badge variant="gray">{selectedFinding.rcaMethod}</Badge>}</h3>
                <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{selectedFinding.rootCause}</p>
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

            {/* ── Save error ── */}
            {isEditing && saveError && (
              <p role="alert" className="text-[11px] text-[#ef4444] p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>{saveError}</p>
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
            {!isEditing && (() => {
              // Check both: finding.capaId and reverse lookup via capas[].findingId
              const linkedCapa = selectedFinding.capaId
                ? capas.find((c) => c.id === selectedFinding.capaId)
                : capas.find((c) => c.findingId === selectedFinding.id);
              const linkedCapaId = linkedCapa?.id ?? selectedFinding.capaId;

              return linkedCapaId ? (
                <div>
                  <h3 className={LABEL}>Linked CAPA</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" onClick={() => onNavigateCapa(linkedCapaId)} className="flex items-center gap-1.5 text-[12px] hover:underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />{linkedCapa?.reference ?? linkedCapaId}
                    </button>
                    {linkedCapa && capaStatusBadge(linkedCapa.status)}
                  </div>
                  {linkedCapa?.status === "pending_qa_review" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--info-bg)", color: "var(--info)" }}>CAPA pending QA review. Once closed, this finding will be automatically closed.</p>}
                  {linkedCapa?.status === "closed" && <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: "var(--success-bg)", color: "var(--success)" }}>CAPA closed. This finding has been automatically closed.</p>}
                </div>
              ) : (
                !isViewOnly && selectedFinding.status !== "Closed" && capaCan.canCreate && (
                  <Button variant="secondary" icon={Plus} fullWidth onClick={() => onRaiseCapa(selectedFinding)}>Raise CAPA</Button>
                )
              );
            })()}

            {/* ── Timeline ── */}
            {!isEditing && (
              <div className="pt-4 border-t border-(--bg-border)">
                <p className={LABEL}>Timeline</p>
                <div className="space-y-2.5 text-[11px]">
                  {selectedFinding.createdAt && (
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--brand)" }} />
                      <div>
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>Created</p>
                        <p style={{ color: "var(--text-muted)" }}>
                          {ownerName(selectedFinding.owner)} &mdash; {dayjs.utc(selectedFinding.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedFinding.capaId && (() => {
                    const linkedCapa = capas.find((c) => c.id === selectedFinding.capaId) ?? capas.find((c) => c.findingId === selectedFinding.id);
                    return linkedCapa ? (
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#f59e0b" }} />
                        <div>
                          <p className="font-medium" style={{ color: "var(--text-primary)" }}>CAPA raised &mdash; {linkedCapa.reference ?? linkedCapa.id}</p>
                          <p style={{ color: "var(--text-muted)" }}>
                            {ownerName(linkedCapa.owner)} &mdash; {linkedCapa.createdAt ? dayjs.utc(linkedCapa.createdAt).tz(timezone).format("DD/MM/YYYY hh:mm A") : "\u2014"}
                          </p>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {selectedFinding.editHistory && selectedFinding.editHistory.length > 0 && (() => {
                    const last = selectedFinding.editHistory[selectedFinding.editHistory.length - 1];
                    return (
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#10b981" }} />
                        <div>
                          <p className="font-medium" style={{ color: "var(--text-primary)" }}>Last updated</p>
                          <p style={{ color: "var(--text-muted)" }}>
                            {displayName({ name: last.editedBy })} &mdash; {dayjs.utc(last.editedAt).tz(timezone).format("DD/MM/YYYY hh:mm A")}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  {!selectedFinding.createdAt && !selectedFinding.editHistory?.length && (
                    <p style={{ color: "var(--text-muted)" }}>&mdash;</p>
                  )}
                </div>
                {selectedFinding.linkedSystemName && (
                  <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
                    Linked system: <span style={{ color: "var(--text-primary)" }}>{selectedFinding.linkedSystemName}</span>
                  </p>
                )}
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
                    key={edit.editedAt}
                    className={clsx("text-[11px] mb-2 pb-2", i < selectedFinding.editHistory!.length - 1 && "border-b border-(--bg-border)")}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{displayName({ name: edit.editedBy })}</span>
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
