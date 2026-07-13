"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { CategorizedDocUploader, type DocUploadEntry } from "@/components/shared/CategorizedDocUploader";
import { roleLabel } from "@/lib/labels/roles";
import dayjs from "@/lib/dayjs";
import {
  RISK_CATEGORIES,
  RISK_CATEGORY_LABEL,
  RISK_SEVERITIES,
  RISK_LIKELIHOODS,
  RISK_LIKELIHOOD_LABEL,
  RISK_STATUSES,
  RISK_STATUS_TRANSITIONS,
  RISK_DOC_CATEGORIES,
  RISK_DOC_CATEGORY_LABEL,
  type RiskStatus,
} from "@/constants/risk";
import type { RiskListRow } from "@/lib/queries/risks";
import type { WorklistDoc } from "@/lib/queries/worklist";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
const ERR = "text-[11px] text-[#ef4444] mt-1";

export interface RiskOwnerOption {
  id: string;
  name: string;
  role: string;
}
export interface RiskSiteOption {
  id: string;
  name: string;
}

interface RiskFormValues {
  title: string;
  description: string;
  category: string;
  severity: string;
  likelihood: string;
  status: string;
  ownerId: string;
  siteId: string;
  targetDate: string;
  mitigationPlan: string;
}

export interface RiskModalProps {
  open: boolean;
  onClose: () => void;
  /** null = create mode; a row = edit mode. */
  risk: RiskListRow | null;
  owners: RiskOwnerOption[];
  sites: RiskSiteOption[];
  /** Existing supporting docs (edit mode only). */
  docs?: WorklistDoc[];
  onSubmit: (values: RiskFormValues) => Promise<{ success: boolean; error?: string }>;
  /** Batch upload of staged docs. Create mode defers upload until after save. */
  onUploadDocs?: (entries: DocUploadEntry[]) => Promise<{ success: boolean; error?: string }>;
  onRemoveDoc?: (docId: string) => Promise<{ success: boolean; error?: string }>;
}

const CATEGORY_OPTIONS = RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABEL[c] }));
const SEVERITY_OPTIONS = RISK_SEVERITIES.map((s) => ({ value: s, label: s }));
const LIKELIHOOD_OPTIONS = RISK_LIKELIHOODS.map((l) => ({ value: l, label: RISK_LIKELIHOOD_LABEL[l] }));
// Pass the RAW stored values (the server validates against RISK_DOC_CATEGORIES)
// and hand the uploader the label map for display.
const DOC_CATEGORIES = RISK_DOC_CATEGORIES;

/**
 * Add / Edit Risk. Built from the shared primitives only (Modal, Dropdown,
 * DatePicker, Button, CategorizedDocUploader) — no bespoke inputs.
 *
 * CREATE mode stages documents in memory and uploads them AFTER the risk row
 * exists (a doc needs a parent id). EDIT mode uploads/removes immediately via
 * the parent's server actions.
 *
 * The Status dropdown only offers LEGAL transitions from the risk's current
 * status (RISK_STATUS_TRANSITIONS), mirroring the `updateRisk` server guard —
 * "Converted" is never offered because nothing transitions into it in Phase 1.
 */
export function RiskModal({
  open, onClose, risk, owners, sites, docs = [], onSubmit, onUploadDocs, onRemoveDoc,
}: RiskModalProps) {
  const isEdit = !!risk;
  const [serverError, setServerError] = useState("");
  const [stagedDocs, setStagedDocs] = useState<DocUploadEntry[]>([]);

  const form = useForm<RiskFormValues>({
    defaultValues: {
      title: "", description: "", category: "Process", severity: "Medium",
      likelihood: "Possible", status: "Open", ownerId: "", siteId: "",
      targetDate: "", mitigationPlan: "",
    },
  });
  const { register, control, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (!open) return;
    setServerError("");
    setStagedDocs([]);
    reset(
      risk
        ? {
            title: risk.title,
            description: risk.description,
            category: risk.category,
            severity: risk.severity,
            likelihood: risk.likelihood,
            status: risk.status,
            ownerId: risk.ownerId ?? "",
            siteId: risk.siteId ?? "",
            targetDate: risk.targetDate ? dayjs.utc(risk.targetDate).format("YYYY-MM-DD") : "",
            mitigationPlan: risk.mitigationPlan ?? "",
          }
        : {
            title: "", description: "", category: "Process", severity: "Medium",
            likelihood: "Possible", status: "Open", ownerId: "", siteId: "",
            targetDate: "", mitigationPlan: "",
          },
    );
  }, [open, risk, reset]);

  /** Only legal next-statuses (plus the current one) are selectable. */
  const statusOptions = (() => {
    if (!risk) return [{ value: "Open", label: "Open" }];
    const current = risk.status as RiskStatus;
    const reachable = RISK_STATUS_TRANSITIONS[current] ?? [];
    return [current, ...reachable]
      .filter((s) => RISK_STATUSES.includes(s))
      .map((s) => ({ value: s, label: s === current ? `${s} (current)` : s }));
  })();

  async function submit(values: RiskFormValues) {
    setServerError("");
    const res = await onSubmit(values);
    if (!res.success) {
      setServerError(res.error || "Failed to save risk.");
      return;
    }
    // Create mode: the parent uploads the staged docs once it has the new id.
    if (!isEdit && stagedDocs.length > 0 && onUploadDocs) {
      const up = await onUploadDocs(stagedDocs);
      if (!up.success) {
        setServerError(up.error || "Risk saved, but some documents failed to upload.");
        return;
      }
    }
    onClose();
  }

  /** CREATE mode: stage in memory, render as pseudo-docs, upload after save. */
  const stagedAsDocs: WorklistDoc[] = stagedDocs.map((e, i) => ({
    id: `staged-${i}`,
    fileName: e.file.name,
    fileType: e.file.type || null,
    fileExtension: e.file.name.includes(".") ? e.file.name.split(".").pop() ?? null : null,
    fileSize: `${Math.max(1, Math.round(e.file.size / 1024))} KB`,
    uploadedBy: "Pending upload",
    uploadedAt: new Date(0).toISOString(),
    category: e.category,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit Risk — ${risk?.reference ?? ""}` : "Add Risk"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" loading={formState.isSubmitting} onClick={handleSubmit(submit)}>
            {isEdit ? "Save changes" : "Add risk"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Title */}
          <div className="col-span-2">
            <label htmlFor="risk-title" className={LABEL} style={{ color: "var(--text-muted)" }}>Title *</label>
            <input
              id="risk-title" className="input text-[12px]"
              placeholder="e.g. Single-source API supplier has no qualified backup"
              {...register("title", {
                required: "Title is required",
                minLength: { value: 3, message: "Title must be at least 3 characters" },
              })}
            />
            {formState.errors.title && <p role="alert" className={ERR}>{formState.errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="col-span-2">
            <label htmlFor="risk-desc" className={LABEL} style={{ color: "var(--text-muted)" }}>Description *</label>
            <textarea
              id="risk-desc" rows={3} className="input text-[12px] resize-none"
              placeholder="What could go wrong, and what would the impact be?"
              {...register("description", {
                required: "Description is required",
                minLength: { value: 5, message: "Description must be at least 5 characters" },
              })}
            />
            {formState.errors.description && <p role="alert" className={ERR}>{formState.errors.description.message}</p>}
          </div>

          {/* Category */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Category *</label>
            <Controller
              name="category" control={control} rules={{ required: "Category is required" }}
              render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={CATEGORY_OPTIONS} />
              )}
            />
          </div>

          {/* Severity */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Severity *</label>
            <Controller
              name="severity" control={control} rules={{ required: "Severity is required" }}
              render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={SEVERITY_OPTIONS} />
              )}
            />
          </div>

          {/* Likelihood */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Likelihood *</label>
            <Controller
              name="likelihood" control={control} rules={{ required: "Likelihood is required" }}
              render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={LIKELIHOOD_OPTIONS} />
              )}
            />
          </div>

          {/* Status — edit mode only; create is always Open. */}
          {isEdit ? (
            <div>
              <label className={LABEL} style={{ color: "var(--text-muted)" }}>Status</label>
              <Controller
                name="status" control={control}
                render={({ field }) => (
                  <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={statusOptions} />
                )}
              />
            </div>
          ) : (
            <div>
              <label className={LABEL} style={{ color: "var(--text-muted)" }}>Status</label>
              <p className="text-[12px] pt-2" style={{ color: "var(--text-secondary)" }}>
                Open <span className="text-[10px] italic">(new risks always start Open)</span>
              </p>
            </div>
          )}

          {/* Owner */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Owner *</label>
            <Controller
              name="ownerId" control={control} rules={{ required: "Owner is required" }}
              render={({ field }) => (
                <Dropdown
                  value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full"
                  options={owners.map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))}
                />
              )}
            />
            {formState.errors.ownerId && <p role="alert" className={ERR}>{formState.errors.ownerId.message}</p>}
          </div>

          {/* Site — drives the <SITE> segment of the reference. */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Site</label>
            <Controller
              name="siteId" control={control}
              render={({ field }) => (
                <Dropdown
                  value={field.value} onChange={field.onChange} placeholder="Tenant-level (no site)" width="w-full"
                  options={[{ value: "", label: "— Tenant-level (no site)" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
                />
              )}
            />
          </div>

          {/* Target date */}
          <div>
            <label className={LABEL} style={{ color: "var(--text-muted)" }}>Target date</label>
            <Controller
              name="targetDate" control={control}
              render={({ field }) => (
                <DatePicker id="risk-target" value={field.value ?? ""} onChange={field.onChange} placeholder="Select date" className="w-full" />
              )}
            />
          </div>

          {/* Mitigation plan */}
          <div className="col-span-2">
            <label htmlFor="risk-mitigation" className={LABEL} style={{ color: "var(--text-muted)" }}>Mitigation plan</label>
            <textarea
              id="risk-mitigation" rows={3} className="input text-[12px] resize-none"
              placeholder="How will this risk be reduced or controlled?"
              {...register("mitigationPlan")}
            />
          </div>
        </div>

        {/* Supporting documents */}
        <div className="pt-3 border-t border-(--bg-border)">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
            Supporting documents
          </p>
          {isEdit ? (
            <CategorizedDocUploader
              docs={docs}
              categories={DOC_CATEGORIES}
              categoryLabels={RISK_DOC_CATEGORY_LABEL}
              emptyText="No documents attached yet — use Add Document to attach one or more."
              onUpload={onUploadDocs}
              onRemove={onRemoveDoc}
            />
          ) : (
            <CategorizedDocUploader
              docs={stagedAsDocs}
              categories={DOC_CATEGORIES}
              categoryLabels={RISK_DOC_CATEGORY_LABEL}
              emptyText="No documents staged — attach one or more; they upload when the risk is saved."
              onUpload={async (entries) => {
                setStagedDocs((prev) => [...prev, ...entries]);
                return { success: true };
              }}
              onRemove={async (docId) => {
                const idx = Number(docId.replace("staged-", ""));
                setStagedDocs((prev) => prev.filter((_, i) => i !== idx));
                return { success: true };
              }}
            />
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
