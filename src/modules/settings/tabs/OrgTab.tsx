"use client";

import { useState, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Info, Save, Pencil, Building2, Briefcase, Globe, Clock, CalendarDays,
} from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { updateTenantOrg } from "@/store/auth.slice";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { formatDate } from "@/lib/dates";
import { RegulatoryRegionBadges } from "@/components/shared";

// Regulatory Regions are Super-Admin-owned and set per-tenant; Customer Admin
// sees them read-only here and cannot change them, so they are deliberately NOT
// part of this editable form schema.
const orgSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
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

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

/**
 * `icon` is DECORATIVE only — it labels the row visually and is `aria-hidden`,
 * so the accessible name is still the text label alone. Optional, so any future
 * caller without one renders exactly as before.
 */
function Field({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-(--card-muted) mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
        {label}
      </p>
      <p className="text-[13px] text-(--text-primary)">
        {value || <span className="text-(--text-muted) italic">—</span>}
      </p>
    </div>
  );
}

export function OrgTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { org, tenantId, orgCreatedAt } = useTenantConfig();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingData, setPendingData] = useState<OrgFormValues | null>(null);

  const orgDefaults: OrgFormValues = {
    companyName: org.companyName,
    timezone: org.timezone,
    dateFormat: org.dateFormat as OrgFormValues["dateFormat"],
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
  }, [org.companyName, org.timezone, org.dateFormat]);

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
  const regionLabelMap = useAppSelector((s) => s.regions.labelMap);

  return (
    <section aria-labelledby="org-heading" className="w-full space-y-4">
      <h2 id="org-heading" className="sr-only">Organisation</h2>

      <div className="bg-(--card-bg) border border-(--card-border) rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--card-border)">
          {/* Icon + title, matching the card headers on the sibling settings
              tabs (e.g. SubscriptionTab.tsx:97-100). Decorative only. */}
          <span className="flex items-center gap-2 text-[13px] font-semibold text-(--text-primary)">
            <Building2 className="w-4 h-4 text-(--brand)" aria-hidden="true" />
            Organisation
          </span>
          {!readOnly && <Button icon={Pencil} size="xs" variant="ghost" onClick={openEdit}>Edit</Button>}
        </div>

        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-5">
          <Field label="Company Name" value={org.companyName} icon={Briefcase} />
          {/* Regulatory Regions are assigned by the platform Super Admin and are
              deliberately absent from the edit form below — a customer_admin sees
              them, never edits them. Rendered as chips because a tenant can hold
              several. */}
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-(--card-muted) mb-1">
              <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {org.regulatoryRegions.length === 1 ? "Regulatory Region" : "Regulatory Regions"}
            </p>
            <RegulatoryRegionBadges
              values={org.regulatoryRegions}
              labelMap={regionLabelMap}
              emptyText="Not assigned"
            />
          </div>
          <Field label="Timezone" value={tzLabel} icon={Clock} />
          <Field
            label="Organization Created Date"
            value={orgCreatedAt ? formatDate(orgCreatedAt) : "—"}
            icon={CalendarDays}
          />
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

          {/* Regulatory Region is intentionally omitted here — it is Super-Admin
              owned and shown read-only on the Organisation card above. Customer
              Admin cannot change it (server also rejects any non-super_admin
              write in updateTenant). */}

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
        description="This updates company name, timezone, and date format across the platform."
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
