import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Info } from "lucide-react";
import type { SystemType } from "@/types/csv-csa";
import { GAMP5_CATEGORIES } from "@/types/csv-csa";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { roleLabel } from "@/lib/labels/roles";
import { canCreateAcrossSites } from "@/lib/permissions/roleSets";

/* ── Constants ── */

const SYSTEM_TYPES: SystemType[] = ["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"];

// CSA risk-based stage preview — mirrors STAGE_TEMPLATES in src/actions/systems.ts.
// Shows which validation stages will start active vs auto-skipped for the picked
// GAMP category, so the scope is clear before the system is created.
const STAGE_PREVIEW: Record<string, string[]> = {
  "1": ["IQ"],
  "3": ["URS", "IQ", "OQ"],
  "4": ["URS", "FS", "IQ", "OQ", "PQ"],
  "5": ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"],
};

/* ── Schema ──
 *
 * Add System asks only the 8 ESSENTIAL fields. Everything else — risk
 * classification, compliance status, documentation, planning, dates — is
 * server-defaulted or auto-derived (createSystem derives the 4 risk levels +
 * riskLevel from gxpRelevance) and filled progressively on the detail page.
 * The Edit modal still carries the full field set. */
// siteId is OPTIONAL on the base schema: only super_admin / customer_admin see
// and pick the Site field (crossSiteSystemSchema makes it required for them);
// every other role has it hidden and the server auto-sets it from their site.
const addSystemSchema = z.object({
  name: z.string().min(2, "Name required"),
  type: z.enum(["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"]),
  vendor: z.string().min(1, "Vendor required"),
  version: z.string().min(1, "Version required"),
  siteId: z.string().optional(),
  owner: z.string().min(1, "Owner required"),
  gxpRelevance: z.enum(["Critical", "Major", "Minor"]),
  gamp5Category: z.enum(["1", "3", "4", "5"]),
});
export type SystemForm = z.infer<typeof addSystemSchema>;
/** Cross-site authors (super_admin / customer_admin) must pick a Site. */
const crossSiteSystemSchema = addSystemSchema.extend({ siteId: z.string().min(1, "Site required") });

/* ── Props ── */

export interface AddSystemModalProps {
  open: boolean;
  sites: SiteConfig[];
  users: UserConfig[];
  onSave: (data: SystemForm) => void;
  onClose: () => void;
  /** Current user's role — drives the shared Site-field-visibility rule. */
  currentUserRole: string;
}

export function AddSystemModal({ open, sites, users, onSave, onClose, currentUserRole }: AddSystemModalProps) {
  // Site-field rule (shared): only super_admin / customer_admin see and MUST
  // pick a Site; every other role has it hidden + server auto-set from their site.
  const crossSite = canCreateAcrossSites(currentUserRole);
  const form = useForm<SystemForm>({
    resolver: zodResolver(crossSite ? crossSiteSystemSchema : addSystemSchema),
    defaultValues: {
      type: "LIMS",
      gxpRelevance: "Major",
      gamp5Category: "4",
      siteId: "",
    },
  });

  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = form;
  const selectedCat = watch("gamp5Category");
  const activeStages = STAGE_PREVIEW[selectedCat] ?? STAGE_PREVIEW["5"];
  const skippedStages = STAGE_PREVIEW["5"].filter((s) => !activeStages.includes(s));
  const activeSites = sites.filter((s) => s.status === "Active");
  const activeUsers = users.filter((u) => u.status === "Active");

  function handleSave(data: SystemForm) {
    onSave(data);
    form.reset();
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
  const sec = (color: string, text: string) => (<div className="flex items-center gap-2 mb-3 mt-1"><div className="w-1 h-4 rounded-full" style={{ background: color }} /><p className={lbl} style={{ color: "var(--text-muted)" }}>{text}</p></div>);

  return (
    <Modal open={open} onClose={onClose} title="Add GxP system">
      <form onSubmit={handleSubmit(handleSave)} aria-label="System form" noValidate>
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
          {crossSite && (
            <div>
              <label className={lbl} style={{ color: "var(--text-muted)" }}>Site *</label>
              <Controller name="siteId" control={control} render={({ field }) => (<Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select site" width="w-full" options={activeSites.map((s) => ({ value: s.id, label: s.name }))} />)} />
              {errors.siteId && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}
            </div>
          )}
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
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--brand)" }}>Validates:</span> {activeStages.join(" · ")}
              </p>
              {skippedStages.length > 0 && (
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold">Auto-skipped:</span> {skippedStages.join(" · ")} <span className="italic">(CSA risk-based)</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Info — what gets deferred to the detail page */}
        <div className="flex items-start gap-2 p-3 rounded-lg mb-1" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Risk levels and review dates will auto-derive from GxP Relevance after creation. You can override on the system detail page along with intended use, GxP scope, and validation planning.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={Save} loading={isSubmitting}>Add system</Button>
        </div>
      </form>
    </Modal>
  );
}
