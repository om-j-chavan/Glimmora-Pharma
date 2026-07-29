import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import { Save, Lock } from "lucide-react";
import type { UserConfig, SiteConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/ui/DatePicker";
import type { LinkableRecord } from "@/lib/queries/capas";
import { canCreateAcrossSites } from "@/lib/permissions/roleSets";
import { CAPA_TITLE_MIN, CAPA_TITLE_MAX, CAPA_DESCRIPTION_MIN } from "@/constants/capaValidation";
import { RISK_DUE_DATE_OFFSET_DAYS } from "@/lib/capa-approvals";
import { useAppSelector } from "@/hooks/useAppSelector";
import { roleLabel } from "@/lib/labels/roles";

// Phase A field set + Batch 2 method-driven RCA (optional at creation).
// siteId is OPTIONAL on the base schema: only super_admin / customer_admin see
// and pick the Site field (crossSiteCapaSchema makes it required for them);
// every other role has it hidden and the server auto-sets it from their site.
const capaSchema = z.object({
  title: z.string().min(CAPA_TITLE_MIN, `Title must be at least ${CAPA_TITLE_MIN} characters`).max(CAPA_TITLE_MAX, `Title must be ${CAPA_TITLE_MAX} characters or fewer`),
  description: z.string().min(CAPA_DESCRIPTION_MIN, `Description must be at least ${CAPA_DESCRIPTION_MIN} characters`),
  // Phase 7 — "Change Control" removed: the CC module is hidden app-wide and it
  // mapped to "Other" server-side anyway (a dead duplicate). "OOS" is kept even
  // though it also maps to "Other": it's a real source, and offering it records
  // the fact where dropping it would lose it entirely (debt: no OOS server enum).
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Gap Assessment"]),
  findingId: z.string().optional(),
  deviationId: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  siteId: z.string().optional(),
  dueDate: z.string().min(1, "Due date required"),
  diGate: z.boolean(),
});
type CAPAForm = z.infer<typeof capaSchema>;
/** Cross-site authors (super_admin / customer_admin) must pick a Site. */
const crossSiteCapaSchema = capaSchema.extend({ siteId: z.string().min(1, "Site required") });

interface AddCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CAPAForm) => void;
  users: UserConfig[];
  sites: SiteConfig[];
  /** Current user's role — drives the shared Site-field-visibility rule. */
  currentUserRole: string;
  /** Current user's own assigned site. Used to scope the linked-record picker
   *  for single-site authors (who don't see the Site field). */
  currentUserSiteId?: string | null;
  defaultDescription?: string;
  defaultSource?: CAPAForm["source"];
  defaultDiGate?: boolean;
  defaultRisk?: CAPAForm["risk"];
  /** Batch 2b — open linkable records for the source picker. */
  gapFindings?: LinkableRecord[];
  deviations?: LinkableRecord[];
}

// Phase 7 — `users` is intentionally no longer destructured: the manual
// "Assigned to" picker was removed (the owner is always the QA creator), so the
// user list is unused here. The prop stays on the interface for call-site
// compatibility.
export function AddCAPAModal({ isOpen, onClose, onSave, sites, currentUserRole, currentUserSiteId, defaultDescription, defaultSource, defaultDiGate, defaultRisk, gapFindings = [], deviations = [] }: AddCAPAModalProps) {
  // Site-field rule (shared): only super_admin / customer_admin see and MUST
  // pick a Site; every other role has it hidden + server auto-set from their site.
  const crossSite = canCreateAcrossSites(currentUserRole);
  // Phase 7 — the CAPA owner IS the creator (QA); shown read-only below, never a
  // picker. The server (createCAPA) sets ownerId = actor.userId to match.
  const currentUser = useAppSelector((s) => s.auth.user);
  const { register: reg, handleSubmit, reset, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<CAPAForm>({
    resolver: zodResolver(crossSite ? crossSiteCapaSchema : capaSchema),
    // Phase 7 — risk has NO blanket default: forcing the choice is the point (a
    // silent "High" was mis-classifying CAPAs). An explicit defaultRisk carried
    // from the source record is still honored; only the "?? High" fallback is gone.
    defaultValues: { title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk, siteId: "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "", dueDate: "" },
  });
  const [descTouched, setDescTouched] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const source = watch("source");
  const siteId = watch("siteId");
  const risk = watch("risk");
  const descReg = reg("description");
  // Phase 7 — Source is LOCKED to "Gap Assessment" once a finding is linked: the
  // finding determines the source and the server refuses to change it later
  // (Phase 3 source lock), so the modal must not offer a dropdown the server
  // would reject. External sources (no linked record) stay freely selectable.
  const sourceLocked = source === "Gap Assessment" && Boolean(selectedRecordId);
  // Future-only floor for the Due date picker (today, "YYYY-MM-DD").
  const todayISO = new Date().toISOString().slice(0, 10);

  // Batch 2b #3 — source-aware linkable records (OPEN + scoped-site only).
  // Cross-site authors scope by the site they pick; single-site authors (Site
  // field hidden) scope by their OWN assigned site, so the picker keeps working
  // without a visible Site field.
  const pickerSiteId = crossSite ? (siteId ?? "") : (currentUserSiteId ?? "");
  const recordsForSource: LinkableRecord[] =
    source === "Gap Assessment" ? gapFindings : source === "Deviation" ? deviations : [];
  const records = recordsForSource.filter((r) => (pickerSiteId ? r.siteId === pickerSiteId : false));
  const showRecordPicker = source === "Gap Assessment" || source === "Deviation";

  function handlePickRecord(id: string) {
    setSelectedRecordId(id);
    const rec = records.find((r) => r.id === id);
    // Set the correct link field; clear the other.
    setValue("findingId", source === "Gap Assessment" ? id || undefined : undefined);
    setValue("deviationId", source === "Deviation" ? id || undefined : undefined);
    // Batch 2b #4 — prefill Description from the record unless the user edited it.
    if (rec && !descTouched) setValue("description", rec.text);
  }

  useEffect(() => {
    if (isOpen) {
      reset({ title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk, siteId: "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "", dueDate: "" });
      setDescTouched(false);
      setSelectedRecordId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSource, defaultRisk, defaultDiGate, defaultDescription]);

  // Changing Source (or site) drops a stale record selection + link fields.
  useEffect(() => {
    setSelectedRecordId("");
    setValue("findingId", undefined);
    setValue("deviationId", undefined);
  }, [source, siteId, setValue]);

  // Phase 7 — pre-fill Due date from the SAME server constant the create action
  // uses when dueDate is omitted (RISK_DUE_DATE_OFFSET_DAYS), so the default the
  // user sees matches what the server would compute — no client re-implementation
  // of the offset. Fires when risk is (re)chosen; the user can still override the
  // date afterwards (until they change risk again).
  useEffect(() => {
    if (!risk) return;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + RISK_DUE_DATE_OFFSET_DAYS[risk]);
    setValue("dueDate", d.toISOString().slice(0, 10));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk]);

  function onSubmit(data: CAPAForm) {
    onSave(data);
    reset();
    setDescTouched(false); setSelectedRecordId("");
  }

  function handleClose() {
    onClose();
    reset();
    setDescTouched(false); setSelectedRecordId("");
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="New CAPA"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" icon={Save} loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Create CAPA</Button>
        </div>
      }
    >
      <form id="add-capa-form" onSubmit={handleSubmit(onSubmit)} aria-label="Create new CAPA" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="capa-title" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Title <span className="text-(--danger)">*</span></label>
            <input id="capa-title" type="text" maxLength={CAPA_TITLE_MAX} className="input text-[12px]" placeholder="Short summary (e.g. Filter housing seal qualification interval revision)" {...reg("title")} />
            {errors.title && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.title.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="capa-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="capa-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the issue..." {...descReg} onChange={(e) => { descReg.onChange(e); setDescTouched(true); }} />
            {errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.description.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Source <span className="text-(--danger)">*</span></p>
            {sourceLocked ? (
              <div className="input text-[12px] flex items-center gap-1.5" style={{ opacity: 0.75 }} aria-label="Source (locked)">
                <Lock className="w-3 h-3 shrink-0" aria-hidden="true" /> Gap Assessment
                <span className="italic" style={{ color: "var(--text-muted)" }}>— set by the linked finding</span>
              </div>
            ) : (
              <Controller name="source" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "483", label: "FDA 483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />} />
            )}
          </div>
          {/* Batch 2b #3 — source-aware linked record: dropdown of OPEN, same-site
              records for Gap/Deviation; external sources have no linked record. */}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Linked {source === "Deviation" ? "deviation" : "finding"} {showRecordPicker ? "(optional)" : ""}</p>
            {showRecordPicker ? (
              !pickerSiteId ? (
                <Dropdown value="" onChange={() => undefined} width="w-full" options={[]} placeholder="Select a site first" disabled />
              ) : (
                <Dropdown value={selectedRecordId} onChange={handlePickRecord} width="w-full"
                  placeholder={records.length ? `Select ${source === "Deviation" ? "a deviation" : "a finding"}…` : "No open records for this site"}
                  options={records.map((r) => ({ value: r.id, label: `${r.reference ?? "—"} — ${r.title}` }))} />
              )
            ) : (
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>External source — no linked record (optional).</p>
            )}
          </div>
          {/* Phase 7 — Risk has NO default (placeholder, not a pre-picked "High"):
              forcing the choice is the point. Empty until chosen → zod blocks submit. */}
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p><Controller name="risk" control={control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select risk…" width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />} />{errors.risk && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.risk.message}</p>}</div>
          {crossSite && (
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p><Controller name="siteId" control={control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select site" width="w-full" options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />} />{errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}</div>
          )}
          {/* Phase 7 — Due date: FULL WIDTH, shared DatePicker, FUTURE-ONLY (min =
              today), pre-filled by risk from RISK_DUE_DATE_OFFSET_DAYS above. */}
          <div className="col-span-2"><label htmlFor="capa-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label><Controller name="dueDate" control={control} render={({ field }) => <DatePicker id="capa-due" value={field.value} onChange={field.onChange} min={todayISO} placeholder="Select a due date" />} />{errors.dueDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.dueDate.message}</p>}</div>

          <div className={clsx("col-span-2 flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={control} render={({ field }) => <Toggle id="di-toggle" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>

          {/* Phase 7 — the CAPA owner is the QA creator (read-only, not a field).
              The server sets ownerId = actor.userId to match; remediation work is
              assigned per action item in Assignments, not by picking an owner here. */}
          <p className="col-span-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            CAPA owner: <strong style={{ color: "var(--text-primary)" }}>{currentUser?.name ?? "You"}{currentUser?.role ? ` (${roleLabel(currentUser.role)})` : ""}</strong> — you own it; workers are assigned per action item.
          </p>
        </div>
      </form>
    </Modal>
  );
}

export type { CAPAForm };
