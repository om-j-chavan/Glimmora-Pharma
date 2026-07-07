"use client";

import { useState } from "react";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { DisplayId } from "@/components/ui/DisplayId";
import { PasswordConfirmModal } from "@/components/ui/PasswordConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { unarchiveRegion, permanentlyDeleteRegion } from "@/actions/regions";
import { regionDisplayId } from "@/lib/displayIds";
import type { RegionCatalogRow } from "@/lib/queries";

/**
 * Archived regions manager (Stage 2). Lists archived regions with two actions:
 *   - Restore (un-archive) — brings the region back to Active.
 *   - Permanently Delete — password-gated (Super Admin re-auth, verified
 *     server-side) + final confirm; only permitted for a zero-reference region
 *     (Stage 3 auto-reassigns references to GLOBAL on archive, so an archived
 *     region is clean). The reserved GLOBAL region is never archivable, so it
 *     never appears here.
 */
export function ArchivedRegionsModal({
  open,
  archived,
  onClose,
  onChanged,
}: {
  open: boolean;
  archived: RegionCatalogRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<RegionCatalogRow | null>(null);

  const restore = async (r: RegionCatalogRow) => {
    setBusyId(r.id);
    const res = await unarchiveRegion(r.id);
    setBusyId(null);
    if (!res.success) { toast.error(res.error); return; }
    toast.success(`${r.label} restored.`);
    onChanged();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Archived regions">
        {archived.length === 0 ? (
          <p className="text-[13px] py-6 text-center" style={{ color: "var(--text-muted)" }}>
            No archived regions.
          </p>
        ) : (
          <ul className="space-y-2">
            {archived.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.label}</p>
                  <DisplayId className="text-[11px]" style={{ color: "var(--text-muted)" }}>{regionDisplayId(r.value)}</DisplayId>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" icon={ArchiveRestore} onClick={() => restore(r)} disabled={busyId === r.id}>
                    Restore
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setPurging(r)}
                    disabled={busyId === r.id}
                    aria-label={`Permanently delete ${r.label}`}
                  >
                    Permanently delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Password-gated permanent delete — verified server-side, then final
          confirm is the password submit itself. */}
      <PasswordConfirmModal
        open={!!purging}
        onClose={() => setPurging(null)}
        onConfirm={(password) => permanentlyDeleteRegion(purging!.id, password)}
        onSuccess={() => { toast.success(`${purging?.label} permanently deleted.`); onChanged(); }}
        title="Permanently delete region?"
        confirmLabel="Permanently delete"
        variant="danger"
        icon={Trash2}
        message={
          <>
            This permanently removes <strong>{purging?.label}</strong> ({purging ? regionDisplayId(purging.value) : ""}).
            This cannot be undone. Enter your Super Admin password to confirm.
          </>
        }
      />
    </>
  );
}
