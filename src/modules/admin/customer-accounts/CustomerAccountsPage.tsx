"use client";

import { Plus, Search, X, Save, PauseCircle, PlayCircle, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import dayjs from "@/lib/dayjs";
import { type Tenant } from "@/store/auth.slice";
import { useCustomerAccounts } from "./useCustomerAccounts";
import { AccountStatCards } from "./_components/AccountStatCards";
import { AccountFiltersBar } from "./_components/AccountFiltersBar";
import { AccountsTable } from "./_components/AccountsTable";
import { AccountModal } from "./_components/AccountModal";

interface CustomerAccountsPageProps {
  initialTenants?: Tenant[];
  isSuperAdmin?: boolean;
}

export function CustomerAccountsPage({ initialTenants, isSuperAdmin: isSuperAdminProp }: CustomerAccountsPageProps = {}) {
  const ca = useCustomerAccounts({ initialTenants, isSuperAdmin: isSuperAdminProp });

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>
            Customer Accounts
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Manage customer organizations and their admin accounts
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={ca.openCreate}>
          New Account
        </Button>
      </div>

      {/* Sync status banner */}
      {ca.syncing && (
        <div
          role="status"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--brand-muted)", color: "var(--brand)", border: "1px solid var(--brand-border)" }}
        >
          Syncing customers from database…
        </div>
      )}
      {ca.syncError && (
        <div
          role="alert"
          className="mb-4 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning)" }}
        >
          {ca.syncError}
        </div>
      )}

      {/* Actionable stat cards — click to filter the table to that set */}
      <AccountStatCards
        stats={ca.stats}
        activeFilter={ca.cardFilter}
        onSelect={ca.selectCardFilter}
      />

      {/* Search — sits below the stat cards, above the table */}
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search organizations…"
            value={ca.searchQuery}
            onChange={(e) => ca.setSearchQuery(e.target.value)}
            className="w-full rounded-lg py-2 pl-9 pr-3 text-[13px] outline-none transition-all"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--bg-border)",
              color: "var(--text-primary)",
            }}
          />
          {ca.searchQuery && (
            <button
              type="button"
              onClick={() => ca.setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Column filters — sit with the search, above the table */}
      <AccountFiltersBar
        filters={ca.filters}
        setFilter={ca.setFilter}
        hasActiveFilters={ca.hasActiveFilters}
        onClear={ca.clearAllFilters}
      />

      {/* Table */}
      <AccountsTable
        rows={ca.filtered}
        totalCount={ca.tenants.length}
        isSuperAdmin={ca.isSuperAdmin}
        isFiltered={ca.hasActiveFilters}
        onEdit={ca.openEdit}
        onSuspend={(t) => ca.requestSuspend(t)}
        onCreate={ca.openCreate}
      />

      {/* Account modal */}
      <AccountModal
        open={ca.modalOpen}
        onClose={ca.closeModal}
        onSave={ca.handleSave}
        initial={ca.getFormData()}
        mode={ca.editingTenant ? "edit" : "create"}
        isSuperAdmin={ca.isSuperAdmin}
      />

      {/* Suspend / reactivate confirmation — soft lifecycle change (no hard delete).
          One modal serves both directions, keyed off the target's current state. */}
      {ca.suspendingTenant && (() => {
        // active tenant → we're suspending; suspended tenant → we're reactivating.
        const isSuspend = ca.suspendingTenant.active !== false;
        const close = () => { if (!ca.suspending) ca.setSuspendingTenant(null); };
        return (
          <Modal
            open
            onClose={close}
            title={isSuspend ? "Suspend account?" : "Reactivate account?"}
            footer={
              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" size="sm" onClick={close} disabled={ca.suspending}>
                  Cancel
                </Button>
                <Button
                  type="button"
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
            <div className="space-y-4">
              {/* Consequence cue — amber warning for suspend, brand accent for reactivate */}
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
                      ? "All users in this tenant lose access until the account is reactivated. No data is deleted and the full audit history is preserved."
                      : "All users in this tenant regain access. The account returns to Active; nothing else changes."}
                  </p>
                </div>
              </div>

              {/* Which account */}
              <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  {isSuspend ? "Account to suspend" : "Account to reactivate"}
                </p>
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {ca.suspendingTenant.name}
                </p>
                <p className="text-[12px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {ca.suspendingTenant.adminEmail}
                </p>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Post-create subscription modal */}
      {ca.postCreateSubOpen && ca.postCreateTenantId && (
        <Modal
          open
          onClose={ca.postCreateClose}
          title="Add Subscription Plan"
        >
          <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Set up a subscription so users can log in.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DatePicker
                id="postcreate-start-date"
                label="Start date"
                required
                value={ca.postCreateSubData.startDate}
                onChange={(v) => ca.setPostCreateSubData((p) => ({ ...p, startDate: v, expiryDate: dayjs.utc(resolveExpiry(v, p.durationMonths)).format("YYYY-MM-DD") }))}
              />
              <div>
                <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Expiry date <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(auto)</span>
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={ca.postCreateSubData.expiryDate ? dayjs.utc(ca.postCreateSubData.expiryDate).format("DD MMM YYYY") : "—"}
                  aria-label="Computed expiry date (start + duration)"
                  className="input text-[12px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Plan tier <span style={{ color: "var(--danger)" }}>*</span></label>
              <Dropdown
                value={ca.postCreateSubData.tier}
                onChange={(v) => {
                  const tier = v as PlanTier;
                  ca.setPostCreateSubData((p) => {
                    if (tier === "TAILORED") return { ...p, tier };
                    const caps = resolvePlanCaps(tier);
                    return { ...p, tier, displayName: "", ...caps, expiryDate: dayjs.utc(resolveExpiry(p.startDate, caps.durationMonths)).format("YYYY-MM-DD") };
                  });
                }}
                options={[
                  { value: "ESSENTIALS", label: "Essentials" },
                  { value: "PROFESSIONAL", label: "Professional" },
                  { value: "ENTERPRISE", label: "Enterprise" },
                  { value: "TAILORED", label: "Tailored" },
                ]}
                width="w-full"
                size="sm"
              />
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ca.postCreateSubData.maxUsers} users · {ca.postCreateSubData.maxSites} sites · {ca.postCreateSubData.minRetentionYears}yr retention · {ca.postCreateSubData.durationMonths}mo term</p>
          </div>
          <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <button
              type="button"
              onClick={ca.postCreateSkip}
              className="text-[11px] font-medium border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }}
            >
              Skip for now
            </button>
            <Button variant="primary" size="sm" icon={Save} onClick={ca.assignPostCreatePlan}>Assign Plan</Button>
          </div>
        </Modal>
      )}

      {/* Success toast */}
      {ca.savedPopup && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg"
          style={{ background: "var(--success-bg)", border: "1px solid var(--success)", color: "var(--success)" }}
        >
          <span className="text-[13px] font-semibold">{ca.savedPopup}</span>
          <button type="button" onClick={() => ca.setSavedPopup(null)} className="ml-2 border-none bg-transparent cursor-pointer" style={{ color: "var(--success)" }} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
