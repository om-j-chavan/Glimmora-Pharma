"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, Save, PauseCircle, PlayCircle, Trash2, RotateCcw, Building2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { PageLayout } from "@/components/layout/PageLayout";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { usePrefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { DURATION, EASE } from "@/lib/motion/tokens";
import { resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import dayjs from "@/lib/dayjs";
import { type Tenant } from "@/store/auth.slice";
import { useCustomerAccounts } from "./useCustomerAccounts";
import { AccountStatCards } from "./_components/AccountStatCards";
import { AccountsTable } from "./_components/AccountsTable";
import { AccountModal } from "./_components/AccountModal";
import { RestoreTenantsModal } from "./_components/RestoreTenantsModal";
import { PermanentDeleteModal } from "./_components/PermanentDeleteModal";

interface CustomerAccountsPageProps {
  initialTenants?: Tenant[];
  isSuperAdmin?: boolean;
}

// Subtle press/hover feedback for page-local buttons (Phase 1 tempo). Spread
// onto a motion element only when reduced motion is OFF.
const PRESS = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { duration: DURATION.fast, ease: EASE.standard },
} as const;

export function CustomerAccountsPage({ initialTenants, isSuperAdmin: isSuperAdminProp }: CustomerAccountsPageProps = {}) {
  const ca = useCustomerAccounts({ initialTenants, isSuperAdmin: isSuperAdminProp });
  // Second-step confirm for the table's Manage-Status chooser — an option in the
  // chooser opens the matching confirm before the action runs.
  const [tableConfirm, setTableConfirm] = useState<"suspend" | "delete" | "reactivate" | null>(null);
  // Bumped to remount the DataTable widget so "Clear filters" wipes its internal
  // search / column-filter / sort / show-more state alongside the card filter.
  const [tableResetKey, setTableResetKey] = useState(0);
  const clearAllFilters = () => { ca.clearAllFilters(); setTableResetKey((k) => k + 1); };
  const reduced = usePrefersReducedMotion();

  return (
    <PageLayout
      title="Customer Accounts"
      titleIcon={Building2}
      description="Manage tenant organizations, plans, and platform access across Glimmora."
      // Header actions rendered here (instead of via `actions`) so each Button
      // can carry a subtle hover/tap press. Order preserved: Restore then the
      // primary New Account. The Button component itself is untouched.
      headerRight={
        <div className="flex items-center gap-2">
          <motion.div className="inline-flex" {...(reduced ? {} : PRESS)}>
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={ca.openRestoreList}>Restore</Button>
          </motion.div>
          <motion.div className="inline-flex" {...(reduced ? {} : PRESS)}>
            <Button variant="primary" size="sm" icon={Plus} onClick={ca.openCreate}>New Account</Button>
          </motion.div>
        </div>
      }
      className="w-full"
    >

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

      {/* Page-level "Clear filters" — resets the stat-card quick-filter AND
          remounts the widget to wipe its own search + column filters. Shown only
          when a stat card is active; the widget has its own inline Clear for its
          search/filters. */}
      {ca.hasActiveFilters && (
        <div className="flex justify-end mb-3">
          <Button variant="ghost" size="sm" icon={X} onClick={clearAllFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Table — the canonical DataTable widget. Search + the five column filters
          live in its toolbar; the stat-card quick-filter pre-filters `data`. */}
      <AccountsTable
        data={ca.cardFilteredTenants}
        isSuperAdmin={ca.isSuperAdmin}
        cardFilterActive={ca.cardFilter !== null}
        resetKey={tableResetKey}
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
        currentUserCount={ca.editingTenant?.config.users.filter((u) => u.status === "Active").length ?? 0}
        currentSiteCount={ca.editingTenant?.config.sites.filter((s) => s.status === "Active").length ?? 0}
      />

      {/* Manage-status chooser from the table. Options are STATUS-DRIVEN and each
          opens a confirmation before acting (no direct-execute):
            ACTIVE    → Suspend / Soft delete
            SUSPENDED → Reactivate / Soft delete
          Permanent delete is never here — it lives in the Restore modal only. */}
      {ca.suspendingTenant && (() => {
        const t = ca.suspendingTenant;
        const isActive = t.active !== false;
        const busy = ca.suspending || ca.tableActionBusy;
        const close = () => { if (!busy) { ca.setSuspendingTenant(null); setTableConfirm(null); } };
        const optClass = "w-full text-left rounded-lg border p-3 cursor-pointer flex items-start gap-3 transition-colors hover:brightness-[0.98]";

        return (
          <Modal open onClose={close} title="Manage account status">
            <div className="space-y-3">
              <div className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Account</p>
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{t.name}</p>
                <p className="text-[12px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{t.adminEmail}</p>
              </div>

              {isActive ? (
                <motion.button type="button" onClick={() => setTableConfirm("suspend")} className={optClass} style={{ borderColor: "var(--warning)", background: "var(--warning-bg)" }} {...(reduced ? {} : PRESS)}>
                  <PauseCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} aria-hidden="true" />
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--warning)" }}>Suspend</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Blocks login for the tenant and all its users. Fully reversible — reactivate any time. No data is touched.</p>
                  </div>
                </motion.button>
              ) : (
                <motion.button type="button" onClick={() => setTableConfirm("reactivate")} className={optClass} style={{ borderColor: "var(--brand-border)", background: "var(--brand-muted)" }} {...(reduced ? {} : PRESS)}>
                  <PlayCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--brand)" }} aria-hidden="true" />
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--brand)" }}>Reactivate</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Returns the account to Active. The tenant and all its users can log in again.</p>
                  </div>
                </motion.button>
              )}

              <motion.button type="button" onClick={() => setTableConfirm("delete")} className={optClass} style={{ borderColor: "var(--danger)", background: "var(--danger-bg)" }} {...(reduced ? {} : PRESS)}>
                <Trash2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} aria-hidden="true" />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>Soft delete</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Moves the account to the recoverable <strong>Restore</strong> list. Login is blocked; all data is retained until you permanently delete.</p>
                </div>
              </motion.button>
            </div>
          </Modal>
        );
      })()}

      {/* Confirmations for the table chooser (each runs the server-action handler,
          which clears the chooser + toasts on completion). */}
      <ConfirmModal
        open={tableConfirm === "suspend"}
        onClose={() => setTableConfirm(null)}
        onConfirm={async () => { await ca.doTableSuspend(); setTableConfirm(null); }}
        loading={ca.tableActionBusy}
        variant="warning"
        icon={PauseCircle}
        title="Suspend account?"
        message={<>{ca.suspendingTenant?.name} and all its users will be unable to log in until reactivated.</>}
        confirmLabel="Suspend"
      />
      <ConfirmModal
        open={tableConfirm === "reactivate"}
        onClose={() => setTableConfirm(null)}
        onConfirm={async () => { await ca.confirmSuspend(); setTableConfirm(null); }}
        loading={ca.suspending}
        variant="primary"
        icon={PlayCircle}
        title="Reactivate account?"
        message={<>{ca.suspendingTenant?.name} returns to Active. The tenant and its users can log in again.</>}
        confirmLabel="Reactivate"
      />
      <ConfirmModal
        open={tableConfirm === "delete"}
        onClose={() => setTableConfirm(null)}
        onConfirm={async () => { await ca.doTableSoftDelete(); setTableConfirm(null); }}
        loading={ca.tableActionBusy}
        variant="danger"
        icon={Trash2}
        title="Delete account?"
        message={<>{ca.suspendingTenant?.name} moves to the recoverable Deleted state and appears in the Restore list. Login is blocked; data is retained.</>}
        confirmLabel="Delete"
      />

      {/* Restore list (soft-deleted tenants) + password-gated permanent delete. */}
      <RestoreTenantsModal
        open={ca.restoreListOpen}
        onClose={ca.closeRestoreList}
        deletedTenants={ca.deletedTenants}
        onRestore={ca.restoreFromList}
        onRequestPurge={ca.requestPurge}
        restoringId={ca.restoringId}
      />
      <PermanentDeleteModal
        tenant={ca.purgeTarget}
        open={ca.purgeTarget !== null}
        onClose={ca.closePurge}
        onDeleted={ca.onPurged}
      />

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
    </PageLayout>
  );
}
