import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, MapPin, Save } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { addSite, updateSite, removeSite } from "@/store/settings.slice";
import type { SiteConfig } from "@/store/settings.slice";
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

const riskBadge: Record<string, string> = {
  HIGH: "bg-(--danger-bg) text-(--danger)",
  MEDIUM: "bg-(--warning-bg) text-(--warning)",
  LOW: "bg-(--success-bg) text-(--success)",
};

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
  const sites = useAppSelector((s) => s.settings.sites);

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteConfig | null>(null);

  const [addedPopup, setAddedPopup] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [deletePopup, setDeletePopup] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<string | null>(null);

  const handleAdd = (data: SiteFormValues) => {
    dispatch(addSite({ ...data, id: crypto.randomUUID() }));
    setAddModal(false);
    setAddedPopup(true);
  };

  const openEdit = (site: SiteConfig) => {
    setEditingSite(site);
    setEditModal(true);
  };

  const handleEdit = (data: SiteFormValues) => {
    if (editingSite) {
      dispatch(updateSite({ id: editingSite.id, patch: data }));
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
          <Button icon={Plus} size="sm" onClick={() => setAddModal(true)}>
            Add site
          </Button>
        )}
      </div>

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        {sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <MapPin className="w-8 h-8 text-(--bg-border)" aria-hidden="true" />
            <p className="text-[13px] text-(--card-muted)">No sites configured yet</p>
            <p className="text-[12px] text-(--text-muted)">Add your first GMP facility above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed" aria-label="Configured GMP sites">
              <caption className="sr-only">List of registered facilities with risk level and status</caption>
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-(--bg-border)">
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Site name</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Location</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">GMP scope</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Risk</th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Status</th>
                  {!readOnly && <th scope="col" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {sites.map((site: SiteConfig, i: number) => (
                  <tr
                    key={site.id}
                    className={`hover:bg-(--bg-surface) transition-colors ${
                      i < sites.length - 1 ? "border-b border-(--bg-border)" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[12px] font-semibold text-(--text-primary) truncate">{site.name}</td>
                    <td className="px-4 py-3 text-[12px] text-(--text-primary) truncate">{site.location}</td>
                    <td className="px-4 py-3 text-[12px] text-(--text-primary) truncate">{site.gmpScope}</td>
                    <td className="px-4 py-3 align-middle">
                      <Badge variant={site.risk === "HIGH" ? "red" : site.risk === "MEDIUM" ? "amber" : "green"}>
                        {site.risk}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Badge variant={site.status === "Active" ? "green" : "gray"}>
                        {site.status}
                      </Badge>
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${site.name}`} onClick={() => openEdit(site)} />
                          <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${site.name}`} onClick={() => { setSiteToDelete(site.id); setDeletePopup(true); }} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          { label: "Yes, remove", style: "primary", onClick: () => { if (siteToDelete) dispatch(removeSite(siteToDelete)); setDeletePopup(false); setSiteToDelete(null); } },
        ]}
      />
    </section>
  );
}
