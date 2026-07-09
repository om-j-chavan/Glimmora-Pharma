"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { RoleCapsEditor, deriveRoleCapsState, draftFromRows, type RoleCapsDraft } from "./RoleCapsEditor";
import type { RoleMatrixRow } from "@/lib/roleLimits";

/**
 * Shared "Configure role limits" modal (SA-only callers). Editable cap per role
 * (blank = — = unlimited), current usage shown per row, a live "Allocated X /
 * total" readout, and the two Phase-B guards mirrored client-side FOR UX ONLY:
 *   • sum of caps > total  → block + footer warning
 *   • a cap < that role's current usage → block + per-row warning
 * The SERVER (setPlanRoleLimits / setTenantRoleLimits) is authoritative: on Save
 * we call `onSave` and render whatever error it returns (the client checks just
 * pre-empt the round-trip; they are never the source of truth).
 */

export type RoleLimitsMap = Record<string, number | null>;

export interface ConfigureRoleLimitsModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Current effective/default rows (cap + used per role) to seed the inputs. */
  rows: RoleMatrixRow[];
  /** Plan total (maxUsers) the sum is measured against. */
  total: number;
  /** Persists the desired caps. Returns the server's structured result. */
  onSave: (limits: RoleLimitsMap) => Promise<{ success: boolean; error?: string }>;
}

export function ConfigureRoleLimitsModal({ open, onClose, title, rows, total, onSave }: ConfigureRoleLimitsModalProps) {
  // Input state per role: concrete cap number (seeded from the current rows).
  const [draft, setDraft] = useState<RoleCapsDraft>(() => draftFromRows(rows));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const st = useMemo(() => deriveRoleCapsState(draft, rows, total), [draft, rows, total]);

  async function save() {
    if (st.blocked) return;
    setSaving(true);
    setServerError(null);
    const res = await onSave(st.parsed);
    setSaving(false);
    if (!res.success) { setServerError(res.error ?? "Failed to save role limits."); return; }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={title}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-[12px]" style={{ color: st.notEqualTotal ? "var(--danger)" : "var(--success)" }}>
            Allocated <span className="font-semibold tabular-nums">{st.allocated}</span> / {total}
            {st.notEqualTotal ? ` — must equal ${total}` : " ✓"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={() => void save()} disabled={saving || st.blocked} loading={saving}>Save</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Set a per-role cap (0–{total}) with the – / + steppers. Caps must sum to EXACTLY {total} (every user slot allocated), and can&apos;t fall below a role&apos;s current usage.
        </p>
        {/* Shared editor — same body used by the Create Tenant (Tailored) flow. */}
        <RoleCapsEditor rows={rows} total={total} draft={draft} onDraftChange={setDraft} showUsage />
        {/* Server is authoritative — its rejection renders here even if the client thought it was fine. */}
        {serverError && (
          <p role="alert" className="text-[12px] rounded-lg px-3 py-2" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
            {serverError}
          </p>
        )}
      </div>
    </Modal>
  );
}
