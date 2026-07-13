"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * Soft-delete confirm modal for a Change Control. Reason ≥ 10 chars
 * enforced both client-side (button disabled) and server-side (zod).
 * Hard-deletes are not supported — Part 11 immutability — only the
 * deletedAt/deletedBy/deletionReason metadata is set.
 */
export function DeleteModal({
  deleteReason,
  deleteBusy,
  deleteError,
  onReasonChange,
  onCancel,
  onConfirm,
}: {
  deleteReason: string;
  deleteBusy: boolean;
  deleteError: string | null;
  onReasonChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={deleteBusy ? () => undefined : onCancel}
      title="Delete change control"
    >
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        Soft-delete only — the row stays for audit trail. Reason of at
        least 10 characters is required.
      </p>
      <textarea
        className="input text-[12px] min-h-[80px] mb-2"
        value={deleteReason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Why is this Change Control being deleted?"
        maxLength={2000}
        disabled={deleteBusy}
        aria-label="Deletion reason"
      />
      {deleteError && (
        <p
          role="alert"
          className="text-[11px] mb-2"
          style={{ color: "var(--danger)" }}
        >
          {deleteError}
        </p>
      )}
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--bg-border)" }}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={deleteBusy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={Trash2}
          disabled={deleteBusy || deleteReason.trim().length < 10}
          loading={deleteBusy}
          onClick={onConfirm}
        >
          Delete
        </Button>
      </div>
    </Modal>
  );
}
