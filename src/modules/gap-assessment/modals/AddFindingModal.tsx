import { useEffect, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Upload, X, Sparkles, Bot } from "lucide-react";
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
import { RcaMethodFields, rcaDetailToText, type RcaDetail } from "@/modules/capa/modals/components/RcaMethodFields";
import { CAPA_RCA_METHODS, rcaMethodOptions } from "@/constants/rcaMethods";
import { frameworkLabel } from "@/constants/frameworks";

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];

/** Today (YYYY-MM-DD) for the target-date min. */
const todayISO = () => new Date().toISOString().slice(0, 10);

const findingSchema = z.object({
  siteId: z.string().min(1, "Site required"),
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

interface UploadedEvidenceFile {
  name: string;
  sizeKb: number;
  type: DocType;
}

type AddFindingPayload = FindingForm & {
  evidenceFile?: UploadedEvidenceFile;
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
  /** Gates the AI "Suggest classification" action (AGI mode + CAPA agent on). */
  aiEnabled?: boolean;
}

export function AddFindingModal({ isOpen, onClose, onSave, sites, systems, activeFrameworks, lockedSiteId, aiEnabled = true }: AddFindingModalProps) {
  const { register: reg, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FindingForm>({
    resolver: zodResolver(findingSchema),
    defaultValues: { severity: "High", siteId: lockedSiteId ?? "", raiseCapaImmediately: false },
  });
  const [evidenceFile, setEvidenceFile] = useState<UploadedEvidenceFile | null>(null);
  // Gap RCA (Batch B) — structured method detail (mirrors CAPA's create modal).
  const [detail, setDetail] = useState<RcaDetail>({});
  const rcaMethod = watch("rcaMethod");

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
    const file = e.target.files?.[0];
    if (!file) return;
    setEvidenceFile({
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      type: inferDocType(file.name),
    });
    setValue("evidenceLink", file.name, { shouldDirty: true });
    e.currentTarget.value = "";
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
      evidenceFile: evidenceFile ?? undefined,
      rootCause: rootCause || undefined,
      rcaDetail: data.rcaMethod ? JSON.stringify(detail) : undefined,
    });
    reset();
    setEvidenceFile(null);
    setDetail({});
    setTriage(null);
    setTriageError("");
  }

  function handleClose() {
    onClose();
    setDetail({});
    reset();
    setEvidenceFile(null);
    setTriage(null);
    setTriageError("");
  }

  return (
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
          {/* Site + Area on one row (Site hidden for non-admin — auto from login). */}
          {!lockedSiteId && (
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select site..." value={watch("siteId") ?? ""} onChange={(v) => setValue("siteId", v, { shouldValidate: true })} width="w-full"
                options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />
              {errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}
            </div>
          )}
          <div className={lockedSiteId ? "col-span-2" : ""}>
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Sparkles}
                loading={triageLoading}
                onClick={runTriage}
                disabled={(watchRequirement ?? "").trim().length < 10}
              >
                {triageLoading ? "Analysing…" : "Suggest classification (AI)"}
              </Button>
              {triageError && <p role="alert" className="text-[11px] text-(--danger) mt-1.5">{triageError}</p>}

              {triage && (
                <div className="agi-panel mt-2.5" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>AGI Triage</span>
                    </div>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {triage.confidence}% confidence · {triage.source === "backend" ? "live" : "demo"}
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

          {/* Target date (Owner field removed — owner is auto-assigned to the
              creator server-side). */}
          <div>
            <DatePicker id="f-target" label="Target date" required min={todayISO()}
              value={watch("targetDate") ?? ""}
              onChange={(v) => setValue("targetDate", v, { shouldValidate: true })}
              error={errors.targetDate?.message} />
          </div>

          <div className="col-span-2">
            <Input
              id="f-evidence"
              label="Evidence link (optional)"
              placeholder="Document reference or URL"
              {...reg("evidenceLink")}
            />
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: "var(--bg-border)", background: "var(--bg-surface)" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>Upload evidence file</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Adds the document to Evidence & Documents and links it to this finding.</p>
                </div>
                <label className="inline-flex">
                  <input type="file" className="hidden" onChange={handleFileChange} />
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium cursor-pointer" style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}>
                    <Upload className="w-3.5 h-3.5" />
                    Choose file
                  </span>
                </label>
              </div>
              {evidenceFile && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{evidenceFile.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{evidenceFile.type} · {evidenceFile.sizeKb} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceFile(null);
                      setValue("evidenceLink", "", { shouldDirty: true });
                    }}
                    className="border-none bg-transparent p-1 cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Remove selected evidence file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Root Cause Analysis — method-driven (reuses CAPA's RcaMethodFields
              + canonical CAPA_RCA_METHODS). Serialized to rootCause (mirror) +
              rcaDetail (JSON) on save. */}
          <div className="col-span-2">
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Root Cause Analysis <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></p>
            {/* Deselectable: "— None" clears an accidental method and resets the
                structured detail (incl. any AI-drafted content). */}
            <Dropdown placeholder="Select method..." value={watch("rcaMethod") ?? ""}
              onChange={(v) => { setValue("rcaMethod", (v || undefined) as FindingForm["rcaMethod"]); if (!v) setDetail({}); }}
              width="w-full"
              options={[{ value: "", label: "— None" }, ...rcaMethodOptions(CAPA_RCA_METHODS)]} />
            <div className="mt-2">
              {/* AI Draft helper — same component the CAPA modals use. Passing
                  draftContext (Requirement + Purpose) turns on the "AI Draft"
                  button so the 5 Why / Fishbone / free-text methods can be
                  AI-drafted here too. No recordId yet (create modal) — the
                  component falls back to "-". */}
              <RcaMethodFields
                method={rcaMethod}
                detail={detail}
                onChange={setDetail}
                draftContext={[watchRequirement, watch("purpose")].filter(Boolean).join("\n\n")}
              />
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export type { AddFindingPayload as FindingForm };
