import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, X, Bot, Trash2 } from "lucide-react";
import { AIButton, AIBadge } from "@/components/ai";
import { classifyFinding, type FindingTriageResult } from "@/lib/ai";
import type { FindingSeverity } from "@/store/findings.slice";
import type { DocType } from "@/store/evidence.slice";
import type { SiteConfig } from "@/store/settings.slice";
import type { GxPSystem } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DocumentCard } from "@/components/shared/DocumentCard";
import { rcaDetailToText, type RcaDetail } from "@/modules/capa/modals/components/RcaMethodFields";
import { CAPA_RCA_METHODS } from "@/constants/rcaMethods";
import { frameworkLabel } from "@/constants/frameworks";
import { canCreateAcrossSites } from "@/lib/permissions/roleSets";

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];

/** Today (YYYY-MM-DD) for the target-date min. */
const todayISO = () => new Date().toISOString().slice(0, 10);

// siteId is OPTIONAL on the base schema: only super_admin / customer_admin see
// and pick the Site field (crossSiteFindingSchema makes it required for them);
// every other role has it hidden and the server auto-sets it from their site.
const findingSchema = z.object({
  siteId: z.string().optional(),
  area: z.string().min(1, "Area required"),
  requirement: z.string().min(10, "Add the requirement (at least 10 characters)"),
  purpose: z.string().optional(),
  framework: z.string().min(1, "Framework required"),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  // Block past dates (client) — the server re-validates in createFinding.
  targetDate: z.string().min(1, "Target date required").refine((v) => v >= todayISO(), "Target date can't be in the past"),
  evidenceLink: z.string().optional(),
  rootCause: z.string().optional(),
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  linkedSystemId: z.string().optional(),
  linkedSystemName: z.string().optional(),
  // Kept (defaults false) so the server payload shape is stable; the UI option is
  // hidden — immediate-raise happens via the normal disposition, not at creation.
  raiseCapaImmediately: z.boolean().optional(),
});
type FindingForm = z.infer<typeof findingSchema>;
/** Cross-site authors (super_admin / customer_admin) must pick a Site. */
const crossSiteFindingSchema = findingSchema.extend({ siteId: z.string().min(1, "Site required") });

/** A single evidence file STAGED in the create modal (before the finding
 *  exists). Holds the real `File` so GapPage can upload it via
 *  uploadFindingEvidence once the finding is created; `url` is a local
 *  object URL used only for the in-modal View button. */
interface StagedEvidenceFile {
  id: string;
  file: File;
  name: string;
  sizeKb: number;
  type: DocType;
  url: string;
}

type AddFindingPayload = FindingForm & {
  /** Staged evidence files — uploaded to the finding post-create (multi-file). */
  evidenceFiles?: { file: File; name: string; type: DocType }[];
  /** Structured RCA JSON (rootCause carries the readable mirror). */
  rcaDetail?: string;
};

interface AddFindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AddFindingPayload) => void;
  sites: SiteConfig[];
  systems: GxPSystem[];
  activeFrameworks: string[];
  lockedSiteId?: string | null;
  /** Creator identity — owner is auto-assigned to the current user server-side.
   *  Retained for API stability; the create form no longer renders an Owner field. */
  currentUserName?: string;
  currentUserRole?: string;
  /** The caller's own assigned site. Used to auto-scope the finding for non-QA
   *  users (who don't see the Site field). Null when the caller has no assigned
   *  site — the server then rejects on the missing siteId (edge case). */
  currentUserSiteId?: string | null;
  /** Gates the AI "Suggest classification" action (AGI mode + CAPA agent on). */
  aiEnabled?: boolean;
}

export function AddFindingModal({ isOpen, onClose, onSave, sites, systems, activeFrameworks, currentUserRole, aiEnabled = true }: AddFindingModalProps) {
  // Site-field rule (shared canCreateAcrossSites): only super_admin /
  // customer_admin see and MUST pick a Site. Every other role has the field
  // hidden — the server auto-scopes the finding to their own assigned site — so
  // the form carries no siteId for them.
  const crossSite = canCreateAcrossSites(currentUserRole ?? "");
  const { register: reg, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FindingForm>({
    resolver: zodResolver(crossSite ? crossSiteFindingSchema : findingSchema),
    defaultValues: { severity: "High", siteId: "", raiseCapaImmediately: false },
  });
  // Multi-file staged evidence — uploaded to the finding post-create. Each
  // carries the real File + a local object URL (for the View button).
  const [evidenceFiles, setEvidenceFiles] = useState<StagedEvidenceFile[]>([]);
  // Delete-confirmation target (shared ConfirmModal before removing a file).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Gap RCA (Batch B) — structured method detail. RCA is not collected in the Add
  // form (assessment-time only), but the state is retained so the submit payload
  // shape stays stable (serializes to undefined when no method is set).
  const [detail, setDetail] = useState<RcaDetail>({});
  const evidenceLinkValue = watch("evidenceLink") ?? "";

  // Feature I — Finding Triage (AGI). Pre-fills framework + severity and shows
  // a risk summary + evidence gaps. Advisory only: the values land in the form
  // fields, which the user can still change before saving.
  const [triage, setTriage] = useState<FindingTriageResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState("");
  const watchRequirement = watch("requirement");

  async function runTriage() {
    const requirement = (watchRequirement ?? "").trim();
    if (requirement.length < 10) {
      setTriageError("Describe the requirement (at least 10 characters) first.");
      return;
    }
    setTriageError("");
    setTriageLoading(true);
    try {
      const result = await classifyFinding(
        requirement,
        watch("area") ?? "",
        watch("purpose") ?? "",
        activeFrameworks,
      );
      setTriage(result);
      // Auto-apply: framework only if it's one the tenant has enabled (else the
      // dropdown can't render it), severity always (Critical/High/Low taxonomy).
      if (activeFrameworks.includes(result.framework)) {
        setValue("framework", result.framework, { shouldValidate: true });
      }
      setValue("severity", result.severity as FindingSeverity, { shouldValidate: true });
    } catch {
      setTriageError("Couldn't classify right now. Pick the fields manually.");
    } finally {
      setTriageLoading(false);
    }
  }

  function inferDocType(fileName: string): DocType {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return "Report";
    if (ext === "xls" || ext === "xlsx") return "Record";
    if (ext === "doc" || ext === "docx") return "SOP";
    if (ext === "jpg" || ext === "jpeg" || ext === "png") return "Record";
    if (ext === "txt") return "Other";
    return "Other";
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    // Multi-file: append EVERY picked file to the staged list (the input allows
    // multiple, and re-picking adds more — the value is reset so the same file
    // can be chosen again).
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setEvidenceFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${prev.length}-${file.lastModified}`,
        file,
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        type: inferDocType(file.name),
        url: URL.createObjectURL(file),
      })),
    ]);
    e.currentTarget.value = "";
  }

  function confirmRemoveFile() {
    if (!pendingDeleteId) return;
    setEvidenceFiles((prev) => {
      const target = prev.find((f) => f.id === pendingDeleteId);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((f) => f.id !== pendingDeleteId);
    });
    setPendingDeleteId(null);
  }

  /** Revoke every staged object URL (on close / after save) to avoid leaks. */
  function revokeAllStaged() {
    setEvidenceFiles((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
  }

  // Smart default: auto-select Part 11 framework when the user picks CSV/IT area
  // (only if Part 11 is active for the tenant and framework not already set).
  const watchArea = watch("area");
  const watchFramework = watch("framework");
  const watchSiteId = watch("siteId");
  useEffect(() => {
    if (watchArea === "CSV/IT" && !watchFramework && activeFrameworks.includes("p11")) {
      setValue("framework", "p11", { shouldValidate: true });
    }
  }, [watchArea, watchFramework, activeFrameworks, setValue]);

  function onSubmit(data: FindingForm) {
    // Serialize the structured RCA: rootCause = readable mirror (shared
    // rcaDetailToText), rcaDetail = JSON source. Mirrors CAPA's create modal.
    const rootCause = data.rcaMethod ? rcaDetailToText(data.rcaMethod, detail) : undefined;
    onSave({
      ...data,
      evidenceFiles: evidenceFiles.map((f) => ({ file: f.file, name: f.name, type: f.type })),
      rootCause: rootCause || undefined,
      rcaDetail: data.rcaMethod ? JSON.stringify(detail) : undefined,
    });
    reset();
    revokeAllStaged();
    setPendingDeleteId(null);
    setDetail({});
    setTriage(null);
    setTriageError("");
  }

  function handleClose() {
    onClose();
    setDetail({});
    reset();
    revokeAllStaged();
    setPendingDeleteId(null);
    setTriage(null);
    setTriageError("");
  }

  return (
    <>
    <Modal open={isOpen} onClose={handleClose} title="Report Compliance Gap"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" icon={Plus} loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Report Gap</Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} aria-label="Add new finding" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Site + Area on one row. The Site field shows ONLY for cross-site
              authors (super_admin / customer_admin); every other role has it
              hidden — the server auto-scopes the finding to their assigned site. */}
          {crossSite && (
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select site..." value={watch("siteId") ?? ""} onChange={(v) => setValue("siteId", v, { shouldValidate: true })} width="w-full"
                options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />
              {errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}
            </div>
          )}
          <div className={!crossSite ? "col-span-2" : ""}>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Area <span className="text-(--danger)">*</span></p>
            <Dropdown placeholder="Select area..." value={watch("area") ?? ""} onChange={(v) => setValue("area", v, { shouldValidate: true })} width="w-full"
              options={AREAS.map((a) => ({ value: a, label: a }))} />
            {errors.area && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.area.message}</p>}
          </div>

          {/* Linked CSV system — own row, shown for CSV/IT & QC Lab. */}
          {(watchArea === "CSV/IT" || watchArea === "QC Lab") && (
            <div className="col-span-2">
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Linked system <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></p>
              <Dropdown
                placeholder="Select system..."
                value={watch("linkedSystemId") ?? ""}
                onChange={(v) => { setValue("linkedSystemId", v); setValue("linkedSystemName", systems.find((s) => s.id === v)?.name ?? ""); }}
                width="w-full"
                options={[{ value: "", label: "— None" }, ...systems.filter((s) => !watchSiteId || s.siteId === watchSiteId).map((s) => ({ value: s.id, label: s.name }))]}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Links this finding to the system&apos;s DI &amp; Audit Trail tab.</p>
            </div>
          )}

          {/* Requirement + Framework + Severity on one row (nested 4-col;
              Requirement gets the wider half). */}
          <div className="col-span-2 grid grid-cols-4 gap-4">
            <Input
              id="f-req"
              label="Requirement"
              required
              className="col-span-2"
              placeholder="e.g. Annex 11 §11 — Audit trail completeness"
              error={errors.requirement?.message}
              {...reg("requirement")}
            />
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Framework <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select framework..." value={watch("framework") ?? ""} onChange={(v) => setValue("framework", v, { shouldValidate: true })} width="w-full"
                options={activeFrameworks.map((k) => ({ value: k, label: frameworkLabel(k) }))} />
              {errors.framework && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.framework.message}</p>}
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Severity <span className="text-(--danger)">*</span></p>
              <Dropdown value={watch("severity") ?? "High"} onChange={(v) => setValue("severity", v as FindingSeverity)} width="w-full"
                options={[
                  { value: "Critical", label: "Critical", badge: "C", badgeVariant: "red" as const },
                  { value: "High", label: "High", badge: "H", badgeVariant: "amber" as const },
                  { value: "Medium", label: "Medium", badge: "M", badgeVariant: "amber" as const },
                  { value: "Low", label: "Low", badge: "L", badgeVariant: "green" as const },
                ]} />
            </div>
          </div>

          {/* Feature I — Finding Triage. Classifies framework + severity and
              surfaces a risk summary + evidence gaps the user can act on. Full
              width, under the classification row. */}
          {aiEnabled && (
            <div className="col-span-2">
              <AIButton
                variant="subtle"
                size="sm"
                loading={triageLoading}
                onClick={runTriage}
                disabled={(watchRequirement ?? "").trim().length < 10}
              >
                Suggest classification (AI)
              </AIButton>
              {triageError && <p role="alert" className="text-[11px] text-(--danger) mt-1.5">{triageError}</p>}

              {triage && (
                <div className="agi-panel mt-2.5" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4" style={{ color: "var(--ai-accent)" }} aria-hidden="true" />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>AGI Triage</span>
                    </div>
                    {/* Was a bare "live"/"demo" word — vocabulary no other AI
                        surface used. Now the shared provenance badge. */}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {triage.confidence}% confidence
                      </span>
                      <AIBadge source={triage.source} />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="badge badge-blue text-[10px]">{triage.frameworkLabel}</span>
                    {triage.clause && <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{triage.clause}</span>}
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>·</span>
                    <span className="badge text-[10px]" style={{
                      background: triage.severity === "Critical" ? "var(--danger-bg)" : triage.severity === "High" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                      color: triage.severity === "Critical" ? "#ef4444" : triage.severity === "High" ? "#f59e0b" : "#10b981",
                    }}>{triage.severity}</span>
                  </div>
                  {triage.agiSummary && <p className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--text-secondary)" }}>{triage.agiSummary}</p>}
                  {triage.severityRationale && <p className="text-[10px] italic mb-2" style={{ color: "var(--text-muted)" }}>{triage.severityRationale}</p>}
                  {triage.evidenceGaps.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Evidence to assemble</p>
                      <div className="flex flex-wrap gap-1.5">
                        {triage.evidenceGaps.map((g, i) => (
                          <span key={i} className="text-[10px] rounded-md px-2 py-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                    Framework &amp; severity pre-filled in the form — review and edit before saving.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="col-span-2">
            <label htmlFor="f-purpose" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Purpose <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></label>
            <textarea id="f-purpose" rows={2} className="input text-[12px] resize-none" placeholder="Why this gap matters / what closing it achieves" {...reg("purpose")} />
          </div>

          {/* Target date — FULL WIDTH (#1). Owner field removed (owner is
              auto-assigned to the creator server-side). The `-mt-2` trims the
              extra gap ABOVE the picker without touching the spacing below. */}
          <div className="col-span-2 -mt-2">
            <DatePicker id="f-target" label="Target date" required min={todayISO()}
              value={watch("targetDate") ?? ""}
              onChange={(v) => setValue("targetDate", v, { shouldValidate: true })}
              error={errors.targetDate?.message} />
          </div>

          <div className="col-span-2">
            {/* #3 — Evidence link with a Clear (✕) button at the end (shown only
                when the field has a value; clears just this field). */}
            <Input
              id="f-evidence"
              label="Evidence link (optional)"
              placeholder="Document reference or URL"
              {...reg("evidenceLink")}
              rightAdornment={evidenceLinkValue ? (
                <button
                  type="button"
                  onClick={() => setValue("evidenceLink", "", { shouldDirty: true, shouldValidate: true })}
                  className="w-6 h-6 rounded-md flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-(--bg-hover) text-(--text-muted)"
                  aria-label="Clear evidence link"
                  title="Clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : undefined}
            />
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>Upload evidence files</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Add one or more documents — each is uploaded to Evidence &amp; Documents and linked to this finding.</p>
                </div>
                {/* #2 — MULTIPLE file selection (multiple + add-more). */}
                <label className="inline-flex shrink-0">
                  <input type="file" multiple className="hidden" onChange={handleFileChange} />
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium cursor-pointer" style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}>
                    <Upload className="w-3.5 h-3.5" />
                    {evidenceFiles.length > 0 ? "Add more" : "Choose files"}
                  </span>
                </label>
              </div>
              {/* #2 — staged files as the shared <DocumentCard> (View opens the
                  local file; the Delete/Trash action confirms via ConfirmModal). */}
              {evidenceFiles.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {evidenceFiles.map((f) => (
                    <DocumentCard
                      key={f.id}
                      doc={{
                        id: f.id,
                        title: f.name,
                        meta: `${f.type} · ${f.sizeKb} KB`,
                        badge: { label: "Pending upload", tone: "amber" },
                        viewHref: f.url,
                        downloadHref: null,
                      }}
                      onRemove={() => setPendingDeleteId(f.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RCA (Root Cause Analysis) is INTENTIONALLY not in the Add form — it is
              an assessment-time activity, done later in the finding detail /
              assessment flow (GapRegisterTab), not at add-time. Removed here only;
              the schema fields stay optional so the payload shape is stable. */}
        </div>
      </form>
    </Modal>

    {/* #2 — shared confirm dialog before removing a staged evidence file. */}
    <ConfirmModal
      open={!!pendingDeleteId}
      onClose={() => setPendingDeleteId(null)}
      onConfirm={confirmRemoveFile}
      title="Remove this document?"
      message="It won't be uploaded to this finding. You can add it again before saving."
      confirmLabel="Remove"
      cancelLabel="Keep"
      variant="danger"
      icon={Trash2}
    />
    </>
  );
}

export type { AddFindingPayload as FindingForm };
