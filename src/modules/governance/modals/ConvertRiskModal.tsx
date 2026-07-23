"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { formatReference } from "@/lib/reference";
import { RISK_SEVERITIES, type RiskSeverity } from "@/constants/risk";
import {
  CAPA_DOC_CARRYOVER_REASON,
  DEVIATION_AREAS,
  DEVIATION_CATEGORIES,
  DEVIATION_TYPES,
  GAP_AREAS,
  RISK_CATEGORY_TO_DEVIATION_CATEGORY,
  RISK_CONVERT_TARGET_LABEL,
  RISK_SEVERITY_TO_FDA,
  RISK_TO_DEVIATION_TYPE,
  TARGET_SUPPORTS_DOC_CARRYOVER,
  seedDueDate,
  type RiskConvertTarget,
} from "@/constants/riskConversion";
import type { RiskListRow } from "@/lib/queries/risks";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
const ERR = "text-[11px] text-[#ef4444] mt-1";
const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v }));
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every field any target might need. Only the relevant subset renders per target. */
interface ConvertFormValues {
  // Gap
  requirement: string;
  purpose: string;
  // Deviation + CAPA
  title: string;
  description: string;
  // Deviation
  type: string;
  category: string;
  fdaSeverity: string;
  immediateAction: string;
  // Gap + Deviation
  area: string;
  // Gap + CAPA (GENERIC taxonomy)
  severity: string;
  // all
  dueDate: string;
  copyDocuments: boolean;
}

export interface ConvertRiskModalProps {
  open: boolean;
  onClose: () => void;
  risk: RiskListRow;
  target: RiskConvertTarget;
  /** How many supporting documents the risk has (drives the copy checkbox copy). */
  documentCount: number;
  onSubmit: (target: RiskConvertTarget, values: ConvertFormValues) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Convert a Risk into a Gap Assessment / Deviation / CAPA.
 *
 * Every field is SEEDED from the risk and then fully editable — the seed is a
 * starting point, not a decision. The target module's own create action is what
 * ultimately validates and persists, so this form deliberately mirrors that
 * module's required fields (including the ones a Risk has no analogue for, like
 * a Deviation's three impact assessments, which are left blank on purpose so the
 * converting QA Head must state them consciously rather than accept a default).
 */
export function ConvertRiskModal({ open, onClose, risk, target, documentCount, onSubmit }: ConvertRiskModalProps) {
  const [serverError, setServerError] = useState("");
  const riskRef = formatReference("RISK", risk);
  const canCopyDocs = TARGET_SUPPORTS_DOC_CARRYOVER[target] && documentCount > 0;

  const form = useForm<ConvertFormValues>({ defaultValues: seedValues(risk, target) });
  const { register, control, handleSubmit, reset, formState, watch, setValue } = form;

  useEffect(() => {
    if (!open) return;
    setServerError("");
    reset(seedValues(risk, target));
  }, [open, risk, target, reset]);

  async function submit(values: ConvertFormValues) {
    setServerError("");
    const res = await onSubmit(target, values);
    if (!res.success) {
      setServerError(res.error || "Conversion failed.");
      return;
    }
    onClose();
  }

  const copyDocuments = watch("copyDocuments");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Convert ${riskRef} → ${RISK_CONVERT_TARGET_LABEL[target]}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" loading={formState.isSubmitting} onClick={handleSubmit(submit)}>
            Convert to {RISK_CONVERT_TARGET_LABEL[target]}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {/* What is about to happen — stated before the fields, not buried. */}
        <div className="flex gap-2 rounded-lg p-3" style={{ background: "var(--warning-bg)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} aria-hidden="true" />
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            This creates a <strong>real {RISK_CONVERT_TARGET_LABEL[target]}</strong> with its normal workflow.
            {" "}<strong>{riskRef}</strong> will be marked <Badge variant="purple">Converted</Badge> — a terminal
            status — and linked to the new record. It cannot be converted again or edited afterwards.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* ── Gap ── */}
          {target === "Gap" && (
            <>
              <div className="col-span-2">
                <label htmlFor="cv-requirement" className={LABEL} style={{ color: "var(--text-muted)" }}>Requirement *</label>
                <textarea id="cv-requirement" rows={2} className="input text-[12px] resize-none"
                  {...register("requirement", { required: "Requirement is required", minLength: { value: 10, message: "At least 10 characters" } })} />
                {formState.errors.requirement && <p role="alert" className={ERR}>{formState.errors.requirement.message}</p>}
              </div>
              <div className="col-span-2">
                <label htmlFor="cv-purpose" className={LABEL} style={{ color: "var(--text-muted)" }}>Purpose</label>
                <textarea id="cv-purpose" rows={2} className="input text-[12px] resize-none" {...register("purpose")} />
              </div>
            </>
          )}

          {/* ── Deviation + CAPA share title/description ── */}
          {target !== "Gap" && (
            <>
              <div className="col-span-2">
                <label htmlFor="cv-title" className={LABEL} style={{ color: "var(--text-muted)" }}>Title *</label>
                <input id="cv-title" className="input text-[12px]"
                  {...register("title", {
                    required: "Title is required",
                    minLength: { value: target === "Deviation" ? 5 : 1, message: "At least 5 characters" },
                    maxLength: target === "CAPA" ? { value: 120, message: "120 characters or fewer" } : undefined,
                  })} />
                {formState.errors.title && <p role="alert" className={ERR}>{formState.errors.title.message}</p>}
              </div>
              <div className="col-span-2">
                <label htmlFor="cv-description" className={LABEL} style={{ color: "var(--text-muted)" }}>Description *</label>
                <textarea id="cv-description" rows={3} className="input text-[12px] resize-none"
                  {...register("description", { required: "Description is required", minLength: { value: 10, message: "At least 10 characters" } })} />
                {formState.errors.description && <p role="alert" className={ERR}>{formState.errors.description.message}</p>}
              </div>
            </>
          )}

          {/* ── Severity ── */}
          {target === "Deviation" ? (
            <div>
              <label className={LABEL} style={{ color: "var(--text-muted)" }}>Severity *</label>
              <Controller name="fdaSeverity" control={control} rules={{ required: true }}
                render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={opts(["Critical", "Major", "Minor"])} />} />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Mapped from risk severity <strong>{risk.severity}</strong> (deviations use the FDA scale). Rounded up, never down.
              </p>
            </div>
          ) : (
            <div>
              <label className={LABEL} style={{ color: "var(--text-muted)" }}>
                {target === "CAPA" ? "Risk level *" : "Severity *"}
              </label>
              <Controller name="severity" control={control} rules={{ required: true }}
                render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={opts(RISK_SEVERITIES)} />} />
            </div>
          )}

          {/* ── Area (Gap + Deviation) ── */}
          {target !== "CAPA" && (
            <div>
              <label className={LABEL} style={{ color: "var(--text-muted)" }}>Area *</label>
              <Controller name="area" control={control} rules={{ required: "Area is required" }}
                render={({ field }) => (
                  <Dropdown value={field.value} onChange={field.onChange} placeholder="Select area" width="w-full"
                    options={opts(target === "Gap" ? GAP_AREAS : DEVIATION_AREAS)} />
                )} />
              {formState.errors.area && <p role="alert" className={ERR}>{formState.errors.area.message}</p>}
            </div>
          )}

          {/* ── Deviation-only ── */}
          {target === "Deviation" && (
            <>
              <div>
                <label className={LABEL} style={{ color: "var(--text-muted)" }}>Type *</label>
                <Controller name="type" control={control} rules={{ required: true }}
                  render={({ field }) => (
                    <Dropdown value={field.value} onChange={field.onChange} width="w-full"
                      options={DEVIATION_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
                  )} />
              </div>
              <div>
                <label className={LABEL} style={{ color: "var(--text-muted)" }}>Category *</label>
                <Controller name="category" control={control} rules={{ required: true }}
                  render={({ field }) => (
                    <Dropdown value={field.value} onChange={field.onChange} width="w-full"
                      options={DEVIATION_CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))} />
                  )} />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Seeded from risk category <strong>{risk.category}</strong>.
                </p>
              </div>
              <div className="col-span-2">
                <label htmlFor="cv-immediate" className={LABEL} style={{ color: "var(--text-muted)" }}>Immediate action *</label>
                <textarea id="cv-immediate" rows={2} className="input text-[12px] resize-none"
                  placeholder="What was done straight away to contain this?"
                  {...register("immediateAction", { required: "Immediate action is required", minLength: { value: 5, message: "At least 5 characters" } })} />
                {formState.errors.immediateAction && <p role="alert" className={ERR}>{formState.errors.immediateAction.message}</p>}
                <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  {risk.mitigationPlan ? "Seeded from the risk's mitigation plan." : "The risk has no mitigation plan — state the containment."}
                </p>
              </div>
            </>
          )}

          {/* ── Due / target date ── */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>
              {target === "Gap" ? "Target date *" : "Due date *"}
            </label>
            <Controller name="dueDate" control={control} rules={{ required: "Date is required" }}
              render={({ field }) => (
                <DatePicker id="cv-due" value={field.value ?? ""} onChange={field.onChange}
                  min={new Date().toISOString().slice(0, 10)} error={formState.errors.dueDate?.message} />
              )} />
          </div>
        </div>

        {/* ── Document carry-over ── */}
        <div className="pt-3 border-t border-(--bg-border)">
          {canCopyDocs ? (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 mt-0.5 cursor-pointer accent-(--brand)"
                checked={copyDocuments} onChange={(e) => setValue("copyDocuments", e.target.checked)} />
              <span className="text-[12px]" style={{ color: "var(--text-primary)" }}>
                Copy the risk&apos;s {documentCount} supporting document{documentCount === 1 ? "" : "s"} to the new {RISK_CONVERT_TARGET_LABEL[target]}
                <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                  The originals stay on the risk. Copies reference the same stored file, so nothing is duplicated on disk.
                </span>
              </span>
            </label>
          ) : TARGET_SUPPORTS_DOC_CARRYOVER[target] ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>This risk has no supporting documents to copy.</p>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              <strong>Documents are not copied to a CAPA.</strong> {CAPA_DOC_CARRYOVER_REASON}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="text-[11px] text-[#ef4444] p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** The risk → target seed. Mirrors the mapping documented in constants/riskConversion.ts. */
function seedValues(risk: RiskListRow, target: RiskConvertTarget): ConvertFormValues {
  const sev = risk.severity as RiskSeverity;
  // A Finding's `requirement` needs ≥10 chars but a Risk title only needs 3, so a
  // terse title would seed a form that cannot submit. Fall back to title + description.
  const requirement = risk.title.trim().length >= 10 ? risk.title : `${risk.title}: ${risk.description}`;
  return {
    requirement,
    purpose: risk.description,
    title: target === "CAPA" ? risk.title.slice(0, 120) : risk.title,
    description: risk.description,
    type: RISK_TO_DEVIATION_TYPE,
    category: RISK_CATEGORY_TO_DEVIATION_CATEGORY[risk.category] ?? "other",
    fdaSeverity: RISK_SEVERITY_TO_FDA[sev] ?? "Major",
    immediateAction: risk.mitigationPlan ?? "",
    area: "",
    severity: risk.severity,
    dueDate: seedDueDate(risk.targetDate, new Date()),
    copyDocuments: false,
  };
}
