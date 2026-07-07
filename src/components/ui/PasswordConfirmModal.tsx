"use client";

import { useState, useEffect, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";

/**
 * Reusable password-gated confirmation dialog. The acting admin must re-enter
 * THEIR OWN password to proceed; `onConfirm` is expected to call a server action
 * that verifies the credential SERVER-SIDE (e.g. deleteSiteWithPassword,
 * deleteUserWithPassword, setUserGxpSignatoryWithPassword). The password is
 * NEVER compared on the client — this component only collects it and surfaces
 * the server's success/error result.
 *
 * Built from the shared Modal + Input + Button primitives, mirroring the
 * tenant permanent-delete gate (PermanentDeleteModal).
 */
export interface PasswordConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Verifies + performs the action server-side. Return { success, error? }. */
  onConfirm: (password: string) => Promise<{ success: boolean; error?: string }>;
  /** Called once onConfirm resolves successfully (before onClose). */
  onSuccess?: () => void;
  title: string;
  /** Explanatory copy shown above the password field. */
  message?: ReactNode;
  confirmLabel?: string;
  variant?: "primary" | "danger" | "warning";
  icon?: LucideIcon;
}

export function PasswordConfirmModal({
  open,
  onClose,
  onConfirm,
  onSuccess,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  icon: Icon,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset every time the dialog opens so a stale password/error never lingers.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onConfirm(password);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    onSuccess?.();
    onClose();
  };

  const btnVariant = variant === "danger" ? "danger" : "primary";

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={btnVariant}
            size="sm"
            icon={Icon}
            onClick={submit}
            loading={busy}
            disabled={!password || busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(Icon || message) && (
          <div className="flex items-start gap-3">
            {Icon && (
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "var(--bg-elevated)" }}
              >
                <Icon className="w-4 h-4" />
              </span>
            )}
            {message && (
              <div
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {message}
              </div>
            )}
          </div>
        )}

        <Input
          id="password-confirm"
          type="password"
          label="Confirm your password"
          required
          autoFocus
          placeholder="Your account password"
          value={password}
          error={error ?? undefined}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
    </Modal>
  );
}
