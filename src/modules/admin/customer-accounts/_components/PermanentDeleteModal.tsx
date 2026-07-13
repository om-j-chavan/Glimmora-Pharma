"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { deleteTenantWithPassword } from "@/actions/tenants";
import { type Tenant } from "@/store/auth.slice";

/**
 * Password-gated PERMANENT delete. The Super Admin must re-enter THEIR OWN
 * password; it is verified server-side (deleteTenantWithPassword) against the
 * real super_admin credential — never compared on the client. Only on success
 * is the tenant purged. Operational + PII data is destroyed; the immutable
 * audit + e-signature trail is retained (21 CFR Part 11) — the copy says so.
 *
 * Shared by the Restore list (accounts page) and the Tenant View danger zone.
 */
export function PermanentDeleteModal({
  tenant,
  open,
  onClose,
  onDeleted,
}: {
  tenant: Tenant | null;
  open: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Second-step confirmation gate: entering the password does NOT delete — the
  // user must confirm on an explicit dialog first (defense against mis-clicks
  // on an irreversible, Part-11-sensitive action).
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setBusy(false);
      setConfirming(false);
    }
  }, [open]);

  if (!open || !tenant) return null;

  // Step 1 — validate a password is present, then open the confirm dialog.
  const requestConfirm = () => {
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setError(null);
    setConfirming(true);
  };

  // Step 2 — user confirmed: verify server-side + purge.
  const doDelete = async () => {
    setBusy(true);
    setError(null);
    const res = await deleteTenantWithPassword(tenant.id, password);
    setBusy(false);
    setConfirming(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onDeleted(tenant.id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Permanently delete company"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={AlertTriangle}
            onClick={requestConfirm}
            loading={busy}
            disabled={!password || busy}
          >
            Permanently delete
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className="flex items-start gap-3 p-3 rounded-lg"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
              This cannot be undone
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
              This irreversibly destroys <strong style={{ color: "var(--text-primary)" }}>{tenant.name}</strong> and
              all its operational data and users. The audit trail and electronic-signature records are retained for
              Part 11 compliance.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="purge-password" className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Confirm your password <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="purge-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) { e.preventDefault(); requestConfirm(); } }}
            placeholder="Your Super Admin password"
            aria-invalid={!!error}
            className={`input ${error ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
          />
          {error && (
            <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>
          )}
        </div>
      </div>

      {/* Final confirmation — shown AFTER password entry, before the irreversible
          purge actually runs. */}
      <ConfirmModal
        open={confirming}
        onClose={() => { if (!busy) setConfirming(false); }}
        onConfirm={doDelete}
        loading={busy}
        variant="danger"
        icon={AlertTriangle}
        title="Permanently delete?"
        message={<>This <strong>cannot be undone</strong>. {tenant.name} and all its operational data will be destroyed. The audit &amp; e-signature trail is retained for Part 11.</>}
        confirmLabel="Yes, permanently delete"
      />
    </Modal>
  );
}
