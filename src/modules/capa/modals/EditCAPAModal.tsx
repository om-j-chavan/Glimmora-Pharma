import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";

const editSchema = z.object({
  description: z.string().min(5, "Description required"),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  risk: z.enum(["Critical", "High", "Low"]),
  rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
  rca: z.string().optional(),
  correctiveActions: z.string().optional(),
  effectivenessCheck: z.boolean(),
  diGate: z.boolean(),
  diGateStatus: z.enum(["open", "cleared"]).optional(),
  diGateNotes: z.string().optional(),
  diGateReviewedBy: z.string().optional(),
  diGateReviewDate: z.string().optional(),
});
type EditForm = z.infer<typeof editSchema>;

interface EditCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditForm) => void;
  capa: CAPA | null;
  users: UserConfig[];}

export function EditCAPAModal({ isOpen, onClose, onSave, capa, users }: EditCAPAModalProps) {
  const form = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    if (capa) {
      form.reset({
        description: capa.description,
        owner: capa.owner,
        dueDate: dayjs.utc(capa.dueDate).format("YYYY-MM-DD"),
        risk: capa.risk,
        rcaMethod: capa.rcaMethod ?? undefined,
        rca: capa.rca ?? "",
        correctiveActions: capa.correctiveActions ?? "",
        effectivenessCheck: capa.effectivenessCheck,
        diGate: capa.diGate,
        diGateStatus: capa.diGateStatus ?? "open",
        diGateNotes: capa.diGateNotes ?? "",
        diGateReviewedBy: capa.diGateReviewedBy ?? "",
        diGateReviewDate: capa.diGateReviewDate ?? "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capa?.id]);

  if (!capa) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title={`Edit ${capa.id}`} className="max-w-2xl">
      <form onSubmit={form.handleSubmit(onSave)} aria-label="Edit CAPA" noValidate className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Basic information</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="edit-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="edit-desc" rows={2} className="input text-[12px] resize-none" {...form.register("description")} />
            {form.formState.errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{form.formState.errors.description.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p>
            <Controller name="risk" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Low", label: "Low" }]} />} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p>
            <Controller name="owner" control={form.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />
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

        {/* DI Gate review section — only visible when diGate is true */}
        {form.watch("diGate") && (
          <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>DI Gate — Data Integrity Review</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">DI Gate Status <span className="text-(--danger)">*</span></p>
                <Controller name="diGateStatus" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? "open"} onChange={field.onChange} width="w-full" options={[{ value: "open", label: "Open — review not done" }, { value: "cleared", label: "Cleared — DI review complete" }]} />
                )} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Reviewed by</p>
                <Controller name="diGateReviewedBy" control={form.control} render={({ field }) => (
                  <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select reviewer..." width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
                )} />
              </div>
              <div>
                <label htmlFor="edit-di-date" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Review date</label>
                <input id="edit-di-date" type="date" className="input text-[12px]" {...form.register("diGateReviewDate")} />
              </div>
              <div className="col-span-2">
                <label htmlFor="edit-di-notes" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">DI review notes</label>
                <textarea id="edit-di-notes" rows={3} className="input text-[12px] resize-none" placeholder="e.g. Audit trail verified in all 12 LIMS modules..." {...form.register("diGateNotes")} />
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Root cause analysis</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">RCA method</p>
              <Controller name="rcaMethod" control={form.control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={[{ value: "5 Why", label: "5 Why" }, { value: "Fishbone", label: "Fishbone" }, { value: "Fault Tree", label: "Fault Tree" }, { value: "Other", label: "Other" }]} />} />
            </div>
            <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
              <Controller name="effectivenessCheck" control={form.control} render={({ field }) => <Toggle id="edit-eff" checked={field.value} onChange={field.onChange} label="Effectiveness check" description="90-day monitoring planned" />} />
            </div>
            <div className="col-span-2">
              <label htmlFor="edit-rca" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Root cause <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(required before submitting for QA review)</span></label>
              <textarea id="edit-rca" rows={4} className="input text-[12px] resize-none" placeholder="Describe the root cause..." {...form.register("rca")} />
            </div>
            <div className="col-span-2">
              <label htmlFor="edit-corrective" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Corrective actions taken</label>
              <textarea id="edit-corrective" rows={3} className="input text-[12px] resize-none" placeholder="Describe what was done to fix the issue..." {...form.register("correctiveActions")} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={form.formState.isSubmitting}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}

export type { EditForm };
