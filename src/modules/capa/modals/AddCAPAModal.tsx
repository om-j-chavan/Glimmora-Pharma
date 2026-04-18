import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Save } from "lucide-react";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";

const capaSchema = z.object({
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"]),
  risk: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Owner required"),
  siteId: z.string().min(1, "Site required"),
  dueDate: z.string().min(1, "Due date required"),
  description: z.string().min(10, "Description required"),
  rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
  effectivenessCheck: z.boolean(),
  diGate: z.boolean(),
  findingId: z.string().optional(),
});
type CAPAForm = z.infer<typeof capaSchema>;

interface AddCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CAPAForm) => void;
  users: UserConfig[];
  sites: SiteConfig[];  lockedSiteId?: string | null;
  defaultDescription?: string;
  defaultSource?: CAPAForm["source"];
  defaultDiGate?: boolean;
  defaultRisk?: CAPAForm["risk"];
}

export function AddCAPAModal({ isOpen, onClose, onSave, users, sites, lockedSiteId, defaultDescription, defaultSource, defaultDiGate, defaultRisk }: AddCAPAModalProps) {
  const { register: reg, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<CAPAForm>({
    resolver: zodResolver(capaSchema),
    defaultValues: { source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", effectivenessCheck: true, diGate: defaultDiGate ?? false, description: defaultDescription ?? "" },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", effectivenessCheck: true, diGate: defaultDiGate ?? false, description: defaultDescription ?? "", owner: "", dueDate: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSource, defaultRisk, defaultDiGate, defaultDescription, lockedSiteId]);

  function onSubmit(data: CAPAForm) {
    onSave(data);
    reset();
  }

  function handleClose() {
    onClose();
    reset();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="New CAPA">
      <form onSubmit={handleSubmit(onSubmit)} aria-label="Create new CAPA" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Source <span className="text-(--danger)">*</span></p><Controller name="source" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "483", label: "FDA 483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />} /></div>
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p><Controller name="risk" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Low", label: "Low" }]} />} /></div>
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p><Controller name="owner" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />{errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}</div>
          {/* Site — hidden for non-admin (auto-assigned from login), visible dropdown for admin */}
          {!lockedSiteId && (
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p><Controller name="siteId" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />} />{errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}</div>
          )}
          <div><label htmlFor="capa-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label><input id="capa-due" type="date" className="input text-[12px]" {...reg("dueDate")} />{errors.dueDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.dueDate.message}</p>}</div>
          <div className="col-span-2"><label htmlFor="capa-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label><textarea id="capa-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the issue..." {...reg("description")} />{errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.description.message}</p>}</div>
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">RCA method (optional)</p><Controller name="rcaMethod" control={control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={[{ value: "5 Why", label: "5 Why" }, { value: "Fishbone", label: "Fishbone" }, { value: "Fault Tree", label: "Fault Tree" }, { value: "Other", label: "Other" }]} />} /></div>
          <div><label htmlFor="capa-finding" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Linked finding (optional)</label><input id="capa-finding" type="text" className="input text-[12px]" placeholder="FIND-001" {...reg("findingId")} /></div>

          {/* Toggles */}
          <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="effectivenessCheck" control={control} render={({ field }) => <Toggle id="eff-toggle" checked={field.value} onChange={field.onChange} label="Effectiveness check" description="90-day post-closure monitoring" />} />
          </div>
          <div className={clsx("flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={control} render={({ field }) => <Toggle id="di-toggle" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Create CAPA</Button>
        </div>
      </form>
    </Modal>
  );
}

export type { CAPAForm };
