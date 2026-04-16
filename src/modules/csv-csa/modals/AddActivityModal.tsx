import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import type { GxPSystem } from "@/store/systems.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

/* ── Schema ── */

const activitySchema = z.object({
  systemId: z.string().min(1, "System required"),
  title: z.string().min(3, "Title required"),
  type: z.enum(["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR", "Risk Assessment", "Periodic Review"]),
  status: z.enum(["Planned", "In Progress", "Complete", "Overdue"]),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  owner: z.string().min(1, "Owner required"),
});
export type ActivityForm = z.infer<typeof activitySchema>;

/* ── Props ── */

export interface AddActivityModalProps {
  open: boolean;
  systems: GxPSystem[];
  users: UserConfig[];
  onSave: (data: ActivityForm) => void;
  onClose: () => void;
}

const ALL_TYPE_OPTIONS = [
  { value: "URS", label: "URS \u2014 User Requirement Specification" },
  { value: "FS", label: "FS \u2014 Functional Specification" },
  { value: "DS", label: "DS \u2014 Design Specification" },
  { value: "IQ", label: "IQ \u2014 Installation Qualification" },
  { value: "OQ", label: "OQ \u2014 Operational Qualification" },
  { value: "PQ", label: "PQ \u2014 Performance Qualification" },
  { value: "RTR", label: "RTR \u2014 Release to Production" },
  { value: "Risk Assessment", label: "Risk Assessment" },
  { value: "Periodic Review", label: "Periodic Review" },
] as const;

export function AddActivityModal({ open, systems, users, onSave, onClose }: AddActivityModalProps) {
  const form = useForm<ActivityForm>({ resolver: zodResolver(activitySchema), defaultValues: { status: "Planned" } });

  const watchSystemId = form.watch("systemId");
  const typeOptions = useMemo(() => {
    const sys = systems.find((s) => s.id === watchSystemId);
    if (!sys) return ALL_TYPE_OPTIONS;
    const completedKeys = new Set(
      (sys.validationStages ?? [])
        .filter((s) => s.status === "complete" || s.status === "skipped")
        .map((s) => s.key as string),
    );
    return ALL_TYPE_OPTIONS.filter((o) => !completedKeys.has(o.value));
  }, [systems, watchSystemId]);

  function handleSave(data: ActivityForm) {
    onSave(data);
    form.reset();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add roadmap activity">
      <form onSubmit={form.handleSubmit(handleSave)} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>System <span aria-hidden="true">*</span></label>
            <Controller name="systemId" control={form.control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} placeholder="Select system..." width="w-full" options={systems.map((s) => ({ value: s.id, label: s.name }))} />
            )} />
            {form.formState.errors.systemId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.systemId.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="act-title" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Activity title <span aria-hidden="true">*</span></label>
            <input id="act-title" className="input text-[12px]" placeholder="e.g. LIMS IQ protocol execution" {...form.register("title")} />
            {form.formState.errors.title && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.title.message}</p>}
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Activity type *</label>
            <Controller name="type" control={form.control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} placeholder={watchSystemId ? "Select type..." : "Select system first..."} width="w-full" options={typeOptions.map((o) => ({ value: o.value, label: o.label }))} />
            )} />
            {watchSystemId && typeOptions.length < ALL_TYPE_OPTIONS.length && (
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Stages already complete or skipped are hidden.
              </p>
            )}
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Status *</label>
            <Controller name="status" control={form.control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                { value: "Planned", label: "Planned" },
                { value: "In Progress", label: "In Progress" },
                { value: "Complete", label: "Complete" },
                { value: "Overdue", label: "Overdue" },
              ]} />
            )} />
          </div>
          <div>
            <label htmlFor="act-start" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Start date *</label>
            <input id="act-start" type="date" className="input text-[12px]" {...form.register("startDate")} />
            {form.formState.errors.startDate && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.startDate.message}</p>}
          </div>
          <div>
            <label htmlFor="act-end" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>End date *</label>
            <input id="act-end" type="date" className="input text-[12px]" {...form.register("endDate")} />
            {form.formState.errors.endDate && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.endDate.message}</p>}
          </div>
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Owner *</label>
            <Controller name="owner" control={form.control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner..." width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
            )} />
            {form.formState.errors.owner && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{form.formState.errors.owner.message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={form.formState.isSubmitting}>Add activity</Button>
        </div>
      </form>
    </Modal>
  );
}
