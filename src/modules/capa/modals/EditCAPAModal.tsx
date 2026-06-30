import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Lock, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";
import { LOCKED_CAPA_STATUSES } from "@/lib/evidence-lock";
import { RcaMethodFields, parseRcaDetail, rcaDetailToText, type RcaDetail } from "./components/RcaMethodFields";
import { CAPA_RCA_METHODS, rcaMethodOptions } from "@/constants/rcaMethods";

const editSchema = z.object({
  title: z.string().min(1, "Title required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  owner: z.string().min(1, "Assigned-to is required"),
  dueDate: z.string().min(1, "Due date required"),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  // Phase E-REVERT — RCA authoring restored; Batch 2 — method-driven inputs feed
  // `rca` (readable mirror) + `rcaDetail` (structured JSON, carried not registered).
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rca: z.string().optional(),
  rcaDetail: z.string().optional(),
  diGate: z.boolean(),
  diGateStatus: z.enum(["open", "cleared"]).optional(),
  diGateNotes: z.string().optional(),
  diGateReviewedBy: z.string().optional(),
  diGateReviewDate: z.string().optional(),
}).superRefine((d, ctx) => {
  // Batch 2b #2 — when the DI gate is ON: Status + Reviewed By required;
  // Notes required when the review is "cleared" (record what was verified).
  if (d.diGate) {
    if (!d.diGateStatus) ctx.addIssue({ code: "custom", path: ["diGateStatus"], message: "Required when DI gate is on" });
    if (!d.diGateReviewedBy) ctx.addIssue({ code: "custom", path: ["diGateReviewedBy"], message: "Select a reviewer" });
    if (d.diGateStatus === "cleared" && !(d.diGateNotes ?? "").trim()) ctx.addIssue({ code: "custom", path: ["diGateNotes"], message: "Record what was verified to clear the gate" });
  }
});
type EditForm = z.infer<typeof editSchema>;

interface EditCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditForm) => void;
  capa: CAPA | null;
  users: UserConfig[];}

/** Seed the structured RCA detail from the row; fall back to the flat `rca`
 *  text for rows that predate rcaDetail (so it shows in Other/Fault-Tree). */
function seedDetail(capa: CAPA): RcaDetail {
  const d = parseRcaDetail(capa.rcaDetail);
  if (Object.keys(d).length === 0 && capa.rca) return { text: capa.rca, faultTree: capa.rca };
  return d;
}

export function EditCAPAModal({ isOpen, onClose, onSave, capa, users }: EditCAPAModalProps) {
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const [detail, setDetail] = useState<RcaDetail>({});

  useEffect(() => {
    if (capa) {
      form.reset({
        title: capa.title,
        description: capa.description,
        owner: capa.owner,
        dueDate: dayjs.utc(capa.dueDate).format("YYYY-MM-DD"),
        risk: capa.risk,
        rcaMethod: capa.rcaMethod ?? undefined,
        rca: capa.rca ?? "",
        rcaDetail: capa.rcaDetail ?? undefined,
        diGate: capa.diGate,
        diGateStatus: capa.diGateStatus ?? "open",
        diGateNotes: capa.diGateNotes ?? "",
        diGateReviewedBy: capa.diGateReviewedBy ?? "",
        diGateReviewDate: capa.diGateReviewDate ?? "",
      });
      setDetail(seedDetail(capa));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capa?.id]);

  if (!capa) return null;

  const rcaLocked = LOCKED_CAPA_STATUSES.has(capa.status);
  const diOn = form.watch("diGate");
  const method = form.watch("rcaMethod");

  const handleSave = (data: EditForm) => {
    // Mirror the structured RCA into `rca`; preserve the prior text if the
    // structured fields are empty (predating rows can't be reconstructed).
    const rcaText = (data.rcaMethod ? rcaDetailToText(data.rcaMethod, detail) : "") || (capa.rca ?? "");
    const payload: EditForm = {
      ...data,
      rca: rcaText,
      rcaDetail: data.rcaMethod ? JSON.stringify(detail) : undefined,
    };
    // Batch 2b — the server stamps diGateReviewDate; don't send a client value.
    if (rcaLocked) {
      payload.rca = undefined;
      payload.rcaMethod = undefined;
      payload.rcaDetail = undefined;
    }
    onSave(payload);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Edit ${capa.reference ?? "CAPA"}`}
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Save} loading={form.formState.isSubmitting} onClick={form.handleSubmit(handleSave)}>Save changes</Button>
        </div>
      }
    >
      <form id="edit-capa-form" onSubmit={form.handleSubmit(handleSave)} aria-label="Edit CAPA" noValidate className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Basic information</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="edit-title" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Title <span className="text-(--danger)">*</span></label>
            <input id="edit-title" type="text" maxLength={120} className="input text-[12px]" {...form.register("title")} />
            {form.formState.errors.title && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.title.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="edit-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="edit-desc" rows={2} className="input text-[12px] resize-none" {...form.register("description")} />
            {form.formState.errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.description.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p>
            <Controller name="risk" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Assigned to <span className="text-(--danger)">*</span></p>
            <Controller name="owner" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select assignee" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />
            {form.formState.errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.owner.message}</p>}
          </div>
          <div>
            <label htmlFor="edit-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label>
            <input id="edit-due" type="date" className="input text-[12px]" {...form.register("dueDate")} />
          </div>
          <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={form.control} render={({ field }) => <Toggle id="edit-di" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>
        </div>

        {/* Batch 2 #2 — DI Gate detail only when the toggle is ON. Review date is
            auto-stamped on save (cleared), so no manual date field. */}
        {diOn && (
          <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>DI Gate — Data Integrity Review</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">DI Gate Status <span className="text-(--danger)">*</span></p>
                <Controller name="diGateStatus" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? "open"} onChange={field.onChange} width="w-full" options={[{ value: "open", label: "Open — review not done" }, { value: "cleared", label: "Cleared — DI review complete" }]} />
                )} />
                {form.formState.errors.diGateStatus && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.diGateStatus.message}</p>}
              </div>
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Reviewed by <span className="text-(--danger)">*</span></p>
                <Controller name="diGateReviewedBy" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select reviewer..." width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
                )} />
                {form.formState.errors.diGateReviewedBy && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.diGateReviewedBy.message}</p>}
              </div>
              <div className="col-span-2">
                <label htmlFor="edit-di-notes" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">DI review notes{form.watch("diGateStatus") === "cleared" && <span className="text-(--danger)"> *</span>}</label>
                <textarea id="edit-di-notes" rows={3} className="input text-[12px] resize-none" placeholder="e.g. Audit trail verified in all 12 LIMS modules..." {...form.register("diGateNotes")} />
                {form.formState.errors.diGateNotes && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.diGateNotes.message}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Batch 2 #1 — method-driven RCA authoring. Locked once the CAPA enters
            QA review (server enforces the same rule + auto-invalidation). */}
        <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Root cause analysis</p>
          {rcaLocked && (
            <p className="text-[11px] mb-3 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Lock className="w-3 h-3" aria-hidden="true" />
              Root cause analysis is locked once the CAPA enters QA review. Reopen to edit.
            </p>
          )}
          <div className="mb-3">
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5 flex items-center gap-1">
              RCA method{rcaLocked && <Lock className="w-3 h-3" aria-hidden="true" />}
            </p>
            <Controller name="rcaMethod" control={form.control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" disabled={rcaLocked} options={rcaMethodOptions(CAPA_RCA_METHODS)} />} />
          </div>
          <RcaMethodFields
            method={method}
            detail={detail}
            onChange={setDetail}
            disabled={rcaLocked}
            recordId={capa.id}
            draftContext={[form.watch("title"), form.watch("description")].filter(Boolean).join("\n\n")}
          />
        </div>
      </form>
    </Modal>
  );
}

export type { EditForm };
