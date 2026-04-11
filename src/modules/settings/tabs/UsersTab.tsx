import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Plus,
  Pencil,
  Users,
  UserPlus,
  Save,
  Lock,
  CreditCard,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import {
  PlanLimitUsageBar,
  PlanLimitPopup,
  EmptyState,
  DataTable,
  SubscriptionPlansPopup,
} from "@/components/shared";
import {
  addTenantUser,
  updateTenantUser,
  type TenantUserConfig,
} from "@/store/auth.slice";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "customer_admin", label: "Customer Admin" },
  { value: "qa_head", label: "QA Head" },
  { value: "qc_lab_director", label: "QC/Lab Director" },
  { value: "regulatory_affairs", label: "Regulatory Affairs" },
  { value: "csv_val_lead", label: "CSV/Val Lead" },
  { value: "it_cdo", label: "IT/CDO" },
  { value: "operations_head", label: "Operations Head" },
  { value: "viewer", label: "Viewer" },
] as const;

const TENANT_ROLES_FOR_CUSTOMER_ADMIN = [
  "qa_head",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
];

const ALL_SITES_ROLES = ["super_admin", "customer_admin", "qa_head", "it_cdo"];

const roleChip: Record<string, string> = {
  super_admin: "bg-(--danger-bg) text-(--danger)",
  customer_admin: "bg-(--brand-muted) text-(--brand)",
  qa_head: "bg-(--info-bg) text-(--info)",
  qc_lab_director: "bg-(--success-bg) text-(--success)",
  regulatory_affairs: "bg-pink-500/12 text-pink-400",
  csv_val_lead: "bg-(--brand-muted) text-(--brand)",
  it_cdo: "bg-teal-500/12 text-teal-400",
  operations_head: "bg-(--warning-bg) text-(--warning)",
  viewer:
    "bg-(--bg-elevated) text-(--text-secondary) border border-(--bg-border)",
};

function makeUserSchema(mode: "add" | "edit") {
  const base = z.object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email is required"),
    role: z.string().min(1, "Role is required"),
    gxpSignatory: z.boolean(),
    status: z.enum(["Active", "Inactive"]),
    allSites: z.boolean(),
    assignedSites: z.array(z.string()),
    password: mode === "add"
      ? z.string().min(6, "Password must be at least 6 characters")
      : z.string().optional().refine((v) => !v || v.length >= 6, { message: "Password must be at least 6 characters" }),
    confirmPassword: z.string().optional(),
  });
  return base.refine((d) => !d.password || d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
}

type UserFormValues = z.infer<ReturnType<typeof makeUserSchema>>;

const ROLE_OPTIONS_ALL = ROLES.map((r) => ({ value: r.value, label: r.label }));
const ROLE_OPTIONS_CUSTOMER_ADMIN = ROLES.filter((r) =>
  TENANT_ROLES_FOR_CUSTOMER_ADMIN.includes(r.value),
).map((r) => ({ value: r.value, label: r.label }));
const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

function UserForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitIcon,
  roleOptions,
  mode = "add",
}: {
  defaultValues: UserFormValues;
  onSubmit: (data: UserFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  submitIcon: typeof Plus;
  roleOptions: { value: string; label: string }[];
  mode?: "add" | "edit";
}) {
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { allSites: tenantSites } = useTenantConfig();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(makeUserSchema(mode)),
    defaultValues,
  });

  const watchRole = watch("role");
  const watchAllSites = watch("allSites");
  const watchSites = watch("assignedSites") ?? [];

  // Auto-set allSites when role changes
  useEffect(() => {
    if (ALL_SITES_ROLES.includes(watchRole)) {
      setValue("allSites", true);
      setValue("assignedSites", []);
    }
  }, [watchRole, setValue]);

  const toggleSite = (siteId: string, checked: boolean) => {
    if (checked) {
      setValue("assignedSites", [...watchSites, siteId]);
    } else {
      setValue(
        "assignedSites",
        watchSites.filter((id) => id !== siteId),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="user-name"
          label="Full Name"
          required
          placeholder="e.g. Dr. Priya Sharma"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          id="user-email"
          label="Email"
          type="email"
          required
          placeholder="priya@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
            Role{" "}
            <span className="text-(--danger)" aria-hidden="true">
              *
            </span>
          </p>
          <Dropdown
            options={roleOptions}
            value={watch("role")}
            onChange={(v) => setValue("role", v, { shouldValidate: true })}
            placeholder="Select role"
            width="w-full"
          />
          {errors.role && (
            <p role="alert" className="text-[11px] text-(--danger) mt-1">
              {errors.role.message}
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">
            Status
          </p>
          <Dropdown
            options={STATUS_OPTIONS}
            value={watch("status")}
            onChange={(v) => setValue("status", v as UserFormValues["status"])}
            width="w-full"
          />
        </div>
      </div>

      {/* Password fields */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="user-password"
          label={mode === "edit" ? "New Password (optional)" : "Password"}
          type="password"
          required={mode === "add"}
          placeholder="Min 6 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <Input
          id="user-confirm-password"
          label="Confirm Password"
          type="password"
          required={mode === "add"}
          placeholder="Re-enter password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
      </div>

      {/* GxP Signatory toggle */}
      <div className="py-3 border-t border-(--bg-border)">
        <Toggle
          id="form-gxp-sig"
          checked={watch("gxpSignatory")}
          onChange={(v) => setValue("gxpSignatory", v)}
          label="GxP Signatory Authority"
          description="Enables Sign & Approve buttons"
        />
      </div>

      {/* Site assignment */}
      <div className="py-3 border-t border-(--bg-border) space-y-3">
        <div
          className={clsx(
            "flex items-center justify-between p-3 rounded-lg border",
            isDark
              ? "bg-[#071526] border-[#1e3a5a]"
              : "bg-[#f8fafc] border-[#e2e8f0]",
          )}
        >
          <div>
            <p
              id="all-sites-label"
              className="text-[13px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Access all sites
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              User can see data from every site
            </p>
          </div>
          <Toggle
            id="form-all-sites"
            checked={watchAllSites}
            onChange={(v) => {
              setValue("allSites", v);
              if (v) setValue("assignedSites", []);
            }}
            label="Access all sites"
            hideLabel
            disabled={ALL_SITES_ROLES.includes(watchRole)}
          />
        </div>

        {ALL_SITES_ROLES.includes(watchRole) && (
          <p className="text-[11px] text-[#10b981]">
            This role automatically gets access to all sites
          </p>
        )}

        {!watchAllSites && !ALL_SITES_ROLES.includes(watchRole) && (
          <div>
            <p className="text-[11px] font-medium text-(--text-secondary) mb-2">
              Assigned sites
            </p>
            {tenantSites.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                No sites configured yet. Add sites in the Sites tab first.
              </p>
            ) : (
              <div className="space-y-1.5">
                {tenantSites.map((site) => (
                  <label
                    key={site.id}
                    className={clsx(
                      "flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                      watchSites.includes(site.id)
                        ? isDark
                          ? "bg-[rgba(14,165,233,0.08)] border-[#0ea5e9]"
                          : "bg-[#eff6ff] border-[#0ea5e9]"
                        : isDark
                          ? "bg-[#071526] border-[#1e3a5a]"
                          : "bg-[#f8fafc] border-[#e2e8f0]",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-[#0ea5e9]"
                      checked={watchSites.includes(site.id)}
                      onChange={(e) => toggleSite(site.id, e.target.checked)}
                      aria-label={`Assign ${site.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[12px] font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {site.name}
                      </p>
                      <p
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {site.location} &middot; {site.gmpScope}
                      </p>
                    </div>
                    <Badge
                      variant={
                        site.risk === "HIGH"
                          ? "red"
                          : site.risk === "MEDIUM"
                            ? "amber"
                            : "green"
                      }
                    >
                      {site.risk}
                    </Badge>
                  </label>
                ))}
              </div>
            )}
            {tenantSites.length > 0 && watchSites.length === 0 && (
              <p className="text-[11px] text-[#f59e0b] mt-2">
                No sites assigned — user won&apos;t see any location-specific
                data
              </p>
            )}
          </div>
        )}
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

export function UsersTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const {
    users,
    tenantId,
    activePlan,
    daysRemaining,
    isExpired,
    isNearExpiry,
    maxAccounts,
    usedAccounts,
    isAtAccountLimit,
  } = useTenantConfig();
  const { isSuperAdmin, isCustomerAdmin } = useRole();
  const visibleUsers = users.filter((u) => u.role !== "super_admin" && u.role !== "customer_admin");
  const { isAtLimit, isNearLimit, getCount, getLimit, tenantPlan } =
    usePlanLimits();

  const userCount = getCount("users");
  const userLimit = getLimit("users");
  const atPlanLimit = isAtLimit("users");
  const nearPlanLimit = isNearLimit("users");

  // Combined limit: subscription account limit OR plan limit
  const atLimit = atPlanLimit || isAtAccountLimit;

  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUserConfig | null>(null);

  const [addedPopup, setAddedPopup] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [deactivatePopup, setDeactivatePopup] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<string | null>(null);
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [subPopupOpen, setSubPopupOpen] = useState(false);

  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS_ALL
    : ROLE_OPTIONS_CUSTOMER_ADMIN;

  const getRoleLabel = (value: string) =>
    ROLES.find((r) => r.value === value)?.label ?? value;

  const handleAdd = (data: UserFormValues) => {
    dispatch(
      addTenantUser({
        tenantId,
        user: {
          name: data.name,
          email: data.email,
          role: data.role,
          gxpSignatory: data.gxpSignatory,
          status: data.status,
          allSites: data.allSites,
          id: crypto.randomUUID(),
          assignedSites: data.allSites ? [] : data.assignedSites,
          password: data.password,
        },
      }),
    );
    setAddModal(false);
    setAddedPopup(true);
  };

  const openEdit = (user: TenantUserConfig) => {
    setEditingUser(user);
    setEditModal(true);
  };

  const handleEdit = (data: UserFormValues) => {
    if (editingUser) {
      const patch: Partial<TenantUserConfig> = {
        name: data.name,
        email: data.email,
        role: data.role,
        gxpSignatory: data.gxpSignatory,
        status: data.status,
        allSites: data.allSites,
        assignedSites: data.allSites ? [] : data.assignedSites,
      };
      if (data.password) patch.password = data.password;
      dispatch(updateTenantUser({ tenantId, userId: editingUser.id, patch }));
    }
    setEditModal(false);
    setEditingUser(null);
    setSavedPopup(true);
  };

  const handleStatusChange = (userId: string, value: string) => {
    if (value === "Inactive") {
      setUserToDeactivate(userId);
      setDeactivatePopup(true);
    } else {
      dispatch(
        updateTenantUser({ tenantId, userId, patch: { status: "Active" } }),
      );
    }
  };

  return (
    <section aria-labelledby="users-heading" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2
            id="users-heading"
            className="text-[15px] font-semibold text-(--text-primary)"
          >
            Users
          </h2>
          <span className="ml-2 text-[11px] bg-(--brand-muted) text-(--brand) px-2 py-0.5 rounded-full font-semibold">
            {visibleUsers.length}
          </span>
        </div>
        {!readOnly && (
          <Button
            icon={atLimit ? Lock : Plus}
            size="sm"
            className={clsx(atLimit && "opacity-70")}
            aria-disabled={atLimit}
            onClick={() => {
              if (atLimit) {
                setPlanLimitOpen(true);
                return;
              }
              setAddModal(true);
            }}
          >
            {atLimit ? "Limit reached" : "Add user"}
          </Button>
        )}
      </div>

      {/* Subscription badge */}
      <div
        className={clsx(
          "flex items-center justify-between p-3 rounded-xl border",
          isExpired
            ? isDark
              ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.2)]"
              : "bg-[#fef2f2] border-[#fca5a5]"
            : isNearExpiry
              ? isDark
                ? "bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]"
                : "bg-[#fffbeb] border-[#fde68a]"
              : isDark
                ? "bg-[#071526] border-[#1e3a5a]"
                : "bg-[#f8fafc] border-[#e2e8f0]",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <CreditCard
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{
                color: isExpired
                  ? "#ef4444"
                  : isNearExpiry
                    ? "#f59e0b"
                    : "#0ea5e9",
              }}
              aria-hidden="true"
            />
            <span
              className="text-[12px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {activePlan
                ? `${activePlan.status} plan`
                : "No active subscription"}
            </span>
            {activePlan && (
              <Badge
                variant={isExpired ? "red" : isNearExpiry ? "amber" : "green"}
              >
                {isExpired
                  ? "Expired"
                  : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`}
              </Badge>
            )}
          </div>

          {activePlan && (
            <>
              <div
                className="flex items-center gap-3 text-[11px] mb-2 flex-wrap"
                style={{ color: "var(--text-muted)" }}
              >
                <span>
                  {usedAccounts} of{" "}
                  {maxAccounts === -1 ? "unlimited" : maxAccounts} accounts used
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {dayjs.utc(activePlan.startDate).format("DD MMM YYYY")}
                  {" — "}
                  {dayjs.utc(activePlan.endDate).format("DD MMM YYYY")}
                </span>
              </div>

              {maxAccounts !== -1 && (
                <div
                  className={clsx(
                    "h-1.5 rounded-full",
                    isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]",
                  )}
                  role="progressbar"
                  aria-valuenow={Math.round((usedAccounts / maxAccounts) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Account usage"
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(Math.round((usedAccounts / maxAccounts) * 100), 100)}%`,
                      background: isAtAccountLimit
                        ? "#ef4444"
                        : isNearExpiry
                          ? "#f59e0b"
                          : "#0ea5e9",
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setSubPopupOpen(true)}
            className="ml-4 flex items-center gap-1.5 text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer flex-shrink-0"
            aria-label="Edit subscription plan"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Manage
          </button>
        )}

        {isCustomerAdmin && isNearExpiry && (
          <p className="text-[10px] ml-4 flex-shrink-0 text-[#f59e0b]">
            Contact Pharma Glimmora to renew
          </p>
        )}
      </div>

      {/* Account limit warning */}
      {isAtAccountLimit && (
        <div
          role="alert"
          className={clsx(
            "rounded-xl p-3 border",
            isDark
              ? "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.2)]"
              : "bg-[#fef2f2] border-[#fca5a5]",
          )}
        >
          <p className="text-[12px] font-medium text-[#ef4444]">
            Account limit reached
          </p>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Your plan allows {maxAccounts} accounts. Contact Pharma Glimmora to
            increase your limit.
          </p>
        </div>
      )}

      {/* Usage bar */}
      {/* <PlanLimitUsageBar
        icon={Users}
        label="Team members"
        count={userCount}
        limit={userLimit}
        plan={tenantPlan}
        atLimit={atPlanLimit}
        nearLimit={nearPlanLimit}
      /> */}

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        <DataTable<TenantUserConfig>
          variant="table-fixed"
          ariaLabel="Configured platform users"
          caption="List of users with roles, site access, signatory status, and account status"
          keyFn={(u) => u.id}
          data={visibleUsers}
          emptyState={
            <EmptyState
              icon={Users}
              title="Add your first team member"
              description="Users are assigned to findings, CAPAs, systems and 483 events as owners."
              hint="Without users, owner dropdowns in all modules will be empty."
              actionLabel="Add first user"
              onAction={() => setAddModal(true)}
              readOnly={readOnly}
            />
          }
          columns={[
            {
              key: "name",
              header: "Name",
              width: "w-[20%]",
              render: (u) => (
                <span className="text-[12px] font-semibold text-(--text-primary) truncate">
                  {u.name}
                </span>
              ),
            },
            {
              key: "role",
              header: "Role",
              width: "w-[15%]",
              render: (u) => (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${roleChip[u.role] ?? "bg-(--bg-elevated) text-(--text-secondary)"}`}
                >
                  {getRoleLabel(u.role)}
                </span>
              ),
            },
            {
              key: "sites",
              header: "Sites",
              width: "w-[12%]",
              render: (u) =>
                u.allSites || ALL_SITES_ROLES.includes(u.role) ? (
                  <Badge variant="green">All sites</Badge>
                ) : u.assignedSites.length === 0 ? (
                  <Badge variant="red">No sites</Badge>
                ) : (
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {u.assignedSites.length} site
                    {u.assignedSites.length !== 1 ? "s" : ""}
                  </span>
                ),
            },
            {
              key: "gxp",
              header: "GxP Signatory",
              width: "w-[13%]",
              render: (u) => (
                <Toggle
                  id={`sig-${u.id}`}
                  checked={u.gxpSignatory}
                  onChange={() =>
                    dispatch(
                      updateTenantUser({
                        tenantId,
                        userId: u.id,
                        patch: { gxpSignatory: !u.gxpSignatory },
                      }),
                    )
                  }
                  label={`GxP Signatory for ${u.name}`}
                  disabled={readOnly}
                  hideLabel
                />
              ),
            },
            {
              key: "status",
              header: "Status",
              width: "w-[14%]",
              render: (u) => (
                <Dropdown
                  options={STATUS_OPTIONS}
                  value={u.status}
                  onChange={(v) => handleStatusChange(u.id, v)}
                  width="w-28"
                />
              ),
            },
            {
              key: "email",
              header: "Email",
              width: "w-[16%]",
              render: (u) => (
                <span className="text-[12px] text-(--text-secondary) truncate">
                  {u.email}
                </span>
              ),
            },
            ...(!readOnly
              ? [
                  {
                    key: "actions",
                    header: "Actions",
                    srOnly: true,
                    width: "w-[10%]",
                    align: "right" as const,
                    render: (u: TenantUserConfig) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Pencil}
                        aria-label={`Edit ${u.name}`}
                        onClick={() => openEdit(u)}
                      />
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
        title="Add New User"
      >
        <UserForm
          defaultValues={{
            name: "",
            email: "",
            role: "viewer",
            gxpSignatory: true,
            status: "Active",
            allSites: false,
            assignedSites: [],
            password: "",
            confirmPassword: "",
          }}
          onSubmit={handleAdd}
          onCancel={() => setAddModal(false)}
          submitLabel="Add user"
          submitIcon={UserPlus}
          roleOptions={roleOptions}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editModal}
        onClose={() => {
          setEditModal(false);
          setEditingUser(null);
        }}
        title="Edit User"
      >
        {editingUser && (
          <UserForm
            key={editingUser.id}
            defaultValues={{
              name: editingUser.name,
              email: editingUser.email,
              role: editingUser.role,
              gxpSignatory: editingUser.gxpSignatory,
              status: editingUser.status,
              allSites:
                editingUser.allSites ??
                ALL_SITES_ROLES.includes(editingUser.role),
              assignedSites: editingUser.assignedSites ?? [],
              password: "",
              confirmPassword: "",
            }}
            onSubmit={handleEdit}
            onCancel={() => {
              setEditModal(false);
              setEditingUser(null);
            }}
            submitLabel="Save changes"
            submitIcon={Save}
            roleOptions={roleOptions}
            mode="edit"
          />
        )}
      </Modal>

      {/* Subscription plans popup — Super Admin only */}
      {isSuperAdmin && (
        <SubscriptionPlansPopup
          isOpen={subPopupOpen}
          onClose={() => setSubPopupOpen(false)}
          tenantId={tenantId}
        />
      )}

      {/* Popups */}
      <Popup
        isOpen={addedPopup}
        variant="success"
        title="User added"
        description="New user can now be assigned as owner in CAPAs and findings."
        onDismiss={() => setAddedPopup(false)}
      />
      <Popup
        isOpen={savedPopup}
        variant="success"
        title="User updated"
        description="Changes saved successfully."
        onDismiss={() => setSavedPopup(false)}
      />
      <PlanLimitPopup
        isOpen={planLimitOpen}
        onClose={() => setPlanLimitOpen(false)}
        resource="user"
        plan={tenantPlan}
        limit={userLimit}
        count={userCount}
      />
      <Popup
        isOpen={deactivatePopup}
        variant="confirmation"
        title="Deactivate this user?"
        description="They will be removed from all owner dropdowns. Open CAPAs must be reassigned. Past records are preserved."
        onDismiss={() => {
          setDeactivatePopup(false);
          setUserToDeactivate(null);
        }}
        actions={[
          {
            label: "Cancel",
            style: "ghost",
            onClick: () => {
              setDeactivatePopup(false);
              setUserToDeactivate(null);
            },
          },
          {
            label: "Yes, deactivate",
            style: "primary",
            onClick: () => {
              if (userToDeactivate)
                dispatch(
                  updateTenantUser({
                    tenantId,
                    userId: userToDeactivate,
                    patch: { status: "Inactive" },
                  }),
                );
              setDeactivatePopup(false);
              setUserToDeactivate(null);
            },
          },
        ]}
      />
    </section>
  );
}
