"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, PlayCircle, Trash2, RotateCcw, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { updateTenant as updateTenantLocal, removeTenant, type Tenant } from "@/store/auth.slice";
import { suspendTenant, softDeleteTenant, restoreTenant } from "@/actions/tenants";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { PermanentDeleteModal } from "@/modules/admin/customer-accounts/_components/PermanentDeleteModal";

/** Derived lifecycle state from the two persisted fields. */
function statusOf(t: Tenant): "ACTIVE" | "SUSPENDED" | "DELETED" {
  if (t.deletedAt) return "DELETED";
  return t.active ? "ACTIVE" : "SUSPENDED";
}

type ConfirmKind = "suspend" | "delete" | "reactivate" | "restore" | "purge" | null;

/** A selectable action card inside a chooser modal — consistent layout/hierarchy. */
function ActionOption({
  tone, icon: Icon, title, description, onClick,
}: {
  tone: "warning" | "danger" | "brand";
  icon: typeof PauseCircle;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const color = tone === "warning" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : "var(--brand)";
  const bg = tone === "warning" ? "var(--warning-bg)" : tone === "danger" ? "var(--danger-bg)" : "var(--brand-muted)";
  const border = tone === "brand" ? "var(--brand-border)" : color;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border p-3 cursor-pointer flex items-start gap-3 transition-colors hover:brightness-[0.98]"
      style={{ borderColor: border, background: bg }}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color }} aria-hidden="true" />
      <div>
        <p className="text-[13px] font-semibold" style={{ color }}>{title}</p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{description}</p>
      </div>
    </button>
  );
}

/**
 * Tenant lifecycle actions — bottom of the Tenant View (super admin only).
 * Actions are driven by the tenant's CURRENT status:
 *   - ACTIVE    → Manage status: Suspend / Soft Delete
 *   - SUSPENDED → Manage status: Reactivate / Soft Delete (NO permanent delete)
 *   - DELETED   → Restore / Permanent Delete (password-gated)
 * Every transition is confirmed, persisted server-side (the auth guard is the
 * real gate), and mirrored into Redux so the page + table update immediately.
 */
export function TenantLifecycleActions({ tenant }: { tenant: Tenant }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const status = statusOf(tenant);

  // Which chooser modal is open, and which confirm is pending.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [busy, setBusy] = useState(false);

  const closeAll = () => { setConfirm(null); setChooserOpen(false); };

  const doSuspend = async () => {
    setBusy(true);
    const res = await suspendTenant(tenant.id);
    setBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenantLocal({ id: tenant.id, patch: { active: false, deletedAt: null } }));
    toast.success(`${tenant.name} suspended.`);
    closeAll();
  };

  const doReactivate = async () => {
    setBusy(true);
    const res = await restoreTenant(tenant.id);
    setBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenantLocal({ id: tenant.id, patch: { active: true, deletedAt: null } }));
    toast.success(`${tenant.name} reactivated. The tenant and its users can log in again.`);
    closeAll();
  };

  const doSoftDelete = async () => {
    setBusy(true);
    const res = await softDeleteTenant(tenant.id);
    setBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenantLocal({ id: tenant.id, patch: { active: false, deletedAt: new Date().toISOString() } }));
    toast.success(`${tenant.name} deleted. Restore it from the Customer Accounts list.`);
    closeAll();
    // Don't leave the user on a now-deleted tenant's view — return to the list,
    // where the tenant now lives in the Restore modal. The toast persists across
    // the client nav (ToastProvider is portaled at the root).
    router.push("/admin");
  };

  const doRestore = async () => {
    setBusy(true);
    const res = await restoreTenant(tenant.id);
    setBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    dispatch(updateTenantLocal({ id: tenant.id, patch: { active: true, deletedAt: null } }));
    toast.success(`${tenant.name} restored. The tenant and its users can log in again.`);
    closeAll();
  };

  const onPurged = (id: string) => {
    dispatch(removeTenant(id));
    toast.success(`${tenant.name} permanently deleted.`);
    router.push("/admin");
  };

  const badge = { ACTIVE: "green", SUSPENDED: "amber", DELETED: "red" } as const;
  const badgeLabel = { ACTIVE: "Active", SUSPENDED: "Suspended", DELETED: "Deleted" } as const;

  return (
    <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--bg-border)" }}>
      {/* Status card — consistent header (status badge) + a single status-aware
          primary action that opens the matching chooser. */}
      <div className="card" style={{ borderColor: status === "ACTIVE" ? "var(--bg-border)" : "var(--danger)" }}>
        <div className="card-header">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" style={{ color: status === "ACTIVE" ? "var(--text-muted)" : "var(--danger)" }} aria-hidden="true" />
            <span className="card-title">Company status</span>
          </div>
          <Badge variant={badge[status]}>{badgeLabel[status]}</Badge>
        </div>
        <div className="card-body flex items-center justify-between gap-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {status === "ACTIVE"
              ? "Suspend or delete this company. Both block login for the tenant and all its users; nothing is destroyed until you permanently delete."
              : status === "SUSPENDED"
                ? "This company is suspended and cannot log in. Reactivate it to restore access, or move it to the recoverable Deleted state."
                : "This company is deleted and cannot log in. Restore it to re-enable access, or permanently delete it and all its data."}
          </p>
          {status === "DELETED" ? (
            <Button variant="primary" size="sm" icon={RotateCcw} onClick={() => setChooserOpen(true)}>
              Restore or delete
            </Button>
          ) : (
            <Button variant={status === "ACTIVE" ? "danger" : "primary"} size="sm" icon={status === "ACTIVE" ? PauseCircle : PlayCircle} onClick={() => setChooserOpen(true)}>
              Manage status
            </Button>
          )}
        </div>
      </div>

      {/* Chooser — options depend on status. Each option opens its own confirm. */}
      {chooserOpen && (
        <Modal
          open
          onClose={() => setChooserOpen(false)}
          title={status === "DELETED" ? "Restore or permanently delete" : "Manage company status"}
        >
          <div className="space-y-3">
            {status === "ACTIVE" && (
              <>
                <ActionOption tone="warning" icon={PauseCircle} title="Suspend"
                  description="Blocks login for the tenant and all its users. Fully reversible — reactivate any time. No data is touched."
                  onClick={() => setConfirm("suspend")} />
                <ActionOption tone="danger" icon={Trash2} title="Soft delete"
                  description="Moves the company to a recoverable Deleted state. Login is blocked; all data is retained until you permanently delete."
                  onClick={() => setConfirm("delete")} />
              </>
            )}
            {status === "SUSPENDED" && (
              <>
                <ActionOption tone="brand" icon={PlayCircle} title="Reactivate"
                  description="Sets the company back to Active. The tenant and all its users can log in again."
                  onClick={() => setConfirm("reactivate")} />
                <ActionOption tone="danger" icon={Trash2} title="Soft delete"
                  description="Moves the company to a recoverable Deleted state. Login stays blocked; all data is retained until you permanently delete."
                  onClick={() => setConfirm("delete")} />
              </>
            )}
            {status === "DELETED" && (
              <>
                <ActionOption tone="brand" icon={RotateCcw} title="Restore company"
                  description="Sets the company back to Active. The tenant and all its users can log in again."
                  onClick={() => setConfirm("restore")} />
                <ActionOption tone="danger" icon={AlertTriangle} title="Permanently delete"
                  description="Irreversibly destroys this company and all its operational data. Requires your password. Cannot be undone."
                  onClick={() => setConfirm("purge")} />
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Confirmations (shared square modal). */}
      <ConfirmModal
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={doSuspend}
        loading={busy}
        variant="warning"
        icon={PauseCircle}
        title="Suspend company?"
        message={<>{tenant.name} and all its users will be unable to log in until reactivated.</>}
        confirmLabel="Suspend"
      />
      <ConfirmModal
        open={confirm === "reactivate"}
        onClose={() => setConfirm(null)}
        onConfirm={doReactivate}
        loading={busy}
        variant="primary"
        icon={PlayCircle}
        title="Reactivate company?"
        message={<>{tenant.name} returns to Active. The tenant and its users can log in again.</>}
        confirmLabel="Reactivate"
      />
      <ConfirmModal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={doSoftDelete}
        loading={busy}
        variant="danger"
        icon={Trash2}
        title="Delete company?"
        message={<>{tenant.name} moves to the recoverable Deleted state. Login is blocked; data is retained and can be restored.</>}
        confirmLabel="Delete"
      />
      <ConfirmModal
        open={confirm === "restore"}
        onClose={() => setConfirm(null)}
        onConfirm={doRestore}
        loading={busy}
        variant="primary"
        icon={RotateCcw}
        title="Restore company?"
        message={<>{tenant.name} returns to Active. The tenant and its users can log in again.</>}
        confirmLabel="Restore"
      />
      {/* Permanent delete is password-gated (Super Admin re-enters their own
          password, verified server-side) and Part 11-safe (audit/signature
          trail retained). Shared with the Accounts-list Restore flow. */}
      <PermanentDeleteModal
        tenant={confirm === "purge" ? tenant : null}
        open={confirm === "purge"}
        onClose={() => setConfirm(null)}
        onDeleted={onPurged}
      />
    </div>
  );
}
