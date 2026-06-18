import { useEffect, useState } from "react";
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
import { RcaMethodFields, rcaDetailToText, type RcaDetail } from "./components/RcaMethodFields";
import type { LinkableRecord } from "@/lib/queries/capas";
import { CAPA_RCA_METHODS, rcaMethodOptions } from "@/constants/rcaMethods";

// Phase A field set + Batch 2 method-driven RCA (optional at creation).
const capaSchema = z.object({
  title: z.string().min(1, "Title required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(10, "Description required"),
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"]),
  findingId: z.string().optional(),
  deviationId: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  siteId: z.string().min(1, "Site required"),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date required"),
  diGate: z.boolean(),
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rca: z.string().optional(),
  rcaDetail: z.string().optional(),
});
type CAPAForm = z.infer<typeof capaSchema>;

interface AddCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CAPAForm) => void;
  users: UserConfig[];
  sites: SiteConfig[];  lockedSiteId?: string | null;
  defaultDescription?: string;
  defaultSource?: CAPAForm["source"];
  defaultDiGate?: boolean;
  defaultRisk?: CAPAForm["risk"];
  /** Batch 2b — open linkable records for the source picker. */
  gapFindings?: LinkableRecord[];
  deviations?: LinkableRecord[];
}

export function AddCAPAModal({ isOpen, onClose, onSave, users, sites, lockedSiteId, defaultDescription, defaultSource, defaultDiGate, defaultRisk, gapFindings = [], deviations = [] }: AddCAPAModalProps) {
  const { register: reg, handleSubmit, reset, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<CAPAForm>({
    resolver: zodResolver(capaSchema),
    defaultValues: { title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "" },
  });
  const [detail, setDetail] = useState<RcaDetail>({});
  const [descTouched, setDescTouched] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const method = watch("rcaMethod");
  const source = watch("source");
  const siteId = watch("siteId");
  // Feature 5 — problem context for the AI Draft helper on the RCA field.
  const draftTitle = watch("title");
  const draftDescription = watch("description");
  const descReg = reg("description");

  // Batch 2b #3 — source-aware linkable records (OPEN + selected-site only).
  const recordsForSource: LinkableRecord[] =
    source === "Gap Assessment" ? gapFindings : source === "Deviation" ? deviations : [];
  const records = recordsForSource.filter((r) => (siteId ? r.siteId === siteId : false));
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
      reset({ title: "", source: defaultSource ?? "Gap Assessment", risk: defaultRisk ?? "High", siteId: lockedSiteId ?? "", diGate: defaultDiGate ?? false, description: defaultDescription ?? "", owner: "", dueDate: "" });
      setDetail({});
      setDescTouched(false);
      setSelectedRecordId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSource, defaultRisk, defaultDiGate, defaultDescription, lockedSiteId]);

  // Changing Source (or site) drops a stale record selection + link fields.
  useEffect(() => {
    setSelectedRecordId("");
    setValue("findingId", undefined);
    setValue("deviationId", undefined);
  }, [source, siteId, setValue]);

  function onSubmit(data: CAPAForm) {
    const rcaText = data.rcaMethod ? rcaDetailToText(data.rcaMethod, detail) : "";
    onSave({ ...data, rca: rcaText || undefined, rcaDetail: data.rcaMethod ? JSON.stringify(detail) : undefined });
    reset();
    setDetail({}); setDescTouched(false); setSelectedRecordId("");
  }

  function handleClose() {
    onClose();
    reset();
    setDetail({}); setDescTouched(false); setSelectedRecordId("");
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
            <input id="capa-title" type="text" maxLength={120} className="input text-[12px]" placeholder="Short summary (e.g. Filter housing seal qualification interval revision)" {...reg("title")} />
            {errors.title && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.title.message}</p>}
          </div>
          <div className="col-span-2">
            <label htmlFor="capa-desc" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Description <span className="text-(--danger)">*</span></label>
            <textarea id="capa-desc" rows={3} className="input text-[12px] resize-none" placeholder="Describe the issue..." {...descReg} onChange={(e) => { descReg.onChange(e); setDescTouched(true); }} />
            {errors.description && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.description.message}</p>}
          </div>
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Source <span className="text-(--danger)">*</span></p><Controller name="source" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "483", label: "FDA 483" }, { value: "Internal Audit", label: "Internal Audit" }, { value: "Deviation", label: "Deviation" }, { value: "Complaint", label: "Complaint" }, { value: "OOS", label: "OOS" }, { value: "Change Control", label: "Change Control" }, { value: "Gap Assessment", label: "Gap Assessment" }]} />} /></div>
          {/* Batch 2b #3 — source-aware linked record: dropdown of OPEN, same-site
              records for Gap/Deviation; external sources have no linked record. */}
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Linked {source === "Deviation" ? "deviation" : "finding"} {showRecordPicker ? "(optional)" : ""}</p>
            {showRecordPicker ? (
              !siteId ? (
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
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk <span className="text-(--danger)">*</span></p><Controller name="risk" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={[{ value: "Critical", label: "Critical" }, { value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} />} /></div>
          {!lockedSiteId && (
            <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Site <span className="text-(--danger)">*</span></p><Controller name="siteId" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select site" width="w-full" options={sites.filter((s) => s.status === "Active").map((s) => ({ value: s.id, label: s.name }))} />} />{errors.siteId && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.siteId.message}</p>}</div>
          )}
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Assigned to</p><Controller name="owner" control={control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select driver (optional)" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} />{errors.owner && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.owner.message}</p>}</div>
          <div><label htmlFor="capa-due" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Due date <span className="text-(--danger)">*</span></label><input id="capa-due" type="date" className="input text-[12px]" {...reg("dueDate")} />{errors.dueDate && <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.dueDate.message}</p>}</div>

          <div className={clsx("col-span-2 flex items-center justify-between p-3 rounded-lg border", "bg-(--bg-surface) border-(--bg-border)")}>
            <Controller name="diGate" control={control} render={({ field }) => <Toggle id="di-toggle" checked={field.value} onChange={field.onChange} label="DI gate required" description="Data integrity review needed" />} />
          </div>
        </div>

        {/* Batch 2 — optional method-driven RCA at creation (also editable later). */}
        <div className="border-t pt-4" style={{ borderColor: "var(--bg-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Root cause analysis <span className="font-normal normal-case tracking-normal">(optional)</span></p>
          <div className="mb-3">
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">RCA method</p>
            <Controller name="rcaMethod" control={control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select method..." width="w-full" options={rcaMethodOptions(CAPA_RCA_METHODS)} />} />
          </div>
          <RcaMethodFields
            method={method}
            detail={detail}
            onChange={setDetail}
            draftContext={[draftTitle, draftDescription].filter(Boolean).join("\n\n")}
          />
        </div>
      </form>
    </Modal>
  );
}

export type { CAPAForm };
