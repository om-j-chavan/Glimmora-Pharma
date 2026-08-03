"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Clock,
  ShieldCheck,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Globe,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { updateTenant as updateTenantLocal } from "@/store/auth.slice";
import { regulatoryRegionLabel, GLOBAL_REGION_VALUE } from "@/constants/regulatoryRegions";
import { toggleTenantMFA } from "@/actions/tenants";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";
import dayjs from "@/lib/dayjs";
import { DetailHeader } from "./_components/DetailHeader";
import { DetailSummaryCards } from "./_components/DetailSummaryCards";
import { LogoCropModal } from "./_components/LogoCropModal";
import { TenantLifecycleActions } from "./_components/TenantLifecycleActions";
import { TenantRoleLimitsSection } from "./_components/TenantRoleLimitsSection";
import { useCustomerAccounts } from "@/modules/admin/customer-accounts/useCustomerAccounts";
import { planUsersUsed } from "@/modules/admin/customer-accounts/helpers";
import { planLabel } from "@/lib/plans";
import { AccountModal } from "@/modules/admin/customer-accounts/_components/AccountModal";

export function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const dispatch = useAppDispatch();
  // The [id] route segment now carries the human-readable customerCode
  // (e.g. "PGI_001"). Resolve by customerCode first, then fall back to the
  // cuid id so old/bookmarked cuid URLs and optimistic post-create rows
  // (which may lack customerCode until the next getTenants() reload) still
  // resolve. The cuid PK is unchanged — only the URL key moved.
  const tenant = useAppSelector(
    (s) =>
      s.auth.tenants.find((t) => t.customerCode === id) ??
      s.auth.tenants.find((t) => t.id === id),
  );
  const regionLabelMap = useAppSelector((s) => s.regions.labelMap);
  const currentRole = useAppSelector((s) => s.auth.user?.role);
  const isSuperAdmin = currentRole === "super_admin";

  // Reuse the Accounts-list edit flow (the SAME AccountModal + save handler) so
  // "Edit Account" opens the modal inline, pre-filled with this tenant — instead
  // of navigating away. Pass the already-hydrated Redux tenants as initialTenants
  // so the hook seeds once (no-op) rather than refetching. handleSave dispatches
  // updateTenant → Redux, so this page re-renders with the edits on save.
  const allTenants = useAppSelector((s) => s.auth.tenants);
  const ca = useCustomerAccounts({ initialTenants: allTenants, isSuperAdmin });

  const [mfaUpdating, setMfaUpdating] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaConfirmOpen, setMfaConfirmOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);

  const applyMfa = async (next: boolean) => {
    if (!isSuperAdmin || !tenant) return;
    setMfaUpdating(true);
    setMfaError(null);
    dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: next } }));
    try {
      const result = await toggleTenantMFA(tenant.id, next);
      if (!result.success) {
        dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: !next } }));
        setMfaError(result.error ?? "Failed to update MFA setting.");
      }
    } catch (err) {
      console.error("[admin] toggleTenantMFA failed", err);
      dispatch(updateTenantLocal({ id: tenant.id, patch: { mfaEnabled: !next } }));
      setMfaError("Failed to update MFA setting.");
    } finally {
      setMfaUpdating(false);
    }
  };

  const handleMfaToggleClick = () => {
    if (!tenant) return;
    if (tenant.mfaEnabled) {
      applyMfa(false);
    } else {
      setMfaConfirmOpen(true);
    }
  };

  if (!tenant) {
    return (
      <div className="w-full max-w-[1200px] mx-auto">
        <Link href="/admin" className="inline-flex items-center gap-2 text-[13px] mb-4" style={{ color: "var(--brand)" }}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
        </Link>
        <div className="card">
          <div className="card-body text-center py-10">
            <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Customer not found
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
              The customer account you are looking for does not exist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const adminUser = tenant.config.users.find(
    (u) => u.role === "customer_admin" || u.role === "super_admin",
  );
  const plan = tenant.plan ?? null;
  const planExpired = plan ? dayjs().isAfter(dayjs.utc(plan.expiryDate)) : false;

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-[13px] mb-4"
        style={{ color: "var(--brand)" }}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Customer Accounts
      </Link>

      <DetailHeader
        tenant={tenant}
        plan={plan}
        onEdit={() => ca.openEdit(tenant)}
        onEditLogo={isSuperAdmin ? () => setLogoModalOpen(true) : undefined}
      />

      {/* Container-level utilisation — aggregate counts vs plan cap, no rosters.
          Users USED excludes the tenant-admin identity (planUsersUsed), so a
          freshly created tenant with no users of its own reads 0. */}
      <DetailSummaryCards
        userCount={planUsersUsed(tenant)}
        siteCount={tenant.config.sites.length}
        plan={plan}
        planExpired={planExpired}
      />

      {/* Organization — only fields the Create/Edit Account form sets. Admin
          email lives once, in the Primary Administrator card (the contact
          block). Date Format + Regulatory Region stay dropped (not collected). */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Organization</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Tenant ID</p>
              <p className="text-[14px] font-medium font-mono" style={{ color: "var(--text-primary)" }}>{tenant.customerCode ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Username</p>
              <p className="text-[14px] font-medium font-mono" style={{ color: "var(--text-primary)" }}>{adminUser?.username ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Timezone</p>
              <p className="text-[14px] font-medium flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Clock className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {tenant.config.org.timezone}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Regulatory Regions</p>
              <p className="text-[14px] font-medium flex items-center gap-2 flex-wrap" style={{ color: "var(--text-primary)" }}>
                <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                {(() => {
                  // Multi-region: render EVERY region in the tenant's SET (fall back
                  // to the single shim). The first (primary) is marked with a ★.
                  const set = tenant.config.org.regions?.length
                    ? tenant.config.org.regions
                    : tenant.config.org.regulatoryRegion
                      ? [tenant.config.org.regulatoryRegion]
                      : [];
                  if (set.length === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
                  // Each links to its page in the merged Regions & Frameworks module.
                  // The [value] route resolves active, GLOBAL, AND archived regions,
                  // so any region in the label map is reachable; unknown → plain text.
                  return set.map((value, i) => {
                    const label = regulatoryRegionLabel(value, regionLabelMap);
                    const reachable = value === GLOBAL_REGION_VALUE || value in regionLabelMap;
                    return (
                      <span key={value} className="inline-flex items-center">
                        {i === 0 && <span aria-hidden="true" title="Primary region" style={{ color: "var(--brand)" }}>★&nbsp;</span>}
                        {reachable ? (
                          <Link
                            href={`/admin/regions/${encodeURIComponent(value)}`}
                            className="hover:underline"
                            style={{ color: "var(--brand)" }}
                            title={`Open ${label} in Regions & Frameworks`}
                          >
                            {label}
                          </Link>
                        ) : (
                          <span>{label}</span>
                        )}
                        {i < set.length - 1 && <span style={{ color: "var(--text-muted)" }}>,&nbsp;</span>}
                      </span>
                    );
                  });
                })()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security · MFA + Primary Administrator — side by side. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Security — MFA + Account status, each a ui/Toggle (now visible in
            both modes). The toggles convey state; no "Enforced"/"Last Used". */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">Security</span>
            </div>
          </div>
          <div className="card-body space-y-3">
            {/* Require MFA — ui/Toggle (visible off-state). Enabling shows the
                sessions-invalidation confirm; disabling applies directly. The
                toggleTenantMFA action + audit are unchanged. */}
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)" }}>
              <Toggle
                id="detail-mfa"
                label="Require MFA"
                description="When enabled, all users in this tenant (except super_admin) complete email OTP verification on sign-in."
                checked={!!tenant.mfaEnabled}
                onChange={() => handleMfaToggleClick()}
                disabled={mfaUpdating || !isSuperAdmin}
              />
              {mfaError && (
                <p role="alert" className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>{mfaError}</p>
              )}
            </div>

            {/* Account status — super_admin can suspend/reactivate here. Toggling
                routes through the shared suspend confirmation (warning shown
                before applying); it persists via updateTenant →
                TENANT_SUSPENDED / TENANT_REACTIVATED (audit unchanged). */}
            {isSuperAdmin && (
              <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)" }}>
                <Toggle
                  id="detail-status"
                  label="Active"
                  description="When off, the account is suspended and all users lose access until reactivated."
                  checked={tenant.active}
                  onChange={() => ca.requestSuspend(tenant)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Primary Administrator — CONTACT only (email + status). NO "name":
            the form collects only the company name + admin email, so the old
            name field just repeated the company name (that was the bug).
            Bright line: no role / GxP / user roster. */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Primary Administrator</span>
          </div>
          <div className="card-body">
            {adminUser ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Admin Email</p>
                  <p className="text-[14px] font-mono" style={{ color: "var(--text-primary)" }}>{adminUser.email}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Status</p>
                  <Badge variant={adminUser.status === "Active" ? "green" : "gray"}>{adminUser.status}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No administrator on record.</p>
            )}
          </div>
        </div>
      </div>

      {/* Plan Details — the plan SPEC (caps + term), shown once. The summary
          cards above show usage-vs-cap; this is the spec (complementary). Tier
          is intentionally NOT repeated here (it's in the header subline + the
          "Plan" summary card) so no fact appears 3×. */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Plan Details</span>
          </div>
          {plan && (
            <div className="flex items-center gap-2">
              <Badge variant={planExpired ? "red" : "green"}>{planExpired ? "Expired" : "Valid"}</Badge>
              {isSuperAdmin && (
                <Button variant="secondary" size="xs" icon={RefreshCw} onClick={() => ca.openRenew(tenant)}>
                  Renew
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="card-body">
          {!plan ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No plan assigned yet.</p>
          ) : (() => {
            // Full subscription detail (item 4) — caps + live usage + remaining,
            // in one readable grid. Usage excludes the tenant-admin identity
            // (planUsersUsed), matching the enforcement count.
            const usedUsers = planUsersUsed(tenant);
            const usedSites = tenant.config.sites.length;
            const field = (label: string, value: React.ReactNode, danger = false) => (
              <div>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="text-[14px] font-medium" style={{ color: danger ? "var(--danger)" : "var(--text-primary)" }}>{value}</p>
              </div>
            );
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
                {field("Plan", planLabel(plan.tier, plan.displayName))}
                {field("Data Retention", `${plan.minRetentionYears} yr`)}
                {field("Subscription Expiry", <>{dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}{planExpired ? " · expired" : ""}</>, planExpired)}
                {field("Max Users", plan.maxUsers)}
                {field("Current Users", usedUsers)}
                {field("Remaining User Capacity", Math.max(0, plan.maxUsers - usedUsers))}
                {field("Max Sites", plan.maxSites)}
                {field("Current Sites", usedSites)}
                {field("Remaining Site Capacity", Math.max(0, plan.maxSites - usedSites))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Role Limits & Usage (item 2b) — effective per-role matrix; Edit Limits
          is super-admin only (per-tenant overrides). Read-only for others. */}
      <TenantRoleLimitsSection tenantId={tenant.id} isSuperAdmin={isSuperAdmin} />

      {/* Lifecycle actions (suspend / soft-delete / restore / permanent delete)
          — bottom of the page, super admin only. */}
      {isSuperAdmin && <TenantLifecycleActions tenant={tenant} />}

      {/* Logo crop-and-upload — super admin only. On save, the server persists
          the data URL and we update Redux so the header reflects it at once. */}
      {isSuperAdmin && (
        <LogoCropModal
          open={logoModalOpen}
          onClose={() => setLogoModalOpen(false)}
          tenantId={tenant.id}
          tenantName={tenant.name}
          currentLogo={tenant.logoUrl}
          onSaved={(logoUrl) => dispatch(updateTenantLocal({ id: tenant.id, patch: { logoUrl } }))}
        />
      )}

      {/* MFA enable confirmation — toggleTenantMFA bumps sessionsValidAfter,
          which signs out every active user in the tenant. */}
      {mfaConfirmOpen && (
        <Modal open onClose={() => setMfaConfirmOpen(false)} title="Enable MFA Required?">
          <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Enabling MFA will sign out all current users in <strong style={{ color: "var(--text-primary)" }}>{tenant.name}</strong>. They&apos;ll need to sign in again with email OTP. Continue?
          </p>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Button variant="secondary" size="sm" onClick={() => setMfaConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setMfaConfirmOpen(false);
                applyMfa(true);
              }}
            >
              Enable MFA
            </Button>
          </div>
        </Modal>
      )}

      {/* Suspend / reactivate confirmation — driven by the Account-status toggle
          above. Reuses the hook's flow (confirmSuspend flips isActive via the
          updateTenant action → TENANT_SUSPENDED / TENANT_REACTIVATED audit). The
          warning is shown BEFORE applying, matching the dedicated Suspend action. */}
      {ca.suspendingTenant && (() => {
        const isSuspend = ca.suspendingTenant.active !== false;
        const close = () => { if (!ca.suspending) ca.setSuspendingTenant(null); };
        return (
          <Modal
            open
            onClose={close}
            title={isSuspend ? "Suspend account?" : "Reactivate account?"}
            footer={
              <div className="flex justify-end gap-3">
                <Button variant="secondary" size="sm" onClick={close} disabled={ca.suspending}>Cancel</Button>
                <Button
                  variant={isSuspend ? "danger" : "primary"}
                  size="sm"
                  icon={isSuspend ? PauseCircle : PlayCircle}
                  onClick={ca.confirmSuspend}
                  loading={ca.suspending}
                >
                  {isSuspend ? "Suspend account" : "Reactivate account"}
                </Button>
              </div>
            }
          >
            <div
              className="flex items-start gap-3 p-3 rounded-lg"
              style={
                isSuspend
                  ? { background: "var(--warning-bg)", border: "1px solid var(--warning)" }
                  : { background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }
              }
            >
              {isSuspend ? (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} aria-hidden="true" />
              ) : (
                <PlayCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--brand)" }} aria-hidden="true" />
              )}
              <div>
                <p className="text-[13px] font-semibold" style={{ color: isSuspend ? "var(--warning)" : "var(--brand)" }}>
                  {isSuspend ? "Users will lose access" : "Access will be restored"}
                </p>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {isSuspend
                    ? "All users in this tenant lose access until reactivated. No data is deleted and the full audit history is preserved."
                    : "All users in this tenant regain access. The account returns to Active; nothing else changes."}
                </p>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Edit Account modal — the SAME AccountModal used on the Accounts list,
          opened inline in edit mode for this tenant. On save, handleSave writes
          to the DB and dispatches updateTenant → Redux, so this page reflects
          the changes immediately (no navigation). */}
      <AccountModal
        open={ca.modalOpen}
        onClose={ca.closeModal}
        onSave={ca.handleSave}
        initial={ca.getFormData()}
        mode={ca.editingTenant ? "edit" : "create"}
        isSuperAdmin={ca.isSuperAdmin}
        currentUserCount={ca.editingTenant?.config.users.filter((u) => u.status === "Active").length ?? 0}
        currentSiteCount={ca.editingTenant?.config.sites.filter((s) => s.status === "Active").length ?? 0}
      />

      {/* Renew subscription — TIME-ONLY. Reuses the editor's assignPlan write
          path via the shared hook (renewal: true → PLAN_RENEWED audit); tier +
          caps are untouched. New start = max(current expiry, today); new expiry
          = resolveExpiry(start, term) — no new date math. */}
      {ca.renewingTenant && ca.renewDraft && (
        <Modal
          open
          onClose={ca.closeRenew}
          title="Renew subscription"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={ca.closeRenew} disabled={ca.renewing}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                icon={RefreshCw}
                onClick={ca.confirmRenew}
                loading={ca.renewing}
                disabled={!Number.isFinite(ca.renewDraft.durationMonths) || ca.renewDraft.durationMonths < 1}
              >
                Confirm renewal
              </Button>
            </div>
          }
        >
          <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Extends the subscription term only — tier and limits are unchanged (edit those in the plan editor).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>New term (mo)</label>
              <input
                type="number"
                min={1}
                value={Number.isFinite(ca.renewDraft.durationMonths) ? ca.renewDraft.durationMonths : ""}
                disabled={ca.renewDraft.tier !== "TAILORED"}
                onChange={(e) => ca.setRenewMonths(e.target.valueAsNumber)}
                aria-label="New term in months"
                className="input text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                New start <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(auto)</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={ca.renewDraft.startDate ? dayjs.utc(ca.renewDraft.startDate).format("DD MMM YYYY") : "—"}
                aria-label="New start date"
                className="input text-[12px]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                New expiry <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(auto)</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={ca.renewDraft.expiryDate ? dayjs.utc(ca.renewDraft.expiryDate).format("DD MMM YYYY") : "—"}
                aria-label="New expiry date"
                className="input text-[12px]"
              />
            </div>
          </div>
          {ca.renewDraft.tier !== "TAILORED" && (
            <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
              Term is fixed for this tier — only Tailored plans can set a custom term.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
