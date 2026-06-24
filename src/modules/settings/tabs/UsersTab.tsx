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
  Eye,
  EyeOff,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useRole } from "@/hooks/useRole";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import {
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
import { aiSignup, generateUserId, AiAuthError } from "@/lib/aiAuth";
import { createUser, setUserGxpSignatory, setUserStatus } from "@/actions/settings";
import { planLabel } from "@/lib/plans";
import { roleLabel } from "@/lib/labels/roles";
import { errorCodeLabel } from "@/lib/labels/errorCodes";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";

// Role ordering for the dropdowns. Display text comes from roleLabel() — the
// shared label layer — so labels never drift between screens.
const ROLE_ORDER = [
  "super_admin",
  "customer_admin",
  "qa_head",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
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

// Matches the server min (CreateUserSchema/UpdateUserSchema password .min(6)).
const PASSWORD_MIN = 6;

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
      ? z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
      : z.string().optional(),
    confirmPassword: z.string().optional(),
  });
  return base
    // Edit mode: changing the password is optional, but if EITHER field is
    // touched the password itself must be present and meet the min length.
    // Closes the gap where entering only confirmPassword passed validation.
    .refine(
      (d) => {
        if (mode !== "edit") return true;
        const touched = !!(d.password || d.confirmPassword);
        return !touched || (!!d.password && d.password.length >= PASSWORD_MIN);
      },
      { message: `Password must be at least ${PASSWORD_MIN} characters`, path: ["password"] },
    )
    // Whenever a password is being set (always in add; in edit when either field
    // is touched), confirmPassword must match it.
    .refine(
      (d) => {
        const settingPw = mode === "add" || !!(d.password || d.confirmPassword);
        return !settingPw || d.password === d.confirmPassword;
      },
      { message: "Passwords do not match", path: ["confirmPassword"] },
    );
}

type UserFormValues = z.infer<ReturnType<typeof makeUserSchema>>;

const ROLE_OPTIONS_ALL = ROLE_ORDER.map((v) => ({ value: v, label: roleLabel(v) }));
const ROLE_OPTIONS_CUSTOMER_ADMIN = ROLE_ORDER.filter((v) =>
  TENANT_ROLES_FOR_CUSTOMER_ADMIN.includes(v),
).map((v) => ({ value: v, label: roleLabel(v) }));
const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

/** Show/hide eye button for a password field. Rendered as an Input
 *  rightAdornment. Real <button> → keyboard-focusable; aria-label + aria-pressed
 *  announce state. */
function PasswordToggle({
  shown,
  onToggle,
  target,
}: {
  shown: boolean;
  onToggle: () => void;
  target: string;
}) {
  const Icon = shown ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? `Hide ${target}` : `Show ${target}`}
      aria-pressed={shown}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent cursor-pointer text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover) transition-colors"
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}

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
}) {  const { allSites: tenantSites } = useTenantConfig();

  // Password visibility — default hidden, one toggle per field, covers both the
  // Add and Edit modals (this form backs both).
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
          type={showPassword ? "text" : "password"}
          required={mode === "add"}
          placeholder="Enter password"
          error={errors.password?.message}
          rightAdornment={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
              target="password"
            />
          }
          {...register("password")}
        />
        <Input
          id="user-confirm-password"
          label="Confirm Password"
          type={showConfirmPassword ? "text" : "password"}
          required={mode === "add"}
          placeholder="Re-enter password"
          error={errors.confirmPassword?.message}
          rightAdornment={
            <PasswordToggle
              shown={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((v) => !v)}
              target="confirm password"
            />
          }
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
            "bg-(--bg-surface) border-(--bg-border)",
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
                        ? "bg-(--brand-muted) border-[#0ea5e9]"
                        : "bg-(--bg-surface) border-(--bg-border)",
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
                    <Badge variant={getSeverityVariant(site.risk, "generic")}>
                      {normalizeSeverityForDisplay(site.risk, "generic") ?? site.risk}
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
  const dispatch = useAppDispatch();  const {
    users,
    tenantId,
    plan,
    daysRemaining,
    isExpired,
    isNearExpiry,
    maxAccounts,
    usedAccounts,
    isAtAccountLimit,
  } = useTenantConfig();
  const { isSuperAdmin, isCustomerAdmin } = useRole();
  const visibleUsers = users.filter((u) => u.role !== "super_admin" && u.role !== "customer_admin");
  const { isAtLimit, getCount, getLimit, tenantPlan } =
    usePlanLimits();

  const userCount = getCount("users");
  const userLimit = getLimit("users");
  const atPlanLimit = isAtLimit("users");

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
  // Human-labelled message from a server-side cap block (hard enforcement).
  const [capError, setCapError] = useState<string | null>(null);
  // Server-side error for the signatory / status mutations (Part 11 controls).
  const [actionError, setActionError] = useState<string | null>(null);

  // Persist GxP signatory authority server-side (with audit) BEFORE mirroring to
  // Redux. On failure the Redux state is left untouched so the UI doesn't show a
  // change that wasn't persisted.
  const persistSignatory = async (userId: string, value: boolean) => {
    const res = await setUserGxpSignatory(userId, value);
    if (!res.success) { setActionError(res.error || "Failed to update signatory authority."); return; }
    dispatch(updateTenantUser({ tenantId, userId, patch: { gxpSignatory: value } }));
  };

  // Persist active/inactive status server-side (with audit), then mirror to Redux.
  const persistStatus = async (userId: string, isActive: boolean) => {
    const res = await setUserStatus(userId, isActive);
    if (!res.success) { setActionError(res.error || "Failed to update user status."); return; }
    dispatch(updateTenantUser({ tenantId, userId, patch: { status: isActive ? "Active" : "Inactive" } }));
  };
  const [subPopupOpen, setSubPopupOpen] = useState(false);

  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS_ALL
    : ROLE_OPTIONS_CUSTOMER_ADMIN;


  const handleAdd = async (data: UserFormValues) => {
    // AI backend + our @@unique([tenantId, username]) require username ≥ 3 chars;
    // pad a short email local-part with a random suffix.
    const localPart = data.email.split("@")[0] ?? "";
    const aiId = generateUserId();
    const username =
      localPart.length >= 3 ? localPart : `${localPart}_${aiId.slice(-4)}`;

    // 1) Authoritative DB User row so the account can actually authenticate via
    //    NextAuth (which reads the User table). The hard cap, role-grant ceiling,
    //    tenant isolation (tenant from session, not client), and the USER_CREATED
    //    audit are all enforced server-side inside createUser. Must succeed
    //    before we touch Redux.
    const created = await createUser({
      name: data.name,
      email: data.email,
      username,
      role: data.role,
      siteId: data.allSites ? undefined : (data.assignedSites[0] ?? undefined),
      password: data.password ?? "",
      gxpSignatory: data.gxpSignatory,
    });
    if (!created.success) {
      // Cap codes map to friendly labels; other errors (role ceiling, duplicate
      // email, validation) pass through unchanged.
      setCapError(errorCodeLabel(created.error ?? "Failed to create user"));
      return;
    }
    const dbUser = created.data as { id: string };

    // 2) Best-effort AI backend provisioning (unchanged). A failure here is
    //    non-fatal — the DB user already exists and can log in.
    const customerAdmin = users.find(
      (u) => u.role === "customer_admin" && u.aiUserId,
    );
    const customerId = customerAdmin?.aiUserId ?? tenantId;
    let aiUserId: string | undefined;
    let aiAccessToken: string | undefined;
    try {
      const res = await aiSignup({
        user_id: aiId,
        username,
        email: data.email,
        password: data.password ?? "",
        customer_id: customerId,
        role: data.role,
      });
      aiUserId = aiId;
      aiAccessToken = res.access_token;
    } catch (err) {
      const reason = err instanceof AiAuthError ? err.message : "unknown";
      console.error("[UsersTab] AI signup failed — DB user created, AI token deferred:", reason);
    }

    // 3) Mirror to Redux using the DB id so #5's status/signatory toggles and
    //    edits operate on the real User row.
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
          id: dbUser.id,
          assignedSites: data.allSites ? [] : data.assignedSites,
          password: data.password,
          username,
          aiUserId,
          aiAccessToken,
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

  const handleEdit = async (data: UserFormValues) => {
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

      // Retry AI signup only if it never succeeded for this user (missing
      // aiUserId sentinel). Once aiUserId is set we never re-sign-up — edits
      // become local + Neon-only.
      if (!editingUser.aiUserId) {
        const customerAdmin = users.find(
          (u) => u.role === "customer_admin" && u.aiUserId,
        );
        const customerId = customerAdmin?.aiUserId ?? tenantId;
        // AI backend requires username ≥ 3 chars. The email's local part can
        // be shorter (e.g. "qa@..." → "qa"), so pad with the user id suffix.
        const localPart = data.email.split("@")[0] ?? "";
        const username =
          localPart.length >= 3 ? localPart : `${localPart}_${editingUser.id.slice(-4)}`;
        try {
          const res = await aiSignup({
            user_id: editingUser.id,
            username,
            email: data.email,
            password: data.password ?? editingUser.password ?? "",
            customer_id: customerId,
            role: data.role,
          });
          patch.aiUserId = editingUser.id;
          patch.aiAccessToken = res.access_token;
          patch.username = username;
        } catch (err) {
          const reason = err instanceof AiAuthError ? err.message : "unknown";
          console.error("[UsersTab] AI signup retry on edit failed:", reason);
        }
      }

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
      void persistStatus(userId, true);
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
            ? "bg-(--danger-bg) border-(--danger)"
            : isNearExpiry
              ? "bg-(--warning-bg) border-(--warning)"
              : "bg-(--bg-surface) border-(--bg-border)",
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
              {plan
                ? `${planLabel(plan.tier, plan.displayName)} plan`
                : "No plan assigned"}
            </span>
            {plan && (
              <Badge
                variant={isExpired ? "red" : isNearExpiry ? "amber" : "green"}
              >
                {isExpired
                  ? "Expired"
                  : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`}
              </Badge>
            )}
          </div>

          {plan && (
            <>
              <div
                className="flex items-center gap-3 text-[11px] mb-2 flex-wrap"
                style={{ color: "var(--text-muted)" }}
              >
                <span>
                  {usedAccounts} of {maxAccounts} accounts used
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {dayjs.utc(plan.startDate).format("DD MMM YYYY")}
                  {" — "}
                  {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}
                </span>
              </div>

              {maxAccounts > 0 && (
                <div
                  className={clsx(
                    "h-1.5 rounded-full",
                    "bg-(--bg-border)",
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
            "bg-(--danger-bg) border-(--danger)",
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
                  {roleLabel(u.role)}
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
                  onChange={() => void persistSignatory(u.id, !u.gxpSignatory)}
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
        isOpen={!!capError}
        variant="error"
        title="Cannot add user"
        description={capError ?? ""}
        onDismiss={() => setCapError(null)}
      />
      <Popup
        isOpen={!!actionError}
        variant="error"
        title="Action failed"
        description={actionError ?? ""}
        onDismiss={() => setActionError(null)}
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
              if (userToDeactivate) void persistStatus(userToDeactivate, false);
              setDeactivatePopup(false);
              setUserToDeactivate(null);
            },
          },
        ]}
      />
    </section>
  );
}
