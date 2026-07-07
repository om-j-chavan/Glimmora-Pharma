"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, MapPin, Save, Lock } from "lucide-react";
import clsx from "clsx";
import { titleCase } from "@/lib/strings";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData } from "@/hooks/useTenantData";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import {
  PlanLimitUsageBar,
  PlanLimitPopup,
  EmptyState,
  DataTable,
} from "@/components/shared";
import {
  addTenantSite,
  updateTenantSite,
  removeTenantSite,
  type TenantSiteConfig,
} from "@/store/auth.slice";
import { createSite, updateSite, deleteSiteWithPassword } from "@/actions/settings";
import { errorCodeLabel, ERROR_CODE_LABELS } from "@/lib/labels/errorCodes";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { PasswordConfirmModal } from "@/components/ui/PasswordConfirmModal";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";

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
  {
    value: "MEDIUM",
    label: "MEDIUM",
    badge: "MED",
    badgeVariant: "amber" as const,
  },
  { value: "LOW", label: "LOW", badge: "LOW", badgeVariant: "green" as const },
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
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
            Risk Level
          </p>
          <Dropdown
            options={RISK_OPTIONS}
            value={watch("risk")}
            onChange={(v) => setValue("risk", v as SiteFormValues["risk"])}
            width="w-full"
          />
        </div>
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
            Status
          </p>
          <div className="flex items-center h-[42px]">
            <Toggle
              id="site-status"
              checked={watch("status") === "Active"}
              onChange={(v) => setValue("status", v ? "Active" : "Inactive")}
              label="Site status"
              description={watch("status") === "Active" ? "Active" : "Inactive"}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-(--bg-border)">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button icon={submitIcon} type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function SitesTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const { allSitesIncludingInactive: sites, tenantId } = useTenantConfig();
  useTenantData();
  const { isAtLimit, isNearLimit, getCount, getLimit, tenantPlan } =
    usePlanLimits();

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
  // The site pending a password-gated delete (null = dialog closed).
  const [siteToDelete, setSiteToDelete] = useState<TenantSiteConfig | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleAdd = async (data: SiteFormValues) => {
    setSyncError(null);
    // Auto-capitalize (title-case) the location on save.
    const location = titleCase(data.location);
    const result = await createSite({
      name: data.name,
      location,
      gmpScope: data.gmpScope,
      risk: data.risk,
    });
    if (!result.success) {
      console.error("[settings/sites] createSite failed:", {
        error: result.error,
        fieldErrors: result.fieldErrors,
      });
      // Cap / plan block codes (SITE_CAP_EXCEEDED, NO_PLAN_ASSIGNED, PLAN_EXPIRED)
      // get the human label; other errors (e.g. duplicate name) pass through.
      const code = result.error ?? "";
      setSyncError(code in ERROR_CODE_LABELS ? errorCodeLabel(code) : (result.error ?? "Failed to add site."));
      return;
    }
    // Server-issued id + persisted state. Mirror into Redux so the existing
    // useTenantConfig() readers update immediately, without waiting for the
    // next AppShell tenant-rehydration on relogin.
    const created = result.data as { id: string };
    dispatch(
      addTenantSite({
        tenantId,
        site: {
          id: created.id,
          name: data.name,
          location,
          gmpScope: data.gmpScope,
          risk: data.risk,
          status: data.status,
        },
      }),
    );
    setAddModal(false);
    setAddedPopup(true);
  };

  const openEdit = (site: TenantSiteConfig) => {
    setEditingSite(site);
    setEditModal(true);
  };

  const handleEdit = async (data: SiteFormValues) => {
    if (!editingSite) return;
    setSyncError(null);
    // Auto-capitalize (title-case) the location on save.
    const location = titleCase(data.location);
    const result = await updateSite(editingSite.id, {
      name: data.name,
      location,
      gmpScope: data.gmpScope,
      risk: data.risk,
      isActive: data.status === "Active",
    });
    if (!result.success) {
      console.error("[settings/sites] updateSite failed:", {
        error: result.error,
        fieldErrors: result.fieldErrors,
      });
      setSyncError(result.error ?? "Failed to save site.");
      return;
    }
    dispatch(
      updateTenantSite({ tenantId, siteId: editingSite.id, patch: { ...data, location } }),
    );
    setEditModal(false);
    setEditingSite(null);
    setSavedPopup(true);
  };

  // Row-level status toggle. Optimistic: mirror to Redux immediately, then write
  // through the existing audited updateSite action (SITE_UPDATED). Revert on
  // failure so the row never shows a status that wasn't persisted.
  const handleRowStatusToggle = async (site: TenantSiteConfig, active: boolean) => {
    setSyncError(null);
    const prevStatus = site.status;
    const nextStatus = active ? "Active" : "Inactive";
    dispatch(updateTenantSite({ tenantId, siteId: site.id, patch: { status: nextStatus } }));
    const result = await updateSite(site.id, { isActive: active });
    if (!result.success) {
      dispatch(updateTenantSite({ tenantId, siteId: site.id, patch: { status: prevStatus } }));
      setSyncError(result.error ?? "Failed to update site status.");
    }
  };

  // Password-gated delete. The dialog collects the Customer Admin password; the
  // server action verifies it server-side before the audit-first delete runs.
  const handleDeleteWithPassword = async (password: string) => {
    if (!siteToDelete) return { success: false, error: "No site selected." };
    const result = await deleteSiteWithPassword(siteToDelete.id, password);
    if (result.success) {
      dispatch(removeTenantSite({ tenantId, siteId: siteToDelete.id }));
    }
    return result;
  };

  return (
    <section aria-labelledby="sites-heading" className="space-y-6">
      {/* Header */}
      <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2
            id="sites-heading"
            className="text-[15px] font-semibold text-(--text-primary)"
          >
            Sites
          </h2>
          <span className="ml-2 text-[11px] bg-(--brand-muted) text-(--brand) px-2 py-0.5 rounded-full font-semibold">
            {sites.length}
          </span>
        </div>
        {!readOnly && (
          <Button
            icon={atLimit ? Lock : Plus}
            size="sm"
            className={clsx(atLimit && "opacity-70")}
            onClick={() => {
              if (atLimit) {
                setPlanLimitOpen(true);
                return;
              }
              setAddModal(true);
            }}
          >
            {atLimit ? "Limit reached" : "Add site"}
          </Button>
        )}
      </div>
        <p className="mt-1 text-[12px] text-(--text-secondary) max-w-2xl">
          Sites are the manufacturing plants, labs and facilities you operate.
          Manage each site&apos;s location, GMP scope, risk level and active
          status here — they feed the site pickers, the dashboard risk heatmap
          and every location-scoped compliance record across the platform.
        </p>
      </div>

      {/* Sync error banner — surfaced when a server action fails */}
      {syncError && (
        <div role="alert" className="alert alert-danger flex items-start justify-between gap-3">
          <p className="text-[12px]">{syncError}</p>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="text-[11px] underline border-none bg-transparent cursor-pointer"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Usage bar */}
      <PlanLimitUsageBar
        icon={MapPin}
        label="Sites"
        count={siteCount}
        limit={siteLimit}
        plan={tenantPlan ?? ""}
        atLimit={atLimit}
        nearLimit={nearLimit}
      />

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        <DataTable<TenantSiteConfig>
          variant="table-fixed"
          ariaLabel="Configured GMP sites"
          caption="List of registered facilities with risk level and status"
          keyFn={(s) => s.id}
          data={sites}
          emptyState={
            <EmptyState
              icon={MapPin}
              title="Add your first site"
              description="Sites represent your manufacturing plants, labs and facilities."
              hint="They are required to log findings, register systems and track compliance by location."
              actionLabel="Add first site"
              onAction={() => setAddModal(true)}
              readOnly={readOnly}
            />
          }
          columns={[
            {
              key: "name",
              header: "Site name",
              width: "w-[22%]",
              render: (s) => (
                <span className="text-[12px] font-semibold text-(--text-primary) truncate">
                  {s.name}
                </span>
              ),
            },
            {
              key: "location",
              header: "Location",
              width: "w-[18%]",
              render: (s) => (
                <span className="text-[12px] text-(--text-primary) truncate">
                  {s.location}
                </span>
              ),
            },
            {
              key: "gmpScope",
              header: "GMP scope",
              width: "w-[20%]",
              render: (s) => (
                <span className="text-[12px] text-(--text-primary) truncate">
                  {s.gmpScope}
                </span>
              ),
            },
            {
              key: "risk",
              header: "Risk",
              width: "w-[12%]",
              render: (s) => (
                <Badge variant={getSeverityVariant(s.risk, "generic")}>
                  {normalizeSeverityForDisplay(s.risk, "generic") ?? s.risk}
                </Badge>
              ),
            },
            {
              key: "status",
              header: "Status",
              width: "w-[12%]",
              render: (s) => (
                <div className="flex items-center gap-2">
                  <Toggle
                    id={`site-status-${s.id}`}
                    checked={s.status === "Active"}
                    onChange={(v) => void handleRowStatusToggle(s, v)}
                    label={`Status for ${s.name}`}
                    disabled={readOnly}
                    hideLabel
                  />
                  <Badge variant={s.status === "Active" ? "green" : "gray"}>
                    {s.status}
                  </Badge>
                </div>
              ),
            },
            ...(!readOnly
              ? [
                  {
                    key: "actions",
                    header: "Actions",
                    srOnly: true,
                    width: "w-[16%]",
                    align: "right" as const,
                    render: (s: TenantSiteConfig) => (
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Pencil}
                          aria-label={`Edit ${s.name}`}
                          onClick={() => openEdit(s)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          aria-label={`Delete ${s.name}`}
                          onClick={() => setSiteToDelete(s)}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>

      {/* Add modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="Add New Site"
      >
        <SiteForm
          defaultValues={{
            name: "",
            location: "",
            gmpScope: "",
            risk: "MEDIUM",
            status: "Active",
          }}
          onSubmit={handleAdd}
          onCancel={() => setAddModal(false)}
          submitLabel="Save"
          submitIcon={Save}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editModal}
        onClose={() => {
          setEditModal(false);
          setEditingSite(null);
        }}
        title="Edit Site"
      >
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
            onCancel={() => {
              setEditModal(false);
              setEditingSite(null);
            }}
            submitLabel="Save"
            submitIcon={Save}
          />
        )}
      </Modal>

      {/* Popups */}
      <PlanLimitPopup
        isOpen={planLimitOpen}
        onClose={() => setPlanLimitOpen(false)}
        resource="site"
        plan={tenantPlan}
        limit={siteLimit}
      />
      <Popup
        isOpen={addedPopup}
        variant="success"
        title="Site added"
        description="New facility is now available in all site dropdowns."
        onDismiss={() => setAddedPopup(false)}
      />
      <Popup
        isOpen={savedPopup}
        variant="success"
        title="Site updated"
        description="Changes saved successfully."
        onDismiss={() => setSavedPopup(false)}
      />
      {/* Password-gated delete. Confirmation + Customer Admin password in one
          dialog; the password is verified server-side before the delete runs. */}
      <PasswordConfirmModal
        open={!!siteToDelete}
        onClose={() => setSiteToDelete(null)}
        onConfirm={handleDeleteWithPassword}
        title="Remove this site?"
        confirmLabel="Delete site"
        variant="danger"
        icon={Trash2}
        message={
          <>
            Deleting <strong>{siteToDelete?.name}</strong> removes it from all
            dropdowns and the dashboard heatmap. Existing records are preserved.
            Enter your Customer Admin password to confirm.
          </>
        }
      />
    </section>
  );
}
