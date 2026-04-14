import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, MapPin, Save, Lock } from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData } from "@/hooks/useTenantData";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { PlanLimitUsageBar, PlanLimitPopup, EmptyState, DataTable } from "@/components/shared";
import { addTenantSite, updateTenantSite, removeTenantSite, type TenantSiteConfig } from "@/store/auth.slice";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

const siteSchema = z.object({
  name: z.string().min(2, "Site name is required"),
  location: z.string().min(1, "Location is required"),
  gmpScope: z.string().min(1, "GMP scope is required"),
  risk: z.enum(["HIGH", "MEDIUM", "LOW"]),
  status: z.enum(["Active", "Inactive"]),
});

type SiteFormValues = z.infer<typeof siteSchema>;

const RISK_OPTIONS = [
  { value: "HIGH", label: "HIGH", badge: "HIGH", badgeVariant: "red" as const },
  { value: "MEDIUM", label: "MEDIUM", badge: "MED", badgeVariant: "amber" as const },
  { value: "LOW", label: "LOW", badge: "LOW", badgeVariant: "green" as const },
];

const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

function SiteForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitIcon,
}: {
  defaultValues: SiteFormValues;
  onSubmit: (data: SiteFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  submitIcon: typeof Plus;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="site-name"
          label="Site Name"
          required
          placeholder="e.g. Hyderabad Unit 1"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          id="site-location"
          label="Location"
          required
          placeholder="e.g. Hyderabad, India"
          error={errors.location?.message}
          {...register("location")}
        />
        <Input
          id="site-gmp-scope"
          label="GMP Scope"
          required
          placeholder="e.g. OSD, API, Biologics"
          error={errors.gmpScope?.message}
          {...register("gmpScope")}
        />
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Risk Level</p>
          <Dropdown
            options={RISK_OPTIONS}
            value={watch("risk")}
            onChange={(v) => setValue("risk", v as SiteFormValues["risk"])}
            width="w-full"
          />
        </div>
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Status</p>
          <Dropdown
            options={STATUS_OPTIONS}
            value={watch("status")}
            onChange={(v) => setValue("status", v as SiteFormValues["status"])}
            width="w-full"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-(--bg-border)">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button icon={submitIcon} type="submit" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function SitesTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { allSites: sites, tenantId } = useTenantConfig();
  useTenantData();
  const { isAtLimit, isNearLimit, getCount, getLimit, tenantPlan } = usePlanLimits();

  const siteCount = getCount("sites");
  const siteLimit = getLimit("sites");
  const atLimit = isAtLimit("sites");
  const nearLimit = isNearLimit("sites");

  const [addModal, setAddModal] = useState(false);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingSite, setEditingSite] = useState<TenantSiteConfig | null>(null);

  const [addedPopup, setAddedPopup] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [deletePopup, setDeletePopup] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<string | null>(null);

  const handleAdd = (data: SiteFormValues) => {
    dispatch(addTenantSite({ tenantId, site: { ...data, id: crypto.randomUUID() } }));
    setAddModal(false);
    setAddedPopup(true);
  };

  const openEdit = (site: TenantSiteConfig) => {
    setEditingSite(site);
    setEditModal(true);
  };

  const handleEdit = (data: SiteFormValues) => {
    if (editingSite) {
      dispatch(updateTenantSite({ tenantId, siteId: editingSite.id, patch: data }));
    }
    setEditModal(false);
    setEditingSite(null);
    setSavedPopup(true);
  };

  return (
    <section aria-labelledby="sites-heading" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2 id="sites-heading" className="text-[15px] font-semibold text-(--text-primary)">
            Sites
          </h2>
          <span className="ml-2 text-[11px] bg-(--brand-muted) text-(--brand) px-2 py-0.5 rounded-full font-semibold">
            {sites.length}
          </span>
        </div>
        {!readOnly && (
          <Button icon={atLimit ? Lock : Plus} size="sm" className={clsx(atLimit && "opacity-70")} onClick={() => { if (atLimit) { setPlanLimitOpen(true); return; } setAddModal(true); }}>
            {atLimit ? "Limit reached" : "Add site"}
          </Button>
        )}
      </div>

      {/* Usage bar */}
      <PlanLimitUsageBar icon={MapPin} label="Sites" count={siteCount} limit={siteLimit} plan={tenantPlan} atLimit={atLimit} nearLimit={nearLimit} />

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        <DataTable<TenantSiteConfig>
          variant="table-fixed"
          ariaLabel="Configured GMP sites"
          caption="List of registered facilities with risk level and status"
          keyFn={(s) => s.id}
          data={sites}
          emptyState={<EmptyState icon={MapPin} title="Add your first site" description="Sites represent your manufacturing plants, labs and facilities." hint="They are required to log findings, register systems and track compliance by location." actionLabel="Add first site" onAction={() => setAddModal(true)} readOnly={readOnly} />}
          columns={[
            { key: "name", header: "Site name", width: "w-[22%]", render: (s) => <span className="text-[12px] font-semibold text-(--text-primary) truncate">{s.name}</span> },
            { key: "location", header: "Location", width: "w-[18%]", render: (s) => <span className="text-[12px] text-(--text-primary) truncate">{s.location}</span> },
            { key: "gmpScope", header: "GMP scope", width: "w-[20%]", render: (s) => <span className="text-[12px] text-(--text-primary) truncate">{s.gmpScope}</span> },
            { key: "risk", header: "Risk", width: "w-[12%]", render: (s) => <Badge variant={s.risk === "HIGH" ? "red" : s.risk === "MEDIUM" ? "amber" : "green"}>{s.risk}</Badge> },
            { key: "status", header: "Status", width: "w-[12%]", render: (s) => <Badge variant={s.status === "Active" ? "green" : "gray"}>{s.status}</Badge> },
            ...(!readOnly ? [{ key: "actions", header: "Actions", srOnly: true, width: "w-[16%]", align: "right" as const, render: (s: TenantSiteConfig) => (
              <div className="inline-flex items-center gap-1">
                <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)} />
                <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${s.name}`} onClick={() => { setSiteToDelete(s.id); setDeletePopup(true); }} />
              </div>
            ) }] : []),
          ]}
        />
      </div>

      {/* Add modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add New Site">
        <SiteForm
          defaultValues={{ name: "", location: "", gmpScope: "", risk: "MEDIUM", status: "Active" }}
          onSubmit={handleAdd}
          onCancel={() => setAddModal(false)}
          submitLabel="Add site"
          submitIcon={Plus}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={editModal} onClose={() => { setEditModal(false); setEditingSite(null); }} title="Edit Site">
        {editingSite && (
          <SiteForm
            key={editingSite.id}
            defaultValues={{
              name: editingSite.name,
              location: editingSite.location,
              gmpScope: editingSite.gmpScope,
              risk: editingSite.risk,
              status: editingSite.status,
            }}
            onSubmit={handleEdit}
            onCancel={() => { setEditModal(false); setEditingSite(null); }}
            submitLabel="Save changes"
            submitIcon={Save}
          />
        )}
      </Modal>

      {/* Popups */}
      <PlanLimitPopup isOpen={planLimitOpen} onClose={() => setPlanLimitOpen(false)} resource="site" plan={tenantPlan} limit={siteLimit} />
      <Popup isOpen={addedPopup} variant="success" title="Site added" description="New facility is now available in all site dropdowns." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={savedPopup} variant="success" title="Site updated" description="Changes saved successfully." onDismiss={() => setSavedPopup(false)} />
      <Popup
        isOpen={deletePopup}
        variant="confirmation"
        title="Remove this site?"
        description="The site will be removed from all dropdowns and the dashboard heatmap. Existing records are preserved."
        onDismiss={() => { setDeletePopup(false); setSiteToDelete(null); }}
        actions={[
          { label: "Cancel", style: "ghost", onClick: () => { setDeletePopup(false); setSiteToDelete(null); } },
          { label: "Yes, remove", style: "primary", onClick: () => { if (siteToDelete) dispatch(removeTenantSite({ tenantId, siteId: siteToDelete })); setDeletePopup(false); setSiteToDelete(null); } },
        ]}
      />
    </section>
  );
}
