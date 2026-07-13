"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { CAPA } from "@/store/capa.slice";
import { roleLabel } from "../utils/commentTree";

/* ── Substage 5.4 — Sign approval modal ──
 *
 * Extracted from ActionsPanel to keep the file scope sane. Behaviour
 * unchanged: re-authentication password under Part 11 §11.200(a)(1)(ii),
 * password cleared on every close path, errors surfaced inline.
 */

export interface SignApprovalModalProps {
  intent: { kind: "approve" } | { kind: "revoke"; approvalId: string };
  currentUser: { id: string; name: string; role: string } | { name: string; role: string };
  capa: CAPA;
  /** Read-only echo of the optional approval comment (approve flow only;
   *  revoke has no comment). */
  comment: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (
    password: string,
  ) => Promise<{ success: true } | { success: false; error: string }>;
}

export function SignApprovalModal({
  intent,
  currentUser,
  capa,
  comment,
  busy,
  onClose,
  onSubmit,
}: SignApprovalModalProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const isApprove = intent.kind === "approve";
  const title = isApprove ? "Sign approval" : "Sign approval revocation";
  const buttonLabel = submitting
    ? isApprove
      ? "Signing…"
      : "Revoking…"
    : isApprove
      ? "Sign"
      : "Revoke";
  const meaningHelper = isApprove
    ? "This signature will be recorded with a SHA-256 hash binding it to the current CAPA state."
    : "Revoking your approval is also a signing event. A separate SignedRecord will document the revocation.";

  const handleClose = () => {
    if (submitting) return;
    setPassword("");
    setSignError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!password) return;
    setSubmitting(true);
    setSignError(null);
    const result = await onSubmit(password);
    setSubmitting(false);
    if (!result.success) {
      // Password mismatch / other server error → keep modal open, clear
      // the field, surface the message inline. The parent only closes the
      // modal on success.
      setPassword("");
      setSignError(result.error);
      return;
    }
    setPassword("");
  };

  return (
    <Modal open onClose={handleClose} title={title}>
      <div className="space-y-3">
        <div
          className="rounded-md p-3 text-[11px]"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            color: "var(--text-secondary)",
          }}
        >
          <p>
            You are {isApprove ? "approving" : "revoking your approval"} as{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {currentUser.name}
            </strong>{" "}
            ({roleLabel(currentUser.role)}).
          </p>
          <p className="mt-1">
            CAPA:{" "}
            <strong style={{ color: "var(--text-primary)" }} title={capa.id}>
              {capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`}
            </strong>
            {" — risk: "}
            <strong style={{ color: "var(--text-primary)" }}>{capa.risk}</strong>
          </p>
          <p className="mt-1">{meaningHelper}</p>
        </div>

        {isApprove && comment.trim().length > 0 && (
          <div>
            <p
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Comment
            </p>
            <p
              className="text-[12px] whitespace-pre-wrap"
              style={{ color: "var(--text-primary)" }}
            >
              {comment}
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="sign-password"
            className="block text-[11px] font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Password <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="sign-password"
            type="password"
            className="input text-[12px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Re-enter your password to sign"
            autoComplete="current-password"
            disabled={submitting || busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            aria-describedby="sign-password-hint"
          />
          <p
            id="sign-password-hint"
            className="text-[10px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Required by 21 CFR Part 11 §11.200 — your signature must be
            re-authenticated at the moment of signing.
          </p>
        </div>

        {signError && (
          <p
            role="alert"
            className="text-[11px] rounded-md p-2"
            style={{
              background: "var(--danger-bg)",
              color: "var(--danger)",
              border: "1px solid var(--danger)",
            }}
          >
            {signError}
          </p>
        )}

        <div
          className="flex justify-end gap-2 pt-2"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={submitting}
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            variant={isApprove ? "primary" : "danger"}
            size="sm"
            icon={isApprove ? ShieldCheck : ShieldAlert}
            disabled={submitting || busy || password.length === 0}
            loading={submitting}
            onClick={() => void handleSubmit()}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
