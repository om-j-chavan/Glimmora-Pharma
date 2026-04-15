import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import type { FindingSeverity, FindingStatus } from "@/store/findings.slice";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import type { GxPSystem } from "@/store/systems.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

const AREAS = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT"];

const FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};

const findingSchema = z.object({
  siteId: z.string().min(1, "Site required"),
  area: z.string().min(1, "Area required"),
  requirement: z.string().min(5, "Requirement required"),
  framework: z.string().min(1, "Framework required"),
  severity: z.enum(["Critical", "Major", "Minor"]),
  status: z.enum(["Open", "In Progress", "Closed"]),
  owner: z.string().min(1, "Owner required"),
  targetDate: z.string().min(1, "Target date required"),
  evidenceLink: z.string().optional(),
  rootCause: z.string().optional(),
  linkedSystemId: z.string().optional(),
  linkedSystemName: z.string().optional(),
});
type FindingForm = z.infer<typeof findingSchema>;

interface AddFindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FindingForm) => void;
  sites: SiteConfig[];
  users: UserConfig[];
  systems: GxPSystem[];
  activeFrameworks: string[];
  lockedSiteId?: string | null;
}

export function AddFindingModal({ isOpen, onClose, onSave, sites, users, systems, activeFrameworks, lockedSiteId }: AddFindingModalProps) {
  const { register: reg, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FindingForm>({
    resolver: zodResolver(findingSchema),
    defaultValues: { severity: "Major", status: "Open", siteId: lockedSiteId ?? "" },
  });

  // Smart default: auto-select Part 11 framework when the user picks CSV/IT area
  // (only if Part 11 is active for the tenant and framework not already set).
  const watchArea = watch("area");
  const watchFramework = watch("framework");
  useEffect(() => {
    if (watchArea === "CSV/IT" && !watchFramework && activeFrameworks.includes("p11")) {
      setValue("framework", "p11", { shouldValidate: true });
    }
  }, [watchArea, watchFramework, activeFrameworks, setValue]);

  function onSubmit(data: FindingForm) {
    onSave(data);
    reset();
  }

  function handleClose() {
    onClose();
    reset();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="Log new finding">
      <form onSubmit={handleSubmit(onSubmit)} aria-label="Add new finding" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Site — hidden for non-admin (auto-assigned from login), visible dropdown for admin */}
          {!lockedSiteId && (
            <div className="col-span-2">
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p>
              <Dropdown placeholder="Select site..." value={watch("siteId") ?? ""} onChange={(v) => setValue("siteId", v, { shouldValidate: true })} width="w-full"
                options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />
              {errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}
            </div>
          )}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Area <span className="text-(--danger)">*</span></p>
            <Dropdown placeholder="Select area..." value={watch("area") ?? ""} onChange={(v) => setValue("area", v, { shouldValidate: true })} width="w-full"
              options={AREAS.map((a) => ({ value: a, label: a }))} />
            {errors.area && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.area.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Framework <span className="text-(--danger)">*</span></p>
            <Dropdown placeholder="Select framework..." value={watch("framework") ?? ""} onChange={(v) => setValue("framework", v, { shouldValidate: true })} width="w-full"
              options={activeFrameworks.map((k) => ({ value: k, label: FRAMEWORK_LABELS[k] ?? k }))} />
            {errors.framework && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.framework.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="f-req" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Requirement <span className="text-(--danger)">*</span></label>
            <input id="f-req" type="text" className="input text-[12px]" placeholder="e.g. Annex 11 §11 — Audit trail completeness" {...reg("requirement")} />
            {errors.requirement && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.requirement.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Severity <span className="text-(--danger)">*</span></p>
            <Dropdown value={watch("severity") ?? "Major"} onChange={(v) => setValue("severity", v as FindingSeverity)} width="w-full"
              options={[{ value: "Critical", label: "Critical", badge: "C", badgeVariant: "red" as const }, { value: "Major", label: "Major", badge: "M", badgeVariant: "amber" as const }, { value: "Minor", label: "Minor" }]} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Status</p>
            <Dropdown value={watch("status") ?? "Open"} onChange={(v) => setValue("status", v as FindingStatus)} width="w-full"
              options={[{ value: "Open", label: "Open" }, { value: "In Progress", label: "In Progress" }, { value: "Closed", label: "Closed" }]} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Owner <span className="text-(--danger)">*</span></p>
            <Dropdown placeholder="Select owner..." value={watch("owner") ?? ""} onChange={(v) => setValue("owner", v, { shouldValidate: true })} width="w-full"
              options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />
            {errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}
          </div>
          <div>
            <label htmlFor="f-target" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Target date <span className="text-(--danger)">*</span></label>
            <input id="f-target" type="date" className="input text-[12px]" {...reg("targetDate")} />
            {errors.targetDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.targetDate.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="f-evidence" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Evidence link (optional)</label>
            <input id="f-evidence" type="text" className="input text-[12px]" placeholder="Document reference or URL" {...reg("evidenceLink")} />
          </div>
          {/* Linked system — shown only for CSV/IT or QC Lab areas where systems are relevant */}
          {(watch("area") === "CSV/IT" || watch("area") === "QC Lab") && (
            <div className="col-span-2">
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Linked system <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></p>
              <Dropdown
                placeholder="Select system..."
                value={watch("linkedSystemId") ?? ""}
                onChange={(v) => {
                  setValue("linkedSystemId", v);
                  setValue("linkedSystemName", systems.find((s) => s.id === v)?.name ?? "");
                }}
                width="w-full"
                options={[
                  { value: "", label: "\u2014 None" },
                  ...systems
                    .filter((s) => !watch("siteId") || s.siteId === watch("siteId"))
                    .map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Linking to a system makes the finding appear in that system&apos;s DI &amp; Audit Trail tab.
              </p>
            </div>
          )}
          <div className="col-span-2">
            <label htmlFor="f-rootcause" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Root Cause Analysis <span className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span></label>
            <textarea id="f-rootcause" rows={3} className="input text-[12px] resize-none" placeholder="What is the likely root cause of this gap?&#10;Can be updated later in CAPA Tracker." {...reg("rootCause")} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Plus} loading={isSubmitting}>Log finding</Button>
        </div>
      </form>
    </Modal>
  );
}

export type { FindingForm };
