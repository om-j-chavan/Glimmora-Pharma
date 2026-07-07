"use client";

import { useState, useEffect, useMemo } from "react";
import { Upload, Save, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MIN_TAILORED_RETENTION_YEARS } from "@/lib/plans";
import { type AccountFormData, type SaveResult } from "../helpers";
import { AccountInfoFields } from "./account-form/AccountInfoFields";
import { AccountSettingsFields } from "./account-form/AccountSettingsFields";
import { AccountPasswordFields } from "./account-form/AccountPasswordFields";
import { AccountPlanFields } from "./account-form/AccountPlanFields";

/* ── Account Modal (built on the shared Modal primitive) ── */

export function AccountModal({
  open,
  onClose,
  onSave,
  initial,
  mode,
  isSuperAdmin = false,
  currentUserCount = 0,
  currentSiteCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  /** May return a SaveResult so the modal can keep itself open and surface
   *  server-side field errors (e.g. duplicate username/email) inline. */
  onSave: (data: AccountFormData) => void | Promise<SaveResult | void>;
  initial: AccountFormData;
  mode: "create" | "edit";
  /** Tenant-level MFA toggle is super_admin only — customer_admin must not
   *  control MFA on their own tenant. When false, the toggle JSX + help text
   *  are hidden and the parent's save handler skips the toggleTenantMFA call. */
  isSuperAdmin?: boolean;
  /** Tenant's CURRENT active user/site counts. A TAILORED plan's Max users /
   *  Max sites cannot be set below these (equal allowed). 0 in create mode
   *  (no usage yet). Mirrors the server gate in assignPlan. */
  currentUserCount?: number;
  currentSiteCount?: number;
}) {
  const [form, setForm] = useState<AccountFormData>(initial);
  // Per-field "user has interacted" map. A field's error is only surfaced
  // after the user has blurred it or attempted submit — pristine fields stay
  // silent so a fresh modal isn't a wall of red.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Flips true the first time the user clicks Save. After that, every error
  // is visible regardless of touched state — covers the "user never tabbed,
  // just clicked Save" path.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Drag-drop overlay: only shown when the user is actively dragging a file
  // over the modal. Keeps the body uncluttered in the common no-drag state.
  const [isDragging, setIsDragging] = useState(false);
  // Username auto-derive (create form only): while true, the username field
  // mirrors a sanitised version of the email local-part. Flips false the
  // moment super_admin edits the username manually, handing them control.
  // Edit mode starts false so an existing username is never overwritten.
  const [usernameAuto, setUsernameAuto] = useState(mode === "create");
  // Server-side field errors (e.g. duplicate username/email) returned by the
  // save handler. Keyed by form field; shown inline and always visible until
  // the user edits that field. Cleared on reopen.
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(initial);
      setTouched({});
      setSubmitAttempted(false);
      setUsernameAuto(mode === "create");
      setServerErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof AccountFormData>(key: K, value: AccountFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Editing a field clears any stale server error on it (e.g. after fixing a
    // duplicate username) so the inline message disappears immediately.
    setServerErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Errors are derived from form + mode on every render — no setErrors. This
  // lets the inline error text disappear the instant the user fixes a field,
  // without waiting for another submit click to refresh state.
  // Validation rules mirror the server-side Zod schema in
  // src/actions/tenants.ts (CreateTenantSchema) so the modal can't accept
  // values that will fail at the server with "Validation failed". Keep
  // these in lockstep when the schema changes.
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const name = form.customerName.trim();
    if (!name) e.customerName = "Required";
    else if (name.length < 2) e.customerName = "Must be at least 2 characters";

    const uname = form.username.trim();
    if (!uname) e.username = "Required";
    else if (uname.length < 2) e.username = "Must be at least 2 characters";
    else if (!/^[a-z0-9_]+$/.test(uname)) e.username = "Lowercase letters, digits, and underscores only";

    const email = form.email.trim();
    if (!email) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";

    // Regulatory Region is REQUIRED on create (Stage 5) — a tenant must have a
    // region for its effective frameworks to resolve. Not forced on edit.
    if (mode === "create" && !form.regulatoryRegion.trim()) {
      e.regulatoryRegion = "Regulatory Region is required";
    }

    if (mode === "create") {
      if (!form.newPassword) e.newPassword = "Required";
      else if (form.newPassword.length < 8) e.newPassword = "Password must be at least 8 characters";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    } else if (form.newPassword) {
      if (form.newPassword.length < 8) e.newPassword = "Password must be at least 8 characters";
      if (form.newPassword !== form.confirmPassword) e.confirmPassword = "Passwords don't match";
    }

    // Plan caps — only when a plan is assigned. Each cap is otherwise floored
    // to 1 server-side (resolvePlanCaps) and saved with no warning (Bug 2), so
    // block an empty/<1 value here with an inline message, like the fields
    // above. Retention is minRetentionYears — a minimum with the same ≥1 floor
    // as users/sites (see resolvePlanCaps / validateTailoredCaps in plans.ts).
    if (form.plan) {
      if (!Number.isFinite(form.plan.maxUsers) || form.plan.maxUsers < 1) {
        e.planMaxUsers = "Max users must be at least 1";
      } else if (form.plan.tier === "TAILORED" && form.plan.maxUsers < currentUserCount) {
        // TAILORED only — can't set a cap below current active usage (equal ok).
        // Mirrors the authoritative server gate in assignPlan.
        e.planMaxUsers = `Cannot set Max users below current usage: ${currentUserCount} user${currentUserCount === 1 ? "" : "s"} active`;
      }
      if (!Number.isFinite(form.plan.maxSites) || form.plan.maxSites < 1) {
        e.planMaxSites = "Max sites must be at least 1";
      } else if (form.plan.tier === "TAILORED" && form.plan.maxSites < currentSiteCount) {
        e.planMaxSites = `Cannot set Max sites below current usage: ${currentSiteCount} site${currentSiteCount === 1 ? "" : "s"} active`;
      }
      if (!Number.isFinite(form.plan.minRetentionYears) || form.plan.minRetentionYears < 1) {
        e.planRetention = "Retention must be at least 1 year";
      } else if (form.plan.tier === "TAILORED" && form.plan.minRetentionYears < MIN_TAILORED_RETENTION_YEARS) {
        // TAILORED only — retention is a compliance FLOOR (not a usage count);
        // can't promise below the 7-year Part 11 floor. Mirrors the server gate.
        e.planRetention = `Retention must be at least ${MIN_TAILORED_RETENTION_YEARS} years (compliance floor)`;
      }
      if (!Number.isFinite(form.plan.durationMonths) || form.plan.durationMonths < 1) {
        e.planDuration = "Duration must be at least 1 month";
      }
    }

    return e;
  }, [form, mode, currentUserCount, currentSiteCount]);

  // Server field errors override/augment the derived client errors so the same
  // inline slot shows either. Client validation runs first on submit, so these
  // only ever appear for things the client can't know (uniqueness).
  const shownErrors: Record<string, string> = { ...errors, ...serverErrors };

  // A field-level error is "visible" once the user has interacted with that
  // field OR clicked Save. Server errors are always visible until edited.
  const errorVisible = (name: string): boolean =>
    !!serverErrors[name] || ((touched[name] || submitAttempted) && !!errors[name]);

  const handleSubmit = async () => {
    if (Object.keys(errors).length > 0) return;
    const result = await onSave(form);
    // A save that returns ok:false (e.g. duplicate username/email) keeps the
    // modal open and lights up the offending field(s); otherwise close.
    if (result && result.ok === false) {
      if (result.fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs && msgs.length) flat[field] = msgs[0];
        }
        setServerErrors(flat);
      }
      return;
    }
    onClose();
  };

  // Live form-validity check for the Save button's disabled state. Mirrors
  // validate() but is pure (no setErrors side effect) so it runs every render.
  // Gates required-ness, username/email format, the 8-char password floor
  // (Part-11 minimum), and the confirm-match.
  const canSave =
    form.customerName.trim().length >= 2 &&
    form.username.trim().length >= 2 &&
    /^[a-z0-9_]+$/.test(form.username.trim()) &&
    form.email.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    // Region required on create (Stage 5); not forced on edit.
    (mode === "edit" || form.regulatoryRegion.trim().length > 0) &&
    (mode === "edit"
      ? (!form.newPassword || (form.newPassword.length >= 8 && form.newPassword === form.confirmPassword))
      : form.newPassword.length >= 8 && form.newPassword === form.confirmPassword) &&
    // Plan, when assigned, must have all caps >= 1 (users/sites/retention) (Bug 2).
    (!form.plan ||
      (Number.isFinite(form.plan.maxUsers) && form.plan.maxUsers >= 1 &&
        Number.isFinite(form.plan.maxSites) && form.plan.maxSites >= 1 &&
        Number.isFinite(form.plan.minRetentionYears) && form.plan.minRetentionYears >= 1 &&
        Number.isFinite(form.plan.durationMonths) && form.plan.durationMonths >= 1 &&
        // TAILORED: caps may not drop below current active usage, and retention
        // may not drop below the compliance floor (equal ok for both).
        (form.plan.tier !== "TAILORED" || (form.plan.maxUsers >= currentUserCount && form.plan.maxSites >= currentSiteCount && form.plan.minRetentionYears >= MIN_TAILORED_RETENTION_YEARS))));

  // Footer: the "please complete" hint strip + Cancel/Save buttons.
  const labels: Record<string, string> = {
    customerName: "Customer Name",
    username: "Username",
    email: "Email",
    regulatoryRegion: "Regulatory Region",
    newPassword: "Password",
    confirmPassword: "Confirm Password",
    planMaxUsers: "Max users",
    planMaxSites: "Max sites",
    planRetention: "Retention (yr)",
    planDuration: "Duration (mo)",
  };
  const blockingFields = Object.keys(errors).filter((k) => labels[k]).map((k) => labels[k]);
  const showHint = blockingFields.length > 0 && (Object.values(touched).some(Boolean) || submitAttempted);

  const footer = (
    <div>
      {/* "Fill this" hint slot — ALWAYS rendered. visibility toggles on showHint
          so the strip doesn't shift the rest of the footer the first time the
          user blurs a field. Amber, not red: red is for the field-level error
          text below each input. */}
      <div className="pb-2" aria-hidden={!showHint}>
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-[#f59e0b]/40 bg-[#fef9ed] px-3 py-2"
          style={{ visibility: showHint ? "visible" : "hidden" }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b45309]" aria-hidden="true" />
          <div className="text-xs text-[#7a5320]">
            <span className="font-semibold">Please complete:</span>{" "}
            {showHint ? blockingFields.join(", ") : " "}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        {/* Save button stays clickable even when invalid — the click trips
            submitAttempted so the hint strip + inline errors surface
            immediately. opacity-50 is the visual cue that it won't submit yet;
            the title gives a hover explanation. */}
        <span title={!canSave ? `Complete: ${blockingFields.join(", ")}` : undefined}>
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            onClick={() => {
              setSubmitAttempted(true);
              handleSubmit();
            }}
            className={canSave ? "" : "opacity-50 cursor-not-allowed"}
          >
            {mode === "create" ? "Save Account" : "Save Changes"}
          </Button>
        </span>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New Account" : "Edit Account"}
      persistent
      footer={footer}
    >
      {/* Drag-drop logo zone wraps the form body; the overlay shows during an
          active drag and dropping a PNG/JPG sets the logo file. */}
      <div
        className="relative space-y-5"
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          // Only clear when leaving the body entirely — not when entering a child.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && (f.type === "image/png" || f.type === "image/jpeg")) set("logoFile", f);
        }}
      >
        {/* Drop overlay — visible only during active drag */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none" style={{ background: "var(--brand-muted)", border: "2px dashed var(--brand)" }}>
            <div className="text-center">
              <Upload className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <p className="text-[13px] font-semibold" style={{ color: "var(--brand)" }}>Drop logo here</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>PNG or JPG, max 5MB</p>
            </div>
          </div>
        )}

        {/* Sub-heading carried over from the old rich header (the Modal header
            is plain title + close), so no information is lost. */}
        {/* <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {mode === "create" ? "Create a new tenant and its Customer Administrator account." : form.customerName}
        </p> */}

        <AccountInfoFields
          form={form}
          set={set}
          markTouched={markTouched}
          errorVisible={errorVisible}
          errors={shownErrors}
          usernameAuto={usernameAuto}
          setUsernameAuto={setUsernameAuto}
        />

        <AccountSettingsFields
          form={form}
          set={set}
          mode={mode}
          isSuperAdmin={isSuperAdmin}
          regionError={errorVisible("regulatoryRegion") ? shownErrors.regulatoryRegion : undefined}
        />

        {/* Plan assignment is now an inline section of the form — no separate
            popup. The account's single Save submits the plan with it. */}
        <AccountPlanFields
          plan={form.plan}
          onPlanChange={(p) => set("plan", p)}
          maxUsersError={errorVisible("planMaxUsers") ? errors.planMaxUsers : undefined}
          onMaxUsersBlur={() => markTouched("planMaxUsers")}
          maxSitesError={errorVisible("planMaxSites") ? errors.planMaxSites : undefined}
          onMaxSitesBlur={() => markTouched("planMaxSites")}
          retentionError={errorVisible("planRetention") ? errors.planRetention : undefined}
          onRetentionBlur={() => markTouched("planRetention")}
          durationError={errorVisible("planDuration") ? errors.planDuration : undefined}
          onDurationBlur={() => markTouched("planDuration")}
        />

        <AccountPasswordFields
          form={form}
          set={set}
          markTouched={markTouched}
          errorVisible={errorVisible}
          errors={errors}
          mode={mode}
        />
      </div>
    </Modal>
  );
}
