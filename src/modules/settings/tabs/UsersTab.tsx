import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  UserPlus,
  Save,
  Lock,
  CreditCard,
  Eye,
  EyeOff,
  ShieldCheck,
  Power,
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
  removeTenantUser,
  type TenantUserConfig,
} from "@/store/auth.slice";
import { generateUserId } from "@/lib/aiAuth";
import { provisionAiAccount } from "@/actions/aiAccount";
import {
  createUser,
  updateUser,
  setUserStatus,
  setUserGxpSignatoryWithPassword,
  deleteUserWithPassword,
} from "@/actions/settings";
import { planLabel } from "@/lib/plans";
import { roleLabel } from "@/lib/labels/roles";
import { errorCodeLabel } from "@/lib/labels/errorCodes";
import { Popup } from "@/components/ui/Popup";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { getMyRoleMatrix } from "@/actions/roleLimits";
import { roleCapStatus, type RoleMatrixSummary } from "@/lib/roleLimits";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { PasswordConfirmModal } from "@/components/ui/PasswordConfirmModal";
import { useToast } from "@/components/ui/Toast";

// Role ordering for the dropdowns. Display text comes from roleLabel() — the
// shared label layer — so labels never drift between screens.
const ROLE_ORDER = [
  "super_admin",
  "customer_admin",
  "qa_head",
  "qa",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
] as const;

const TENANT_ROLES_FOR_CUSTOMER_ADMIN = [
  "qa_head",
  "qa",
  "qc_lab_director",
  "regulatory_affairs",
  "csv_val_lead",
  "it_cdo",
  "operations_head",
  "viewer",
];


const roleChip: Record<string, string> = {
  super_admin: "bg-(--danger-bg) text-(--danger)",
  customer_admin: "bg-(--brand-muted) text-(--brand)",
  qa_head: "bg-(--info-bg) text-(--info)",
  qa: "bg-indigo-500/12 text-indigo-400",
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

// customer_admin is intentionally excluded from the role PICKER (UI hide only).
// The server-side gates are unchanged and still accept customer_admin, and any
// existing customer_admin users remain visible in the list below.
const ROLE_OPTIONS_ALL = ROLE_ORDER.filter((v) => v !== "customer_admin").map((v) => ({ value: v, label: roleLabel(v) }));
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
  open,
  onClose,
  title,
  defaultValues,
  onSubmit,
  submitLabel,
  submitIcon,
  roleOptions,
  mode = "add",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultValues: UserFormValues;
  onSubmit: (data: UserFormValues) => Promise<{ emailError?: string } | void>;
  submitLabel: string;
  submitIcon: typeof Plus;
  roleOptions: DropdownOption[];
  mode?: "add" | "edit";
}) {
  const { allSites: tenantSites } = useTenantConfig();

  // Password visibility — default hidden, one toggle per field, covers both the
  // Add and Edit modals (this form backs both).
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // "Discard changes?" gate — shown when Cancel/backdrop/Escape is used while
  // the form has unsaved edits (U6).
  const [discardOpen, setDiscardOpen] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty, isValid },
  } = useForm<UserFormValues>({
    resolver: zodResolver(makeUserSchema(mode)),
    defaultValues,
    // Live validity so the submit button can stay disabled until every required
    // field is filled, the email is valid, a role is selected, and (add mode)
    // the password rules pass. Role caps are enforced separately: at-cap roles
    // are disabled in the dropdown and the plan/account limit gates modal open.
    mode: "onChange",
  });

  // The sticky-footer submit button lives OUTSIDE the <form> (Modal renders the
  // footer in its own region), so it associates via the HTML `form` attribute.
  const formId = `user-form-${mode}`;

  const watchRole = watch("role");
  const watchSites = watch("assignedSites") ?? [];

  // EVERY role — QA Head included — is a SINGLE-site assignment (User.siteId is a
  // 1:1 FK): one site, or none. No role gets an all-sites ASSIGNMENT here. Force
  // allSites=false so a freshly picked site is never nulled at write time (also
  // heals a legacy allSites=true row, e.g. a qa_head created under the old rule).
  useEffect(() => {
    setValue("allSites", false);
  }, [watchRole, setValue]);

  // Single-site select: one site, or none. Keeps assignedSites as a 1-element (or
  // empty) array so the existing write path (nextSiteId = assignedSites[0] ?? null)
  // is unchanged — no regression to the site-persist fix.
  const siteOptions: DropdownOption[] = [
    { value: "", label: "No specific site" },
    ...tenantSites.map((s) => ({ value: s.id, label: s.name, description: `${s.location} · ${s.gmpScope}` })),
  ];
  const setSingleSite = (siteId: string) => {
    setValue("allSites", false, { shouldDirty: true });
    setValue("assignedSites", siteId ? [siteId] : [], { shouldDirty: true });
  };

  // Wrap the parent's onSubmit so a returned duplicate-email error is surfaced
  // inline on the email field instead of as a global popup (U4).
  const submit = async (data: UserFormValues) => {
    const res = await onSubmit(data);
    if (res?.emailError) {
      setError("email", { type: "server", message: res.emailError });
    }
  };

  // Confirm before discarding unsaved edits; close directly when clean (U6).
  const requestClose = () => {
    if (isDirty) setDiscardOpen(true);
    else onClose();
  };

  return (
    <>
    <Modal
      open={open}
      onClose={requestClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          {/* type="button" so this footer button never acts as a submit for the
              form it's associated with — it only ever requests close. */}
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            icon={submitIcon}
            type="submit"
            form={formId}
            loading={isSubmitting}
            disabled={!isValid || isSubmitting}
          >
            {submitLabel}
          </Button>
        </div>
      }
    >
    {/* autoComplete="off" on the form + fields below stops the browser's
        credential manager from auto-filling the signed-in admin's OWN email and
        password into a fresh "Add user" form (the reported pre-fill bug — the
        React form state is already empty; the values came from browser autofill). */}
    <form id={formId} onSubmit={handleSubmit(submit)} noValidate autoComplete="off" className="space-y-4">
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
          autoComplete="off"
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
          autoComplete="new-password"
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
          autoComplete="new-password"
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

      {/* GxP Signatory toggle. In edit mode this is a Part 11 change that must
          go through the password-gated table toggle (U3), so it is read-only
          here; it is set at creation time in add mode. */}
      <div className="py-3 border-t border-(--bg-border)">
        <Toggle
          id="form-gxp-sig"
          checked={watch("gxpSignatory")}
          onChange={(v) => setValue("gxpSignatory", v)}
          label="GxP Signatory Authority"
          description={
            mode === "edit"
              ? "Change this from the table — it requires your password (Part 11)"
              : "Enables Sign & Approve buttons"
          }
          disabled={mode === "edit"}
        />
      </div>

      {/* Site assignment — SINGLE site (User.siteId is a 1:1 FK) for EVERY role,
          QA Head included: one site, or none. No all-sites assignment path. */}
      <div className="py-3 border-t border-(--bg-border) space-y-2">
        <p className="text-[11px] font-medium text-(--text-secondary)">Site assignment</p>
        {tenantSites.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No sites configured yet. Add sites in the Sites tab first.
          </p>
        ) : (
          <>
            <Dropdown
              options={siteOptions}
              value={watchSites[0] ?? ""}
              onChange={setSingleSite}
              placeholder="Select a site"
              width="w-full"
            />
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Assign this user to a single site, or leave unassigned. A user with no site won&apos;t see location-specific data.
            </p>
          </>
        )}
      </div>
    </form>
    </Modal>

    {/* Unsaved-changes gate (U6) */}
    <Popup
      isOpen={discardOpen}
      variant="confirmation"
      title="Discard changes?"
      description="You have unsaved changes. Discard them and close this form?"
      onDismiss={() => setDiscardOpen(false)}
      actions={[
        {
          label: "Keep editing",
          style: "ghost",
          onClick: () => setDiscardOpen(false),
        },
        {
          label: "Discard",
          style: "primary",
          onClick: () => {
            setDiscardOpen(false);
            onClose();
          },
        },
      ]}
    />
    </>
  );
}

export function UsersTab({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const {
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
  const toast = useToast();
  const { allSites } = useTenantConfig();
  const { isSuperAdmin, isCustomerAdmin } = useRole();
  // Hide platform/admin identities from the Users table, BY ROLE, for ALL viewers:
  // super_admin (a platform identity, not a tenant user) AND customer_admin
  // (HIDE-CADMIN-ROW — the admin account manages the tenant but is not itself a
  // manageable user row; hides all customer_admins if a tenant has several). This
  // is display filtering only — RBAC/permissions and the count logic are unchanged.
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
  // Pending password-gated GxP signatory change (U3): the target user + intended
  // value. Non-null = the password dialog is open.
  const [gxpTarget, setGxpTarget] = useState<{ user: TenantUserConfig; value: boolean } | null>(null);
  // The user pending a password-gated delete (U7). Non-null = dialog open.
  const [userToDelete, setUserToDelete] = useState<TenantUserConfig | null>(null);
  // The user being VIEWED (read-only detail modal). Stored by id and derived
  // from the live `users` list so a status change made from inside the modal is
  // reflected immediately without re-opening it.
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const viewUser = viewUserId ? users.find((u) => u.id === viewUserId) ?? null : null;
  // The user pending a status-change confirmation (from the View modal).
  const [statusConfirmUser, setStatusConfirmUser] = useState<TenantUserConfig | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  // GxP signatory authority is a Part 11 change — it requires the Customer Admin
  // to re-enter their password, verified server-side (U3). Only on success is the
  // change mirrored to Redux.
  const confirmGxpChange = async (password: string) => {
    if (!gxpTarget) return { success: false, error: "No change selected." };
    const res = await setUserGxpSignatoryWithPassword(gxpTarget.user.id, gxpTarget.value, password);
    if (res.success) {
      dispatch(updateTenantUser({ tenantId, userId: gxpTarget.user.id, patch: { gxpSignatory: gxpTarget.value } }));
    }
    return res;
  };

  // Password-gated user delete (U7): verified server-side, then removed from
  // Redux. Audit-first via deleteUserWithPassword → deleteUser.
  const confirmDeleteUser = async (password: string) => {
    if (!userToDelete) return { success: false, error: "No user selected." };
    const res = await deleteUserWithPassword(userToDelete.id, password);
    if (res.success) {
      dispatch(removeTenantUser({ tenantId, userId: userToDelete.id }));
    }
    return res;
  };

  // Persist active/inactive status server-side (with audit), then mirror to Redux.
  // Returns whether the write succeeded so callers (e.g. the View modal confirm)
  // can toast/gate on it.
  const persistStatus = async (userId: string, isActive: boolean): Promise<boolean> => {
    const res = await setUserStatus(userId, isActive);
    if (!res.success) { setActionError(res.error || "Failed to update user status."); return false; }
    dispatch(updateTenantUser({ tenantId, userId, patch: { status: isActive ? "Active" : "Inactive" } }));
    return true;
  };

  // Confirm the status change requested from the View modal. Reuses the existing
  // audited status action; on success shows a toast. The View modal stays open
  // and re-renders with the new status (derived from the live `users` list).
  const confirmUserStatusChange = async () => {
    if (!statusConfirmUser) return;
    const nextActive = statusConfirmUser.status !== "Active";
    setStatusBusy(true);
    const ok = await persistStatus(statusConfirmUser.id, nextActive);
    setStatusBusy(false);
    setStatusConfirmUser(null);
    if (ok) toast.success(nextActive ? "User reactivated." : "User suspended.");
  };

  // Site names for a user's assignment (single-site model → 0 or 1 id).
  const siteNamesFor = (u: TenantUserConfig): string =>
    u.assignedSites.length === 0
      ? "No site assigned"
      : u.assignedSites
          .map((id) => allSites.find((s) => s.id === id)?.name ?? id)
          .join(", ");
  const [subPopupOpen, setSubPopupOpen] = useState(false);

  const roleOptions = isSuperAdmin
    ? ROLE_OPTIONS_ALL
    : ROLE_OPTIONS_CUSTOMER_ADMIN;

  // Item 4a — per-role usage for the Add-User role dropdown. Read-only view of
  // the resolver (getMyRoleMatrix, this tenant). Refetched when the Add modal
  // opens so counts are current.
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrixSummary | null>(null);
  useEffect(() => {
    if (!addModal) return;
    let cancelled = false;
    void (async () => {
      const res = await getMyRoleMatrix();
      if (!cancelled && res.success) setRoleMatrix(res.data);
    })();
    return () => { cancelled = true; };
  }, [addModal]);

  // Annotate each role option with "used/cap" and disable a FULL role (reason in
  // the badge). Super Admin is EXEMPT (Phase B) — never disable for SA, only show
  // usage. Uncapped roles render plain. Mirrors the gate's decision; the server
  // stays authoritative if a create is attempted anyway.
  const addRoleOptions: DropdownOption[] = roleOptions.map((opt) => {
    const row = roleMatrix?.rows.find((r) => r.role === opt.value);
    if (!row || row.cap === "unlimited") return opt;
    const status = roleCapStatus(row.cap, row.used);
    const full = status === "full";
    return {
      ...opt,
      label: `${opt.label} · ${row.used}/${row.cap}`,
      ...(full && !isSuperAdmin
        ? { disabled: true, badge: "Full", badgeVariant: "red" as const }
        : full
          ? { badge: "Full", badgeVariant: "red" as const }
          : status === "near"
            ? { badge: "Near", badgeVariant: "amber" as const }
            : {}),
    };
  });

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
      // Duplicate email → surface inline on the email field (U4). Covers both the
      // explicit case-insensitive pre-check (fieldErrors.email) and the DB
      // @@unique backstop ("Email or username already exists").
      const emailErr =
        created.fieldErrors?.email?.[0] ??
        (/email/i.test(created.error ?? "") ? "This email is already registered." : null);
      if (emailErr) return { emailError: emailErr };
      // Cap codes map to friendly labels; other errors (role ceiling, validation)
      // pass through unchanged.
      setCapError(errorCodeLabel(created.error ?? "Failed to create user"));
      return;
    }
    const dbUser = created.data as { id: string };

    // 2) Best-effort AI backend provisioning (unchanged). A failure here is
    //    non-fatal — the DB user already exists and can log in.
    // The AI service scopes every tenant query by the `customer_id` claim in
    // the token the server mints, which is always the tenantId — so provision
    // under the tenantId. Deriving it from the customer-admin's aiUserId (as
    // this did) produced an identifier the token never carries, so anything
    // written under it was unreadable.
    const customerId = tenantId;
    // Provisioning runs server-side (src/actions/aiAccount.ts): the password
    // never leaves the server, and no access token comes back — nothing in the
    // browser needs one now that /api/ai-proxy mints its own per request.
    let aiUserId: string | undefined;
    const provisioned = await provisionAiAccount({
      userId: aiId,
      username,
      email: data.email,
      password: data.password ?? "",
      customerId,
      role: data.role,
    });
    if (provisioned.success) {
      aiUserId = provisioned.data.aiUserId;
    } else {
      console.error("[UsersTab] AI provisioning failed — DB user created, AI account deferred:", provisioned.error);
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
    if (!editingUser) return;
    // Duplicate-email guard (U4) — case-insensitive, excluding this user and the
    // Tenant-row admins. Edits mirror to Redux (+ AI) rather than the DB User
    // row, so this is the guard for the edit path; surfaced inline on the field.
    const dupe = users.find(
      (u) =>
        u.id !== editingUser.id &&
        u.role !== "super_admin" &&
        u.role !== "customer_admin" &&
        u.email.toLowerCase() === data.email.trim().toLowerCase(),
    );
    if (dupe) return { emailError: "This email is already registered." };

    // Persist the edit to the DB FIRST — previously handleEdit only touched
    // Redux, so a site assignment (User.siteId) was never written and vanished
    // on the next DB hydration. User.siteId is a 1:1 nullable FK, so the
    // multi-select collapses to a single id (null = all sites / none); we
    // normalize the optimistic patch to the SAME value so the immediate view
    // matches what re-hydrates from the DB after a refresh.
    const nextSiteId = data.allSites ? null : (data.assignedSites[0] ?? null);
    const res = await updateUser(editingUser.id, {
      name: data.name,
      email: data.email,
      role: data.role,
      siteId: nextSiteId,
      ...(data.password ? { password: data.password } : {}),
    });
    if (!res.success) {
      const emailErr = /email/i.test(res.error ?? "") ? "This email is already registered." : null;
      if (emailErr) return { emailError: emailErr };
      setActionError(res.error || "Failed to update user.");
      return;
    }

    const patch: Partial<TenantUserConfig> = {
      name: data.name,
      email: data.email,
      role: data.role,
      // gxpSignatory is a Part 11 change gated by the password-protected table
      // toggle (U3) — it is intentionally NOT persisted from this modal.
      status: data.status,
      allSites: data.allSites,
      // Mirror the single persisted siteId (not the raw multi-select) so the
      // optimistic row agrees with the DB-hydrated row.
      assignedSites: nextSiteId ? [nextSiteId] : [],
    };
    if (data.password) patch.password = data.password;

    // Retry AI signup only if it never succeeded for this user (missing
    // aiUserId sentinel). Once aiUserId is set we never re-sign-up — edits
    // become local + Neon-only.
    if (!editingUser.aiUserId) {
      // Same tenantId scoping as the create path above.
      const customerId = tenantId;
      // AI backend requires username ≥ 3 chars. The email's local part can
      // be shorter (e.g. "qa@..." → "qa"), so pad with the user id suffix.
      const localPart = data.email.split("@")[0] ?? "";
      const username =
        localPart.length >= 3 ? localPart : `${localPart}_${editingUser.id.slice(-4)}`;
      const provisioned = await provisionAiAccount({
        userId: editingUser.id,
        username,
        email: data.email,
        password: data.password ?? editingUser.password ?? "",
        customerId,
        role: data.role,
      });
      if (provisioned.success) {
        patch.aiUserId = provisioned.data.aiUserId;
        patch.username = username;
      } else {
        console.error("[UsersTab] AI provisioning retry on edit failed:", provisioned.error);
      }
    }

    dispatch(updateTenantUser({ tenantId, userId: editingUser.id, patch }));
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
      <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h2
            id="users-heading"
            className="text-[15px] font-semibold text-(--text-primary)"
          >
            Users ({userCount}/{userLimit})
          </h2>
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
        {/* Single-line description: truncates with an ellipsis and exposes the
            full text via the native tooltip so the header never wraps. */}
        <p
          className="mt-1 text-[12px] text-(--text-secondary) truncate"
          title="Users are the people in your organisation who log in — manage their roles, site access, GxP signatory authority and account status here."
        >
          Users are the people in your organisation who log in — manage their
          roles, site access, GxP signatory authority and account status here.
        </p>
      </div>

      {/* Subscription badge */}
      <div
        className={clsx(
          "flex items-center justify-between p-3 rounded-2xl border",
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
            "rounded-2xl p-3 border",
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

      {/* Table card */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-2xl overflow-hidden">
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
                // Single-site model for every role (QA Head included): one site, or none.
                u.assignedSites.length === 0 ? (
                  <Badge variant="red">No site</Badge>
                ) : (
                  <span
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {u.assignedSites.length} site
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
                  // Part 11 change — opens the password gate instead of
                  // persisting directly (U3).
                  onChange={() => setGxpTarget({ user: u, value: !u.gxpSignatory })}
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
            {
              key: "actions",
              header: "Actions",
              srOnly: true,
              width: "w-[12%]",
              align: "right" as const,
              render: (u: TenantUserConfig) => (
                <div className="inline-flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    aria-label={`View ${u.name}`}
                    onClick={() => setViewUserId(u.id)}
                  />
                  {!readOnly && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Pencil}
                        aria-label={`Edit ${u.name}`}
                        onClick={() => openEdit(u)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        aria-label={`Delete ${u.name}`}
                        onClick={() => setUserToDelete(u)}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* Add modal — UserForm owns its Modal (sticky footer + discard gate). */}
      {addModal && (
        <UserForm
          open
          onClose={() => setAddModal(false)}
          title="Add New User"
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
          submitLabel="Add user"
          submitIcon={UserPlus}
          roleOptions={addRoleOptions}
        />
      )}

      {/* Edit modal */}
      {editModal && editingUser && (
        <UserForm
          key={editingUser.id}
          open
          onClose={() => {
            setEditModal(false);
            setEditingUser(null);
          }}
          title="Edit User"
          defaultValues={{
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role,
            gxpSignatory: editingUser.gxpSignatory,
            status: editingUser.status,
            // Single-site model — never prefill an all-sites assignment; the
            // form normalizes to false and shows the single-site picker.
            allSites: false,
            assignedSites: editingUser.assignedSites ?? [],
            password: "",
            confirmPassword: "",
          }}
          onSubmit={handleEdit}
          submitLabel="Save changes"
          submitIcon={Save}
          roleOptions={roleOptions}
          mode="edit"
        />
      )}

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

      {/* GxP signatory change — Part 11 password gate (U3) */}
      <PasswordConfirmModal
        open={!!gxpTarget}
        onClose={() => setGxpTarget(null)}
        onConfirm={confirmGxpChange}
        title={gxpTarget?.value ? "Grant signatory authority?" : "Revoke signatory authority?"}
        confirmLabel={gxpTarget?.value ? "Grant authority" : "Revoke authority"}
        variant="primary"
        icon={ShieldCheck}
        message={
          <>
            {gxpTarget?.value ? "Granting" : "Revoking"} GxP signatory authority
            for <strong>{gxpTarget?.user.name}</strong> is a Part 11 change. Enter
            your Customer Admin password to confirm.
          </>
        }
      />

      {/* Delete user — recommend inactive over delete + password gate (U7).
          onSuccess also closes the View modal (when the delete was triggered
          from inside it) and toasts. */}
      <PasswordConfirmModal
        open={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        onSuccess={() => {
          setViewUserId(null);
          toast.success("User deleted.");
        }}
        title="Delete this user?"
        confirmLabel="Delete user"
        variant="danger"
        icon={Trash2}
        message={
          <>
            Deleting <strong>{userToDelete?.name}</strong> permanently removes the
            account. We recommend setting the user to <strong>Inactive</strong>{" "}
            instead — an inactive user can&apos;t log in, but their records,
            signatures and audit trail stay intact and reassignable. Enter your
            Customer Admin password to delete.
          </>
        }
      />

      {/* View user modal — read-only details + Change Status / Delete actions,
          each gated behind its own confirmation. */}
      <Modal
        open={!!viewUser}
        onClose={() => setViewUserId(null)}
        title="User details"
        footer={
          !readOnly && viewUser ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                icon={Power}
                onClick={() => setStatusConfirmUser(viewUser)}
              >
                {viewUser.status === "Active" ? "Suspend user" : "Reactivate user"}
              </Button>
              <Button
                type="button"
                variant="danger"
                icon={Trash2}
                onClick={() => setUserToDelete(viewUser)}
              >
                Delete user
              </Button>
            </div>
          ) : undefined
        }
      >
        {viewUser && (
          <div className="space-y-0">
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-(--bg-border)">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">Full name</span>
              <span className="text-[12px] text-(--text-primary) text-right min-w-0 break-words">{viewUser.name}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-(--bg-border)">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">Email</span>
              <span className="text-[12px] text-(--text-primary) text-right min-w-0 break-words">{viewUser.email}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-(--bg-border)">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">Role</span>
              <span className="text-[12px] text-(--text-primary) text-right min-w-0 break-words">{roleLabel(viewUser.role)}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-(--bg-border)">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">Site assignment</span>
              <span className="text-[12px] text-(--text-primary) text-right min-w-0 break-words">{siteNamesFor(viewUser)}</span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5 border-b border-(--bg-border)">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">GxP signatory</span>
              <span className="text-[12px] text-(--text-primary) text-right min-w-0 break-words">
                {viewUser.gxpSignatory ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-[11px] font-medium text-(--text-secondary) shrink-0 pt-0.5">Status</span>
              <span className="text-right min-w-0">
                <Badge variant={viewUser.status === "Active" ? "green" : "gray"}>{viewUser.status}</Badge>
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Change-status confirmation (from the View modal) */}
      <ConfirmModal
        open={!!statusConfirmUser}
        onClose={() => setStatusConfirmUser(null)}
        onConfirm={() => void confirmUserStatusChange()}
        loading={statusBusy}
        icon={Power}
        variant={statusConfirmUser?.status === "Active" ? "warning" : "primary"}
        title={statusConfirmUser?.status === "Active" ? "Suspend this user?" : "Reactivate this user?"}
        confirmLabel={statusConfirmUser?.status === "Active" ? "Suspend" : "Reactivate"}
        message={
          statusConfirmUser?.status === "Active" ? (
            <>
              Suspending <strong>{statusConfirmUser?.name}</strong> stops them
              logging in and removes them from all owner dropdowns. Their records,
              signatures and audit trail are preserved and reassignable.
            </>
          ) : (
            <>
              Reactivating <strong>{statusConfirmUser?.name}</strong> restores
              login access and returns them to the owner dropdowns.
            </>
          )
        }
      />
    </section>
  );
}
