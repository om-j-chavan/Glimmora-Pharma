"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  addTenant,
  updateTenant,
  removeTenant,
  setTenants,
  setTenantPlan,
  type Tenant,
} from "@/store/auth.slice";
import { fetchTenants, createTenantApi, updateTenantApi, TenantApiError } from "@/lib/tenantApi";
import { toggleTenantMFA, assignPlan, suspendTenant, softDeleteTenant, restoreTenant, updateTenantLogo } from "@/actions/tenants";
import { setTenantRoleLimits } from "@/actions/roleLimits";
import { resolvePlanCaps, resolveExpiry } from "@/lib/plans";
import dayjs from "@/lib/dayjs";
import { useToast } from "@/components/ui/Toast";
import {
  type AccountFormData,
  type AccountCardFilter,
  type PlanDraft,
  type SaveResult,
  makeEmptyForm,
  makePlanDraft,
  planConfigToDraft,
  draftToPlanConfig,
  mapCustomerError,
  matchesCardFilter,
  isExpiringSoon,
  isNearCap,
  hasNoPlan,
  isSuspendedTenant,
} from "./helpers";

/**
 * Data hook for the Customer Accounts screen — owns all state, the tenant
 * hydration effect, and every handler (create/edit/save, suspend/reactivate,
 * stat-card filtering, post-create plan assignment). The page component is a
 * thin orchestrator that consumes this. MFA changes live in the detail/edit
 * surfaces, not the list.
 */
export function useCustomerAccounts({
  initialTenants,
  isSuperAdmin: isSuperAdminProp,
}: { initialTenants?: Tenant[]; isSuperAdmin?: boolean }) {
  const dispatch = useAppDispatch();
  const tenants = useAppSelector((s) => s.auth.tenants);
  // MFA toggle column is super-admin-only — customer_admin can see /admin
  // but must NOT control tenant-level MFA on themselves or others.
  // Server-passed prop is the source of truth for SSR-affected branches;
  // Redux fallback covers any caller that doesn't supply the prop yet.
  const reduxRole = useAppSelector((s) => s.auth.user?.role);
  const isSuperAdmin = isSuperAdminProp ?? reduxRole === "super_admin";

  // Active stat-card filter (null = show all). Toggling the same card clears it.
  // Search + the five column dropdown filters now live inside the DataTable widget.
  const [cardFilter, setCardFilter] = useState<AccountCardFilter | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  // Suspend (replaces hard delete) — confirmation gate + in-flight flag.
  const [suspendingTenant, setSuspendingTenant] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState(false);
  // Table Suspend/Delete confirmation is action-backed (suspendTenant /
  // softDeleteTenant server actions) — shared in-flight flag for its buttons.
  const [tableActionBusy, setTableActionBusy] = useState(false);
  // Restore list (all soft-deleted tenants) + per-row restore in-flight id, and
  // the tenant currently queued for password-gated permanent delete.
  const [restoreListOpen, setRestoreListOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Tenant | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Post-create subscription flow
  const [postCreateSubOpen, setPostCreateSubOpen] = useState(false);
  const [postCreateTenantId, setPostCreateTenantId] = useState<string | null>(null);
  const [postCreateSubData, setPostCreateSubData] = useState<PlanDraft>(makePlanDraft());
  // Renew (time-only) flow — extends an existing plan's term; tier + caps stay.
  const [renewingTenant, setRenewingTenant] = useState<Tenant | null>(null);
  const [renewDraft, setRenewDraft] = useState<PlanDraft | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [savedPopup, setSavedPopup] = useState<string | null>(null);
  const toast = useToast();

  const router = useRouter();

  // Hydrate Redux from server-fetched tenants (provided by the async Server Component).
  // Falls back to client-side fetch only if initialTenants was not supplied.
  const initialSeeded = useRef(false);
  useEffect(() => {
    if (initialTenants && !initialSeeded.current) {
      dispatch(setTenants(initialTenants));
      initialSeeded.current = true;
      return;
    }
    if (initialSeeded.current) return;
    let cancelled = false;
    setSyncing(true);
    fetchTenants()
      .then((remote) => {
        if (cancelled) return;
        dispatch(setTenants(remote));
        setSyncError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message ?? "";
        if (msg.includes("Not authenticated")) {
          router.push("/login");
          return;
        }
        if (msg.includes("Insufficient permissions")) {
          router.push("/");
          return;
        }
        console.error("[admin] tenant sync failed", err);
        setSyncError(
          "Could not sync customers from the database. Showing local cache only.",
        );
      })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
  }, [dispatch, initialTenants, router]);

  // Actionable stat-card counts — computed over ALL tenants, not the filtered set.
  const stats = {
    expiring: tenants.filter(isExpiringSoon).length,
    nearcap: tenants.filter(isNearCap).length,
    noplan: tenants.filter(hasNoPlan).length,
    suspended: tenants.filter(isSuspendedTenant).length,
  };

  // Toggle a stat-card filter: clicking the active card again clears it.
  const selectCardFilter = (filter: AccountCardFilter) =>
    setCardFilter((current) => (current === filter ? null : filter));

  // Clears the page-level stat-card quick-filter. The widget owns (and clears)
  // its own search + column filters; the page also remounts the widget on
  // "Clear filters" to wipe that internal state alongside this.
  const clearAllFilters = () => setCardFilter(null);

  const hasActiveFilters = cardFilter !== null;

  // Soft-deleted tenants belong in the Restore modal, NOT the active table —
  // exclude them so the main list only shows ACTIVE + SUSPENDED accounts (whose
  // row actions differ by status). deletedTenants (below) feeds the Restore modal.
  const activeAndSuspended = tenants.filter((t) => !t.deletedAt);

  // Page-level narrowing = the stat-card quick-filter only. Search and the five
  // column filters are applied inside the DataTable widget on top of this set.
  const cardFilteredTenants = activeAndSuspended.filter((t) =>
    cardFilter ? matchesCardFilter(t, cardFilter) : true,
  );

  const openCreate = () => {
    setEditingTenant(null);
    setModalOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTenant(null);
  };

  const handleSave = async (data: AccountFormData): Promise<SaveResult> => {
    if (editingTenant) {
      // Update existing admin user in the tenant's user list
      const updatedUsers = editingTenant.config.users.map((u) =>
        u.role === "customer_admin" || u.role === "super_admin"
          ? {
              ...u,
              name: data.customerName,
              email: data.email,
              username: data.username,
              // Only overwrite password if a new one was entered
              ...(data.newPassword ? { password: data.newPassword } : {}),
              status: data.active ? "Active" as const : "Inactive" as const,
            }
          : u,
      );
      const patch: Partial<Tenant> = {
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        plan: data.plan ? draftToPlanConfig(data.plan, editingTenant.plan?.id ?? `plan-${Date.now()}`) : null,
        config: {
          ...editingTenant.config,
          org: {
            ...editingTenant.config.org,
            companyName: data.customerName,
            timezone: data.timezone,
            // Multi-region: carry the SET; shim = regions[0] kept in sync locally.
            regions: data.regulatoryRegions,
            regulatoryRegion: data.regulatoryRegions[0] ?? "",
          },
          users: updatedUsers,
        },
      };
      // Server-first: write to the DB first; only mutate Redux on success.
      // Prevents the "saved locally but not in DB" phantom state that left
      // the tenant unreachable for login on subsequent attempts.
      try {
        await updateTenantApi(editingTenant.id, patch);
        dispatch(updateTenant({ id: editingTenant.id, patch }));
        // updateTenantApi only carries name/email/active — persist the plan
        // separately via assignPlan (caps are frozen server-side).
        if (data.plan) {
          const planRes = await assignPlan({
            tenantId: editingTenant.id,
            tier: data.plan.tier,
            displayName: data.plan.tier === "TAILORED" ? (data.plan.displayName || undefined) : undefined,
            maxUsers: data.plan.maxUsers,
            maxSites: data.plan.maxSites,
            minRetentionYears: data.plan.minRetentionYears,
            durationMonths: data.plan.durationMonths,
            startDate: data.plan.startDate,
          });
          if (!planRes.success) {
            // Surface, don't swallow. Roll back the optimistic plan update
            // (mirrors the MFA rollback below) so Redux matches the DB, and
            // tell the user instead of falsely reporting success.
            dispatch(updateTenant({ id: editingTenant.id, patch: { plan: editingTenant.plan } }));
            toast.error(`${data.customerName} updated, but its plan could not be saved: ${planRes.error}`);
            return { ok: false };
          }
        }
        setSyncError(null);
        toast.success(`Customer ${data.customerName} updated.`);
      } catch (err) {
        console.error("[admin] failed to persist tenant update", err);
        setSyncError(null);
        toast.error(`Could not update ${data.customerName}: ${mapCustomerError(err)}`);
        return { ok: false };
      }
      // MFA changes route through toggleTenantMFA so the audit pair and
      // sessionsValidAfter bump fire. Don't include mfaEnabled in the
      // generic patch — that would skip the audit/session-invalidation.
      // Defensive: only super_admin can change MFA. The modal's MFA toggle is
      // already gated, so this is a belt-and-braces check against future
      // callers that might not enforce the UI gate.
      if (isSuperAdmin && data.mfaEnabled !== !!editingTenant.mfaEnabled) {
        try {
          const result = await toggleTenantMFA(editingTenant.id, data.mfaEnabled);
          if (!result.success) {
            // Roll back the optimistic local flip done above by re-dispatching.
            dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: !!editingTenant.mfaEnabled } }));
            setSyncError(friendlyError(result.error));
          } else {
            dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: data.mfaEnabled } }));
          }
        } catch (err) {
          console.error("[admin] toggleTenantMFA failed", err);
          dispatch(updateTenant({ id: editingTenant.id, patch: { mfaEnabled: !!editingTenant.mfaEnabled } }));
          setSyncError(friendlyError(undefined));
        }
      }
      // Logo — the modal collects a CROPPED 256px JPEG data URL (form.logoDataUrl)
      // via the shared LogoCropModal (return-mode). Persist via the SAME
      // updateTenantLogo action the View's crop modal uses (server writes
      // Tenant.logoUrl + revalidatePath("/admin")), then reflect it in Redux so
      // the View header AND the accounts table update immediately. Best-effort:
      // a logo failure never undoes the (already-saved) account.
      if (data.logoDataUrl) {
        try {
          const logoRes = await updateTenantLogo(editingTenant.id, data.logoDataUrl);
          if (logoRes.success) {
            dispatch(updateTenant({ id: editingTenant.id, patch: { logoUrl: data.logoDataUrl } }));
          } else {
            toast.error(`${data.customerName} updated, but the logo could not be saved: ${logoRes.error}`);
          }
        } catch (err) {
          console.error("[admin] logo save failed", err);
          toast.error(`${data.customerName} updated, but the logo could not be saved.`);
        }
      }
      return { ok: true };
    } else {
      const tenantId = `tenant-${Date.now()}`;
      // Customer admin user id: reuse the tenant id so the admin record has a
      // stable, predictable handle without any external AI-backend signup.
      const adminUserId = tenantId;

      const newTenant: Tenant = {
        id: tenantId,
        name: data.customerName,
        adminEmail: data.email,
        active: data.active,
        mfaEnabled: data.mfaEnabled,
        // Stamp createdAt on the optimistic row so the "Created" column renders
        // immediately (the server default is now()); a later getTenants() reload
        // replaces it with the authoritative value.
        createdAt: new Date().toISOString(),
        plan: data.plan ? draftToPlanConfig(data.plan, `plan-${Date.now()}`) : null,
        config: {
          org: {
            companyName: data.customerName,
            timezone: data.timezone,
            dateFormat: "DD/MM/YYYY",
            // Multi-region: SET + primary shim (regions[0]) for the optimistic row.
            regions: data.regulatoryRegions,
            regulatoryRegion: data.regulatoryRegions[0] ?? "",
          },
          sites: [],
          users: [
            {
              id: adminUserId,
              name: data.customerName,
              email: data.email,
              username: data.username,
              password: data.newPassword,
              role: "customer_admin",
              gxpSignatory: true,
              status: "Active",
              assignedSites: [],
              allSites: true,
            },
          ],
        },
      };
      // Server-first: write to the DB first; only insert into Redux on
      // success. Prevents the "saved locally but not in DB" phantom state
      // that left the new customer unable to sign in (the DB lookup at
      // login would return nothing while Redux still showed the row).
      try {
        const created = await createTenantApi(newTenant);
        // Reflect the server-allocated Tenant ID (TEN-YYYY-NNNN) on the
        // optimistic row so the detail View shows it immediately (no reload).
        newTenant.customerCode = created.customerCode ?? undefined;
      } catch (err) {
        console.error("[admin] failed to persist new tenant", err);
        setSyncError(null);
        if (err instanceof TenantApiError && err.planAssignmentFailed) {
          // The tenant row WAS created; only its plan failed. Show it (as a
          // plan-less Active account, matching the DB) and surface a
          // plan-specific error instead of a misleading "could not create".
          // This makes the no-plan state visible; it does not prevent it
          // (see the create+assign atomicity note in tenantApi.ts).
          dispatch(addTenant({ ...newTenant, plan: null }));
          toast.error(`${data.customerName} created, but its plan could not be assigned: ${err.message}`);
          return { ok: false };
        }
        // Duplicate username/email (and other Zod field failures) carry a
        // per-field error map — hand it back so the modal lights up the exact
        // input inline and stays open, instead of only flashing a toast.
        if (err instanceof TenantApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          return { ok: false, fieldErrors: err.fieldErrors };
        }
        toast.error(`Could not create ${data.customerName}: ${mapCustomerError(err)}`);
        return { ok: false };
      }
      dispatch(addTenant(newTenant));
      setSyncError(null);
      toast.success(`Customer ${data.customerName} created.`);

      // Logo — the Create modal now collects a CROPPED 256px JPEG data URL
      // (form.logoDataUrl) via the shared LogoCropModal. The create branch
      // previously DROPPED it (collect-and-persist was never wired), so a logo
      // chosen at creation never reached Tenant.logoUrl. Hook it HERE, after
      // createTenantApi + addTenant — the tenant row now exists under `tenantId`
      // (the same id setTenantRoleLimits below writes to), so updateTenantLogo
      // attaches logoUrl to a real record. Persist via the SAME action the View
      // uses, then reflect in Redux so the table + detail show it immediately.
      // Best-effort: a logo failure toasts but does NOT roll back the tenant.
      if (data.logoDataUrl) {
        try {
          const logoRes = await updateTenantLogo(tenantId, data.logoDataUrl);
          if (logoRes.success) {
            dispatch(updateTenant({ id: tenantId, patch: { logoUrl: data.logoDataUrl } }));
          } else {
            toast.error(`${data.customerName} created, but the logo could not be saved: ${logoRes.error}. Set it from the tenant's detail page.`);
          }
        } catch (err) {
          console.error("[admin] logo save on create failed", err);
          toast.error(`${data.customerName} created, but the logo could not be saved. Set it from the tenant's detail page.`);
        }
      }

      // Deferred Phase-C 2a — Tailored per-role caps. The tenant + plan now exist
      // (createTenantApi assigned the plan), so persist the initial caps via
      // setTenantRoleLimits. BEST-EFFORT: a caps failure surfaces a toast but does
      // NOT roll back the created tenant (the caps are editable on the tenant later).
      const hasInitialCaps = data.initialRoleCaps && Object.values(data.initialRoleCaps).some((v) => v !== null);
      if (data.plan?.tier === "TAILORED" && hasInitialCaps && data.initialRoleCaps) {
        try {
          const capRes = await setTenantRoleLimits(tenantId, data.initialRoleCaps);
          if (!capRes.success) {
            toast.error(`${data.customerName} created, but role limits couldn't be saved: ${capRes.error}. Set them from the tenant's Role Limits.`);
          }
        } catch (err) {
          console.error("[admin] setTenantRoleLimits on create failed", err);
          toast.error(`${data.customerName} created, but role limits couldn't be saved. Set them from the tenant's Role Limits.`);
        }
      }

      // Auto-open the plan-assignment modal if no plan was set in the drawer
      if (!data.plan) {
        setPostCreateTenantId(tenantId);
        setPostCreateSubData(makePlanDraft());
        setPostCreateSubOpen(true);
      } else {
        setSavedPopup("Account and plan created");
      }
      return { ok: true };
    }
  };

  // Translate server-action error codes into user-facing sentences. The raw
  // codes ("FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED") were leaking into the
  // sync banner verbatim, which is confusing to non-developers and obscures
  // the actual remediation step. Used at every MFA error surface.
  const friendlyError = (code: string | undefined): string => {
    if (code === "FORBIDDEN") return "Only Super Admin can change MFA settings.";
    if (code === "NOT_FOUND") return "Tenant not found.";
    if (code === "UNAUTHORIZED") return "Your session has expired. Please log in again.";
    return code || "Failed to update MFA setting.";
  };

  // ── Suspend / reactivate (lifecycle = tenant.active). Replaces hard delete —
  // this product is soft-delete only. BOTH directions route through the same
  // confirmation modal; confirmSuspend flips to the opposite of the target's
  // current active state. Persistence mirrors the edit modal's Active toggle
  // (updateTenantApi forwards isActive → TENANT_SUSPENDED / TENANT_REACTIVATED). ──
  const requestSuspend = (tenant: Tenant) => setSuspendingTenant(tenant);

  const setActive = async (tenant: Tenant, active: boolean) => {
    // Optimistic local flip.
    dispatch(updateTenant({ id: tenant.id, patch: { active } }));
    try {
      await updateTenantApi(tenant.id, { active });
      toast.success(`${tenant.name} ${active ? "reactivated" : "suspended"}.`);
    } catch (err) {
      console.error("[admin] set tenant active failed", err);
      dispatch(updateTenant({ id: tenant.id, patch: { active: !active } }));
      setSyncError(`Failed to ${active ? "reactivate" : "suspend"} the account.`);
      throw err;
    }
  };

  const confirmSuspend = async () => {
    if (!suspendingTenant) return;
    setSuspending(true);
    const t = suspendingTenant;
    try {
      // Flip to the opposite of the current state: active → suspend, suspended → reactivate.
      await setActive(t, !t.active);
    } catch {
      // error already surfaced via setSyncError in setActive
    } finally {
      setSuspending(false);
      setSuspendingTenant(null);
    }
  };

  // ── Table Suspend/Delete (from the shared 3-button confirmation) — routed
  // through the dedicated server actions so the SUSPENDED vs soft-DELETED audit
  // + sessionsValidAfter bump fire, and a soft-deleted tenant surfaces in the
  // Restore list. Redux is mirrored so the row updates immediately. ──
  const doTableSuspend = async () => {
    if (!suspendingTenant) return;
    const t = suspendingTenant;
    setTableActionBusy(true);
    const res = await suspendTenant(t.id);
    setTableActionBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenant({ id: t.id, patch: { active: false, deletedAt: null } }));
    toast.success(`${t.name} suspended.`);
    setSuspendingTenant(null);
  };

  const doTableSoftDelete = async () => {
    if (!suspendingTenant) return;
    const t = suspendingTenant;
    setTableActionBusy(true);
    const res = await softDeleteTenant(t.id);
    setTableActionBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenant({ id: t.id, patch: { active: false, deletedAt: new Date().toISOString() } }));
    toast.success(`${t.name} deleted. Restore it from the Restore list.`);
    setSuspendingTenant(null);
  };

  // ── Restore list (soft-deleted tenants) + password-gated permanent delete ──
  const deletedTenants = tenants.filter((t) => !!t.deletedAt);
  const openRestoreList = () => setRestoreListOpen(true);
  const closeRestoreList = () => setRestoreListOpen(false);

  const restoreFromList = async (t: Tenant) => {
    setRestoringId(t.id);
    const res = await restoreTenant(t.id);
    setRestoringId(null);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenant({ id: t.id, patch: { active: true, deletedAt: null } }));
    toast.success(`${t.name} restored. The tenant and its users can log in again.`);
  };

  const requestPurge = (t: Tenant) => setPurgeTarget(t);
  const closePurge = () => setPurgeTarget(null);
  const onPurged = (id: string) => {
    dispatch(removeTenant(id));
    setPurgeTarget(null);
  };

  const getFormData = (): AccountFormData => {
    if (!editingTenant) return makeEmptyForm();
    const admin = editingTenant.config.users.find(
      (u) => u.role === "customer_admin" || u.role === "super_admin",
    );
    return {
      customerName: editingTenant.name,
      username: admin?.username ?? admin?.email?.split("@")[0] ?? "",
      email: editingTenant.adminEmail,
      language: "English, United States",
      timezone: editingTenant.config.org.timezone,
      // Prefill from the tenant's region SET; fall back to the single shim for a
      // tenant fetched/seeded without the set.
      regulatoryRegions: editingTenant.config.org.regions?.length
        ? editingTenant.config.org.regions
        : editingTenant.config.org.regulatoryRegion
          ? [editingTenant.config.org.regulatoryRegion]
          : [],
      active: editingTenant.active,
      mfaEnabled: !!editingTenant.mfaEnabled,
      newPassword: "",
      confirmPassword: "",
      plan: editingTenant.plan ? planConfigToDraft(editingTenant.plan) : null,
      logoDataUrl: null,
    };
  };

  // ── Post-create plan flow ──
  const postCreateClose = () => {
    setPostCreateSubOpen(false);
    setPostCreateTenantId(null);
    setSavedPopup("Account created (no subscription)");
  };
  const postCreateSkip = () => {
    setPostCreateSubOpen(false);
    setPostCreateTenantId(null);
    setSavedPopup("Account created — no subscription added");
  };
  const assignPostCreatePlan = async () => {
    if (!postCreateTenantId) return;
    const tenant = tenants.find((t) => t.id === postCreateTenantId);
    if (!tenant) return;
    const draft = postCreateSubData;
    const res = await assignPlan({
      tenantId: postCreateTenantId,
      tier: draft.tier,
      displayName: draft.tier === "TAILORED" ? (draft.displayName || undefined) : undefined,
      maxUsers: draft.maxUsers,
      maxSites: draft.maxSites,
      minRetentionYears: draft.minRetentionYears,
      durationMonths: draft.durationMonths,
      startDate: draft.startDate,
    });
    if (!res.success) {
      toast.error(`Could not assign plan: ${res.error}`);
      return;
    }
    dispatch(setTenantPlan({ tenantId: postCreateTenantId, plan: draftToPlanConfig(draft, `plan-${Date.now()}`) }));
    setPostCreateSubOpen(false);
    setPostCreateTenantId(null);
    setSavedPopup("Account and plan created");
  };

  // ── Renew (time-only) ── extends the term; tier + caps are NOT touched here.
  const openRenew = (tenant: Tenant) => {
    if (!tenant.plan) return;
    const base = planConfigToDraft(tenant.plan); // tier + caps carried as-is
    // New start = max(current expiry, today): keep unused days if the plan is
    // still valid, else start today. Mirrors the page's planExpired comparison
    // (dayjs() vs dayjs.utc(expiry)).
    const expiredNow = dayjs().isAfter(dayjs.utc(tenant.plan.expiryDate));
    const startDate = expiredNow
      ? dayjs().format("YYYY-MM-DD")
      : dayjs.utc(tenant.plan.expiryDate).format("YYYY-MM-DD");
    // Default term from the current tier preset (fixed → 12; TAILORED clamps
    // the plan's current custom term) — same auto-fill rule as the editor.
    const months = resolvePlanCaps(base.tier, { durationMonths: base.durationMonths }).durationMonths;
    setRenewDraft({
      ...base,
      durationMonths: months,
      startDate,
      expiryDate: dayjs.utc(resolveExpiry(startDate, months)).format("YYYY-MM-DD"),
    });
    setRenewingTenant(tenant);
  };
  // TAILORED-only term edit; recompute the read-only expiry preview.
  const setRenewMonths = (n: number) => {
    setRenewDraft((d) =>
      d ? { ...d, durationMonths: n, expiryDate: Number.isFinite(n) ? dayjs.utc(resolveExpiry(d.startDate, n)).format("YYYY-MM-DD") : "" } : d,
    );
  };
  const closeRenew = () => {
    if (!renewing) { setRenewingTenant(null); setRenewDraft(null); }
  };
  const confirmRenew = async () => {
    if (!renewingTenant || !renewDraft) return;
    const d = renewDraft;
    if (!Number.isFinite(d.durationMonths) || d.durationMonths < 1) {
      toast.error("Term must be at least 1 month.");
      return;
    }
    setRenewing(true);
    // Reuse the editor's write path (assignPlan). Tier + caps are passed back
    // UNCHANGED so only the term/dates move; expiry is derived server-side.
    // renewal: true → audited as PLAN_RENEWED.
    const res = await assignPlan({
      tenantId: renewingTenant.id,
      tier: d.tier,
      displayName: d.tier === "TAILORED" ? (d.displayName || undefined) : undefined,
      maxUsers: d.maxUsers,
      maxSites: d.maxSites,
      minRetentionYears: d.minRetentionYears,
      durationMonths: d.durationMonths,
      startDate: d.startDate,
      renewal: true,
    });
    setRenewing(false);
    if (!res.success) {
      toast.error(`Could not renew plan: ${res.error}`);
      return;
    }
    dispatch(setTenantPlan({ tenantId: renewingTenant.id, plan: draftToPlanConfig(d, renewingTenant.plan?.id ?? `plan-${Date.now()}`) }));
    const newExpiry = dayjs.utc(resolveExpiry(d.startDate, d.durationMonths)).format("DD MMM YYYY");
    const name = renewingTenant.name;
    setRenewingTenant(null);
    setRenewDraft(null);
    toast.success(`${name} renewed — expires ${newExpiry}.`);
  };

  return {
    tenants,
    cardFilteredTenants,
    isSuperAdmin,
    syncing,
    syncError,
    // actionable stat-card filters
    stats,
    cardFilter,
    selectCardFilter,
    clearAllFilters,
    hasActiveFilters,
    // create/edit drawer
    modalOpen,
    editingTenant,
    openCreate,
    openEdit,
    closeModal,
    handleSave,
    getFormData,
    // suspend / reactivate (soft lifecycle — replaces hard delete)
    suspendingTenant,
    setSuspendingTenant,
    suspending,
    requestSuspend,
    confirmSuspend,
    // table 3-button suspend/soft-delete (server-action backed)
    tableActionBusy,
    doTableSuspend,
    doTableSoftDelete,
    // restore list + password-gated permanent delete
    deletedTenants,
    restoreListOpen,
    openRestoreList,
    closeRestoreList,
    restoringId,
    restoreFromList,
    purgeTarget,
    requestPurge,
    closePurge,
    onPurged,
    // post-create plan
    postCreateSubOpen,
    postCreateTenantId,
    postCreateSubData,
    setPostCreateSubData,
    postCreateClose,
    postCreateSkip,
    assignPostCreatePlan,
    // renew (time-only)
    renewingTenant,
    renewDraft,
    renewing,
    openRenew,
    setRenewMonths,
    confirmRenew,
    closeRenew,
    // success toast
    savedPopup,
    setSavedPopup,
  };
}
