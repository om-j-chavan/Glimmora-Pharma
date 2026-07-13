"use client";

import { X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * Unlink confirm modal. Reason ≥ 10 chars enforced. Hard-deletes the
 * link row (links are not Part 11 records themselves; the audit trail
 * preserves the linkage history through CAPA_CC_UNLINKED rows).
 */
export function UnlinkModal({
  unlinkReason,
  unlinkBusy,
  unlinkError,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  unlinkReason: string;
  unlinkBusy: boolean;
  unlinkError: string | null;
  onReasonChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={unlinkBusy ? () => undefined : onCancel}
      title="Unlink CAPA"
    >
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        Reason of at least 10 characters is required. The link is removed
        but the audit trail preserves the original linkage history.
      </p>
      <textarea
        className="input text-[12px] min-h-[80px] mb-2"
        value={unlinkReason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Why is this link being removed?"
        maxLength={2000}
        disabled={unlinkBusy}
        aria-label="Unlink reason"
      />
      {unlinkError && (
        <p
          role="alert"
          className="text-[11px] mb-2"
          style={{ color: "var(--danger)" }}
        >
          {unlinkError}
        </p>
      )}
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--bg-border)" }}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={unlinkBusy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={XIcon}
          disabled={unlinkBusy || unlinkReason.trim().length < 10}
          loading={unlinkBusy}
          onClick={onConfirm}
        >
          Unlink
        </Button>
      </div>
    </Modal>
  );
}
