import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem, SystemType } from "@/types/csv-csa";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

/* ── Constants ── */

const SYSTEM_TYPES: SystemType[] = ["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"];

/* ── Schema ── */

const systemSchema = z.object({
  name: z.string().min(2, "Name required"),
  type: z.enum(["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"]),
  vendor: z.string().min(1, "Vendor required"),
  version: z.string().min(1, "Version required"),
  gxpRelevance: z.enum(["Critical", "Major", "Minor"]),
  riskLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  part11Status: z.enum(["Compliant", "Non-Compliant", "In Progress", "N/A"]),
  annex11Status: z.enum(["Compliant", "Non-Compliant", "In Progress", "N/A"]),
  gamp5Category: z.enum(["1", "3", "4", "5"]),
  validationStatus: z.enum(["Validated", "In Progress", "Overdue", "Not Started"]),
  patientSafetyRisk: z.enum(["HIGH", "MEDIUM", "LOW"]),
  productQualityImpact: z.enum(["HIGH", "MEDIUM", "LOW"]),
  regulatoryExposure: z.enum(["HIGH", "MEDIUM", "LOW"]),
  diImpact: z.enum(["HIGH", "MEDIUM", "LOW"]),
  siteId: z.string().min(1, "Site required"),
  intendedUse: z.string().min(5, "Intended use required"),
  gxpScope: z.string().optional(),
  criticalFunctions: z.string().optional(),
  riskFactors: z.string().optional(),
  plannedActions: z.string().optional(),
  owner: z.string().min(1, "Owner required"),
  lastValidated: z.string().optional(),
  nextReview: z.string().optional(),
});
export type SystemForm = z.infer<typeof systemSchema>;

/* ── Props ── */

export interface EditSystemModalProps {
  open: boolean;
  system: GxPSystem | null;
  sites: SiteConfig[];
  users: UserConfig[];
  onSave: (data: SystemForm) => void;
  onClose: () => void;
}

export function EditSystemModal({ open, system, sites, users, onSave, onClose }: EditSystemModalProps) {
  const form = useForm<SystemForm>({ resolver: zodResolver(systemSchema) });

  useEffect(() => {
    if (open && system) {
      // Default risk classification from GxP relevance when the system doesn't yet have values
      const defaultLevel = system.gxpRelevance === "Critical" ? "HIGH" : system.gxpRelevance === "Major" ? "MEDIUM" : "LOW";
      form.reset({
        name: system.name, type: system.type, vendor: system.vendor,
        version: system.version, gxpRelevance: system.gxpRelevance,
        riskLevel: system.riskLevel, part11Status: system.part11Status,
        annex11Status: system.annex11Status, gamp5Category: system.gamp5Category,
        validationStatus: system.validationStatus, siteId: system.siteId,
        patientSafetyRisk: system.patientSafetyRisk ?? defaultLevel,
        productQualityImpact: system.productQualityImpact ?? defaultLevel,
        regulatoryExposure: system.regulatoryExposure ?? defaultLevel,
        diImpact: system.diImpact ?? defaultLevel,
        intendedUse: system.intendedUse, gxpScope: system.gxpScope,
        criticalFunctions: system.criticalFunctions, riskFactors: system.riskFactors,
        plannedActions: system.plannedActions, owner: system.owner,
        lastValidated: system.lastValidated ? dayjs.utc(system.lastValidated).format("YYYY-MM-DD") : "",
        nextReview: system.nextReview ? dayjs.utc(system.nextReview).format("YYYY-MM-DD") : "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, system]);

  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = form;
  const activeSites = sites.filter((s) => s.status === "Active");
  const activeUsers = users.filter((u) => u.status === "Active");

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
  const sec = (color: string, text: string) => (<div className="flex items-center gap-2 mb-3 mt-1"><div className="w-1 h-4 rounded-full" style={{ background: color }} /><p className={lbl} style={{ color: "var(--text-muted)" }}>{text}</p></div>);

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${system?.name ?? "system"}`}>
      <form onSubmit={handleSubmit(onSave)} aria-label="System form" noValidate>
        {/* Section 1 — Identity */}
        {sec("#0ea5e9", "System identity")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label htmlFor="sys-name" className={lbl} style={{ color: "var(--text-muted)" }}>System name <span aria-hidden="true">*</span></label>
            <input id="sys-name" className="input text-[12px]" placeholder="e.g. LIMS \u2014 LabVantage 8.7" {...register("name")} />
            {errors.name && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System type *</label>
            <Controller name="type" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={SYSTEM_TYPES.map((t) => ({ value: t, label: t }))} />)} />
          </div>
          <div>
            <label htmlFor="sys-vendor" className={lbl} style={{ color: "var(--text-muted)" }}>Vendor *</label>
            <input id="sys-vendor" className="input text-[12px]" placeholder="e.g. LabVantage" {...register("vendor")} />
          </div>
          <div>
            <label htmlFor="sys-ver" className={lbl} style={{ color: "var(--text-muted)" }}>Version *</label>
            <input id="sys-ver" className="input text-[12px]" placeholder="e.g. 8.7" {...register("version")} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Site *</label>
            <Controller name="siteId" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={activeSites.map((s) => ({ value: s.id, label: s.name }))} />)} />
            {errors.siteId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System owner *</label>
            <Controller name="owner" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={activeUsers.map((u) => ({ value: u.id, label: u.name }))} />)} />
          </div>
        </div>

        {/* Section 2 — Classification */}
        {sec("#6366f1", "Risk & compliance classification")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GxP relevance *</label>
            <Controller name="gxpRelevance" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Risk level *</label>
            <Controller name="riskLevel" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "HIGH", label: "HIGH" }, { value: "MEDIUM", label: "MEDIUM" }, { value: "LOW", label: "LOW" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GAMP 5 category *</label>
            <Controller name="gamp5Category" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "1", label: "Cat 1 \u2014 Infrastructure" }, { value: "3", label: "Cat 3 \u2014 Non-configured" }, { value: "4", label: "Cat 4 \u2014 Configured software" }, { value: "5", label: "Cat 5 \u2014 Custom software" }]} />)} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Cat 5 requires full IQ/OQ/PQ</p>
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Validation status *</label>
            <Controller name="validationStatus" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Validated", label: "Validated" }, { value: "In Progress", label: "In Progress" }, { value: "Overdue", label: "Overdue" }, { value: "Not Started", label: "Not Started" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>21 CFR Part 11 status</label>
            <Controller name="part11Status" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Compliant", label: "Compliant" }, { value: "Non-Compliant", label: "Non-Compliant" }, { value: "In Progress", label: "In Progress" }, { value: "N/A", label: "N/A" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>EU GMP Annex 11 status</label>
            <Controller name="annex11Status" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Compliant", label: "Compliant" }, { value: "Non-Compliant", label: "Non-Compliant" }, { value: "In Progress", label: "In Progress" }, { value: "N/A", label: "N/A" }]} />)} />
          </div>
          <div>
            <label htmlFor="sys-last-val" className={lbl} style={{ color: "var(--text-muted)" }}>Last validated</label>
            <input id="sys-last-val" type="date" className="input text-[12px]" {...register("lastValidated")} />
          </div>
          <div>
            <label htmlFor="sys-review" className={lbl} style={{ color: "var(--text-muted)" }}>Next review date</label>
            <input id="sys-review" type="date" className="input text-[12px]" {...register("nextReview")} />
          </div>
        </div>

        {/* Section 2b — Risk-based classification */}
        {sec("#a78bfa", "Risk-based classification")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Patient safety risk *</label>
            <Controller name="patientSafetyRisk" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                { value: "HIGH", label: "HIGH" },
                { value: "MEDIUM", label: "MEDIUM" },
                { value: "LOW", label: "LOW" },
              ]} />
            )} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Product quality impact *</label>
            <Controller name="productQualityImpact" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                { value: "HIGH", label: "HIGH" },
                { value: "MEDIUM", label: "MEDIUM" },
                { value: "LOW", label: "LOW" },
              ]} />
            )} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Regulatory exposure *</label>
            <Controller name="regulatoryExposure" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                { value: "HIGH", label: "HIGH" },
                { value: "MEDIUM", label: "MEDIUM" },
                { value: "LOW", label: "LOW" },
              ]} />
            )} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Data integrity impact *</label>
            <Controller name="diImpact" control={control} render={({ field }) => (
              <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[
                { value: "HIGH", label: "HIGH" },
                { value: "MEDIUM", label: "MEDIUM" },
                { value: "LOW", label: "LOW" },
              ]} />
            )} />
          </div>
        </div>

        {/* Section 3 — Detail */}
        {sec("#f59e0b", "System detail")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label htmlFor="sys-use" className={lbl} style={{ color: "var(--text-muted)" }}>Intended use *</label>
            <textarea id="sys-use" rows={2} className="input text-[12px] resize-none" placeholder="Describe what this system is used for in GxP operations..." {...register("intendedUse")} />
            {errors.intendedUse && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.intendedUse.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-scope" className={lbl} style={{ color: "var(--text-muted)" }}>GxP scope</label>
            <input id="sys-scope" className="input text-[12px]" placeholder="e.g. 21 CFR Part 11, EU GMP Annex 11, GAMP 5 Cat 4" {...register("gxpScope")} />
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-crit" className={lbl} style={{ color: "var(--text-muted)" }}>Critical GxP functions</label>
            <textarea id="sys-crit" rows={2} className="input text-[12px] resize-none" placeholder="e.g. Audit trail, electronic signatures, result entry, batch release" {...register("criticalFunctions")} />
          </div>
        </div>

        {/* Section 4 — Risk & validation plan */}
        {sec("#10b981", "Risk & validation plan")}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="sys-rf" className={lbl} style={{ color: "var(--text-muted)" }}>Risk factors</label>
            <textarea id="sys-rf" rows={3} className="input text-[12px] resize-none" placeholder={"Patient safety: High/Medium/Low \u2014 reason\nProduct quality: High/Medium/Low \u2014 reason\nDI impact: High/Medium/Low \u2014 reason\nInspection exposure: describe risk"} {...register("riskFactors")} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Appears in Risk &amp; Controls tab and inspector review</p>
          </div>
          <div className="col-span-2">
            <label htmlFor="sys-pa" className={lbl} style={{ color: "var(--text-muted)" }}>Planned validation actions</label>
            <textarea id="sys-pa" rows={3} className="input text-[12px] resize-none" placeholder={"e.g. IQ/OQ/PQ planned Q2 2026\nAudit trail remediation \u2014 CAPA-0042\nE-sig binding fix \u2014 CAPA-0043"} {...register("plannedActions")} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Appears in Validation tab and CSV Roadmap</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}
