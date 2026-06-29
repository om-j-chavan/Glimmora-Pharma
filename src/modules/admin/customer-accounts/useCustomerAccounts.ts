"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import {
  addTenant,
  updateTenant,
  setTenants,
  setTenantPlan,
  type Tenant,
} from "@/store/auth.slice";
import { fetchTenants, createTenantApi, updateTenantApi, TenantApiError } from "@/lib/tenantApi";
import { toggleTenantMFA, assignPlan } from "@/actions/tenants";
import { useToast } from "@/components/ui/Toast";
import {
  type AccountFormData,
  type AccountCardFilter,
  type AccountFilters,
  type PlanDraft,
  makeEmptyForm,
  makePlanDraft,
  planConfigToDraft,
  draftToPlanConfig,
  mapCustomerError,
  matchesCardFilter,
  matchesFilters,
  filtersActive,
  DEFAULT_ACCOUNT_FILTERS,
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

  const [searchQuery, setSearchQuery] = useState("");
  // The five column dropdown filters (Account / Plan / Subscription / MFA / Created).
  const [filters, setFilters] = useState<AccountFilters>(DEFAULT_ACCOUNT_FILTERS);
  // Active stat-card filter (null = show all). Toggling the same card clears it.
  const [cardFilter, setCardFilter] = useState<AccountCardFilter | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  // Suspend (replaces hard delete) — confirmation gate + in-flight flag.
  const [suspendingTenant, setSuspendingTenant] = useState<Tenant | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Post-create subscription flow
  const [postCreateSubOpen, setPostCreateSubOpen] = useState(false);
  const [postCreateTenantId, setPostCreateTenantId] = useState<string | null>(null);
  const [postCreateSubData, setPostCreateSubData] = useState<PlanDraft>(makePlanDraft());
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

  const setFilter = <K extends keyof AccountFilters>(key: K, value: AccountFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  // One affordance to reset everything narrowing the list — the five dropdowns,
  // the stat-card quick-filter, and the search box.
  const clearAllFilters = () => {
    setFilters(DEFAULT_ACCOUNT_FILTERS);
    setCardFilter(null);
    setSearchQuery("");
  };

  const hasActiveFilters = filtersActive(filters) || cardFilter !== null || searchQuery.trim() !== "";

  // Narrowing composes (AND): search → stat-card quick-filter → the five dropdowns.
  const filtered = tenants
    .filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((t) => (cardFilter ? matchesCardFilter(t, cardFilter) : true))
    .filter((t) => matchesFilters(t, filters));

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

  const handleSave = async (data: AccountFormData) => {
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
            return;
          }
        }
        setSyncError(null);
        toast.success(`Customer ${data.customerName} updated.`);
      } catch (err) {
        console.error("[admin] failed to persist tenant update", err);
        setSyncError(null);
        toast.error(`Could not update ${data.customerName}: ${mapCustomerError(err)}`);
        return;
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
        plan: data.plan ? draftToPlanConfig(data.plan, `plan-${Date.now()}`) : null,
        config: {
          org: {
            companyName: data.customerName,
            timezone: data.timezone,
            dateFormat: "DD/MM/YYYY",
            regulatoryRegion: "",
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
        await createTenantApi(newTenant);
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
        } else {
          toast.error(`Could not create ${data.customerName}: ${mapCustomerError(err)}`);
        }
        return;
      }
      dispatch(addTenant(newTenant));
      setSyncError(null);
      toast.success(`Customer ${data.customerName} created.`);

      // Auto-open the plan-assignment modal if no plan was set in the drawer
      if (!data.plan) {
        setPostCreateTenantId(tenantId);
        setPostCreateSubData(makePlanDraft());
        setPostCreateSubOpen(true);
      } else {
        setSavedPopup("Account and plan created");
      }
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
      active: editingTenant.active,
      mfaEnabled: !!editingTenant.mfaEnabled,
      newPassword: "",
      confirmPassword: "",
      plan: editingTenant.plan ? planConfigToDraft(editingTenant.plan) : null,
      logoFile: null,
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

  return {
    tenants,
    filtered,
    isSuperAdmin,
    searchQuery,
    setSearchQuery,
    syncing,
    syncError,
    // actionable stat-card filters
    stats,
    cardFilter,
    selectCardFilter,
    // column dropdown filters
    filters,
    setFilter,
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
    // post-create plan
    postCreateSubOpen,
    postCreateTenantId,
    postCreateSubData,
    setPostCreateSubData,
    postCreateClose,
    postCreateSkip,
    assignPostCreatePlan,
    // success toast
    savedPopup,
    setSavedPopup,
  };
}
