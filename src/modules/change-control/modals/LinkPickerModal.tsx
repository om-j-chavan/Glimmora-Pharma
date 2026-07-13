"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { LinkableCAPA } from "../_shared";

/**
 * Pick a CAPA to link to this Change Control. Lazy-loaded by the modal
 * shell so the linkable list only round-trips the server when the
 * picker actually opens. Selecting a CAPA + clicking Link forwards to
 * onConfirm with the selected id + optional rationale.
 */
export function LinkPickerModal({
  linkable,
  linkableLoading,
  linkSelectedId,
  linkRationale,
  linkBusy,
  linkError,
  onSelect,
  onRationaleChange,
  onCancel,
  onConfirm,
}: {
  linkable: LinkableCAPA[];
  linkableLoading: boolean;
  linkSelectedId: string | null;
  linkRationale: string;
  linkBusy: boolean;
  linkError: string | null;
  onSelect: (id: string) => void;
  onRationaleChange: (s: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open
      onClose={linkBusy ? () => undefined : onCancel}
      title="Link a CAPA"
    >
      {linkableLoading ? (
        <p
          className="text-[12px] py-4 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          Loading CAPAs…
        </p>
      ) : linkable.length === 0 ? (
        <p
          className="text-[12px] py-4"
          style={{ color: "var(--text-muted)" }}
        >
          No linkable CAPAs available. CAPAs in &apos;closed&apos; or &apos;rejected&apos;
          status, and CAPAs already linked to this Change Control, are
          excluded.
        </p>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-y-auto mb-3">
          {linkable.map((c) => (
            <label
              key={c.id}
              className="flex items-start gap-2 p-2 rounded-md cursor-pointer"
              style={{
                background:
                  linkSelectedId === c.id
                    ? "var(--brand-muted)"
                    : "var(--bg-elevated)",
                border:
                  linkSelectedId === c.id
                    ? "1px solid var(--brand)"
                    : "1px solid var(--bg-border)",
              }}
            >
              <input
                type="radio"
                name="link-capa"
                checked={linkSelectedId === c.id}
                onChange={() => onSelect(c.id)}
                disabled={linkBusy}
                aria-label={`Link to CAPA ${c.reference ?? c.id}`}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {c.reference ?? c.id.slice(0, 8)}
                </p>
                <p
                  className="text-[11px] line-clamp-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {c.description}
                </p>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Risk: {c.risk} · Status: {c.status}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}
      <textarea
        className="input text-[12px] min-h-[60px] mb-2"
        value={linkRationale}
        onChange={(e) => onRationaleChange(e.target.value)}
        placeholder="Why is this link being made? (optional)"
        maxLength={2000}
        disabled={linkBusy}
        aria-label="Link rationale"
      />
      {linkError && (
        <p
          role="alert"
          className="text-[11px] mb-2"
          style={{ color: "var(--danger)" }}
        >
          {linkError}
        </p>
      )}
      <div
        className="flex justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--bg-border)" }}
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={linkBusy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={Link2}
          disabled={linkBusy || !linkSelectedId}
          loading={linkBusy}
          onClick={onConfirm}
        >
          Link CAPA
        </Button>
      </div>
    </Modal>
  );
}
