"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Save, Pencil } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { updateTenantOrg } from "@/store/auth.slice";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";

const orgSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  regulatoryRegion: z.string().min(1, "Regulatory region is required"),
});

type OrgFormValues = z.infer<typeof orgSchema>;

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "UTC", label: "UTC" },
];

const REGIONS = [
  { value: "FDA", label: "FDA (United States)" },
  { value: "EMA", label: "EMA (European Union)" },
  { value: "India", label: "India — CDSCO + WHO GMP" },
  { value: "CDSCO", label: "CDSCO (India)" },
  { value: "PMDA", label: "PMDA (Japan)" },
  { value: "TGA", label: "TGA (Australia)" },
  { value: "WHO", label: "WHO (Global)" },
  { value: "MHRA", label: "MHRA (United Kingdom)" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-(--card-muted) mb-1">{label}</p>
      <p className="text-[13px] text-(--text-primary)">
        {value || <span className="text-(--text-muted) italic">—</span>}
      </p>
    </div>
  );
}

export function OrgTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { org, tenantId } = useTenantConfig();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingData, setPendingData] = useState<OrgFormValues | null>(null);

  const orgDefaults: OrgFormValues = {
    companyName: org.companyName,
    timezone: org.timezone,
    dateFormat: org.dateFormat as OrgFormValues["dateFormat"],
    regulatoryRegion: org.regulatoryRegion,
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: orgDefaults,
  });

  useEffect(() => {
    reset(orgDefaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.companyName, org.timezone, org.dateFormat, org.regulatoryRegion]);

  const openEdit = () => { reset(orgDefaults); setEditOpen(true); };

  const onFormSubmit = (data: OrgFormValues) => {
    setPendingData(data);
    setConfirmOpen(true);
  };

  const confirmSave = () => {
    if (pendingData) dispatch(updateTenantOrg({ tenantId, patch: pendingData }));
    setConfirmOpen(false);
    setEditOpen(false);
    setPendingData(null);
    setSaved(true);
  };

  const cancelConfirm = () => { setConfirmOpen(false); setPendingData(null); };

  const tzLabel = TIMEZONES.find((t) => t.value === org.timezone)?.label ?? org.timezone;
  const regionLabel = REGIONS.find((r) => r.value === org.regulatoryRegion)?.label ?? org.regulatoryRegion;

  return (
    <section aria-labelledby="org-heading" className="w-full space-y-4">
      <h2 id="org-heading" className="sr-only">Organisation</h2>

      <div className="bg-(--card-bg) border border-(--card-border) rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--card-border)">
          <span className="text-[13px] font-semibold text-(--text-primary)">Organisation</span>
          {!readOnly && <Button icon={Pencil} size="xs" variant="ghost" onClick={openEdit}>Edit</Button>}
        </div>

        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-5">
          <Field label="Company Name" value={org.companyName} />
          <Field label="Regulatory Region" value={regionLabel} />
          <Field label="Timezone" value={tzLabel} />
          <Field label="Date Format" value={org.dateFormat} />
        </div>

        <div className="px-5 pb-4">
          <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 bg-(--brand-muted) border border-(--brand-border)">
            <Info className="w-3.5 h-3.5 text-(--brand) shrink-0 mt-px" aria-hidden="true" />
            <p className="text-[11px] text-(--brand) leading-relaxed">
              Company name appears in PDF exports, email footers, and audit certificates.
            </p>
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Organisation">
        <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4">
          <Input
            id="company-name"
            label="Company Name"
            required
            placeholder="Acme Pharma Ltd."
            error={errors.companyName?.message}
            {...register("companyName")}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
                Timezone <span className="text-(--danger)" aria-hidden="true">*</span>
              </p>
              <Dropdown
                options={TIMEZONES}
                value={watch("timezone")}
                onChange={(v) => setValue("timezone", v, { shouldValidate: true })}
                placeholder="Select timezone"
                searchable
                width="w-full"
              />
              {errors.timezone && (
                <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.timezone.message}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Date Format</p>
              <Dropdown
                options={DATE_FORMATS}
                value={watch("dateFormat")}
                onChange={(v) => setValue("dateFormat", v as OrgFormValues["dateFormat"])}
                width="w-full"
              />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
              Regulatory Region <span className="text-(--danger)" aria-hidden="true">*</span>
            </p>
            <Dropdown
              options={REGIONS}
              value={watch("regulatoryRegion")}
              onChange={(v) => setValue("regulatoryRegion", v, { shouldValidate: true })}
              placeholder="Select region"
              searchable
              width="w-full"
            />
            {errors.regulatoryRegion && (
              <p role="alert" className="text-[11px] text-(--danger) mt-1">{errors.regulatoryRegion.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-(--bg-border)">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button icon={Save} type="submit" loading={isSubmitting}>Save changes</Button>
          </div>
        </form>
      </Modal>

      <Popup
        isOpen={confirmOpen}
        variant="confirmation"
        title="Save organisation settings?"
        description="This updates company name, timezone, date format, and region across the platform."
        onDismiss={cancelConfirm}
        actions={[
          { label: "Cancel", style: "ghost", onClick: cancelConfirm },
          { label: "Yes, save", style: "primary", onClick: confirmSave },
        ]}
      />
      <Popup
        isOpen={saved}
        variant="success"
        title="Settings saved"
        description="Organisation details updated."
        onDismiss={() => setSaved(false)}
      />
    </section>
  );
}