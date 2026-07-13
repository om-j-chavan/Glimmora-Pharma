"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  CC_OVERRIDE_REASON_MIN_LENGTH,
  type CCDependencyState,
} from "@/lib/cc-dependencies";
import type { CAPA } from "@/store/capa.slice";

/* ── Substage 6.4 — CC dependency override modal ──
 *
 * Shown only on the soft-gate path: CAPA is Medium/Low risk and one or
 * more linked Change Controls are still incomplete. Captures an override
 * reason ≥ CC_OVERRIDE_REASON_MIN_LENGTH chars, surfaces the affected
 * CCs verbatim so the operator sees what they're overriding, and forwards
 * the reason to the parent so it rides into signAndCloseCAPA(...) on the
 * server.
 */

export interface CCOverrideModalProps {
  deps: CCDependencyState;
  capa: CAPA;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function CCOverrideModal({
  deps,
  capa,
  onCancel,
  onConfirm,
}: CCOverrideModalProps) {
  const [reason, setReason] = useState("");

  return (
    <Modal open onClose={onCancel} title="Override linked-CC dependency">
      <p
        className="text-[12px] mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {capa.risk} risk CAPAs may proceed to closure with{" "}
        {deps.incompleteCount} linked change control
        {deps.incompleteCount === 1 ? "" : "s"} still incomplete, provided you
        record an override reason. The reason is preserved on the CAPA and
        appended to the audit trail.
      </p>

      <div
        className="rounded-md p-2.5 mb-3"
        style={{
          background: "var(--warning-bg)",
          border: "1px solid var(--warning)",
        }}
      >
        <p
          className="text-[11px] font-semibold mb-1"
          style={{ color: "var(--warning)" }}
        >
          Incomplete change controls
        </p>
        <ul
          className="text-[11px] list-disc list-inside space-y-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {deps.incompleteCCs.map((cc) => (
            <li key={cc.id}>
              <span
                className="font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {cc.reference ?? cc.id.slice(0, 8)}
              </span>
              {" — "}
              {cc.status}
            </li>
          ))}
        </ul>
      </div>

      <label
        htmlFor="cc-override-reason"
        className="block text-[11px] font-medium mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        Override reason{" "}
        <span aria-hidden="true" style={{ color: "var(--danger)" }}>
          *
        </span>
        <span className="sr-only">(required)</span>
      </label>
      <textarea
        id="cc-override-reason"
        className="input text-[12px] min-h-[80px] mb-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`Why is closure proceeding before the linked CC${deps.incompleteCount === 1 ? "" : "s"} reach Implemented? (≥ ${CC_OVERRIDE_REASON_MIN_LENGTH} chars)`}
        maxLength={2000}
        aria-describedby="cc-override-hint"
      />
      <p
        id="cc-override-hint"
        className="text-[10px] mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        Required by CAPA closure controls. The reason is stored against the
        CAPA and audit log and remains visible to inspectors.
      </p>

      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--bg-border)" }}
      >
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={ShieldCheck}
          disabled={reason.trim().length < CC_OVERRIDE_REASON_MIN_LENGTH}
          onClick={() => onConfirm(reason.trim())}
        >
          Continue to sign &amp; close
        </Button>
      </div>
    </Modal>
  );
}
