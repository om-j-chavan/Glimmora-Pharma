import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Info } from "lucide-react";
import type { GxPSystem, SystemType } from "@/types/csv-csa";
import { GAMP5_CATEGORIES } from "@/types/csv-csa";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { roleLabel } from "@/lib/labels/roles";

/* ── Constants ── */

const SYSTEM_TYPES: SystemType[] = ["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"];

/* ── Schema ──
 *
 * RUNG 2.6 — the edit modal now carries only the 8 essential identity /
 * classification attributes. Everything else has a dedicated home on the
 * detail page and is edited there:
 *   intended use / GxP scope / critical functions → Assess (inline docs)
 *   risk classification + risk factors            → Assess (Risk & controls)
 *   Part 11 / Annex 11 compliance                 → Assess (Risk & controls)
 *   planned actions                               → Execute
 *   last validated / next review                  → Execute (review editor)
 *   validation status                             → Execute / Sign Off (never typed)
 */
const systemSchema = z.object({
  name: z.string().min(2, "Name required"),
  type: z.enum(["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"]),
  vendor: z.string().min(1, "Vendor required"),
  version: z.string().min(1, "Version required"),
  gxpRelevance: z.enum(["Critical", "Major", "Minor"]),
  gamp5Category: z.enum(["1", "3", "4", "5"]),
  siteId: z.string().min(1, "Site required"),
  owner: z.string().min(1, "Owner required"),
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
      form.reset({
        name: system.name, type: system.type, vendor: system.vendor,
        version: system.version, gxpRelevance: system.gxpRelevance,
        gamp5Category: system.gamp5Category, siteId: system.siteId, owner: system.owner,
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
            <input id="sys-name" className="input text-[12px]" placeholder="e.g. LIMS — LabVantage 8.7" {...register("name")} />
            {errors.name && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System type *</label>
            <Controller name="type" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={SYSTEM_TYPES.map((t) => ({ value: t, label: t }))} />)} />
          </div>
          <div>
            <label htmlFor="sys-vendor" className={lbl} style={{ color: "var(--text-muted)" }}>Vendor *</label>
            <input id="sys-vendor" className="input text-[12px]" placeholder="e.g. LabVantage" {...register("vendor")} />
            {errors.vendor && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.vendor.message}</p>}
          </div>
          <div>
            <label htmlFor="sys-ver" className={lbl} style={{ color: "var(--text-muted)" }}>Version *</label>
            <input id="sys-ver" className="input text-[12px]" placeholder="e.g. 8.7" {...register("version")} />
            {errors.version && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.version.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>Site *</label>
            <Controller name="siteId" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={activeSites.map((s) => ({ value: s.id, label: s.name }))} />)} />
            {errors.siteId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>System owner *</label>
            <Controller name="owner" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} placeholder="Select owner" width="w-full" options={activeUsers.map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` }))} />)} />
            {errors.owner && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.owner.message}</p>}
          </div>
        </div>

        {/* Section 2 — Classification */}
        {sec("#6366f1", "Classification")}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GxP relevance *</label>
            <Controller name="gxpRelevance" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />)} />
          </div>
          <div>
            <label className={lbl} style={{ color: "var(--text-muted)" }}>GAMP 5 category *</label>
            <Controller name="gamp5Category" control={control} render={({ field }) => (<Dropdown value={field.value} onChange={field.onChange} width="w-full" options={GAMP5_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />)} />
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Cat 5 requires full IQ/OQ/PQ</p>
          </div>
        </div>

        {/* Where everything else lives now */}
        <div className="flex items-start gap-2 p-2.5 rounded-lg mb-1 text-[11px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#0ea5e9" }} aria-hidden="true" />
          <span style={{ color: "var(--text-muted)" }}>
            Intended use, risk classification, Part 11 / Annex 11 status, validation dates, and planned actions are edited directly on the detail tabs (Assess · Execute · Sign Off) — not here.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Save changes</Button>
        </div>
      </form>
    </Modal>
  );
}
