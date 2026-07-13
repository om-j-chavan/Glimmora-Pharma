"use client";

import { useState, useEffect } from "react";
import { KeyRound, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { supersedeRegionValue } from "@/actions/regions";
import type { RegionCatalogRow } from "@/lib/queries";

/**
 * Change a region's VALUE via archive-and-alias WITH reference re-pointing. This
 * is never an in-place value edit: a new region value is created, this one is
 * archived, and EVERY tenant + framework-scope currently on it is moved to the
 * new value. The modal doubles as the confirmation — it spells out the effect,
 * including the live reference counts, before the admin confirms.
 */
export function SupersedeRegionModal({
  open,
  region,
  onClose,
  onDone,
}: {
  open: boolean;
  region: RegionCatalogRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setNewValue(""); setBusy(false); setError(null); }
  }, [open, region]);

  if (!region) return null;
  const refs = region.tenantCount + region.frameworkCount;

  const submit = async () => {
    if (newValue.trim().length < 1) { setError("Enter a new value."); return; }
    setBusy(true); setError(null);
    const res = await supersedeRegionValue(region.id, { newValue: newValue.trim() });
    setBusy(false);
    if (!res.success) {
      if (res.fieldErrors?.newValue?.length) setError(res.fieldErrors.newValue[0]);
      else setError(res.error);
      return;
    }
    toast.success(`Region value superseded — references moved to the new value.`);
    onDone();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Change region value"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={KeyRound} onClick={submit} loading={busy} disabled={busy}>
            Supersede value
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Current value</label>
          <div className="rounded-lg py-2 px-3 text-[12px] font-mono" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}>
            {region.value}
          </div>
        </div>

        <div>
          <label htmlFor="rg-newvalue" className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            New value <span style={{ color: "var(--danger)" }}>*</span>
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (unique across active + archived)</span>
          </label>
          <input
            id="rg-newvalue"
            type="text"
            autoFocus
            value={newValue}
            onChange={(e) => { setNewValue(e.target.value); setError(null); }}
            placeholder="e.g. EMA_EU"
            aria-invalid={!!error}
            className={`input font-mono ${error ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
          />
          {error && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
        </div>

        <div className="rounded-lg p-3 flex gap-2.5" style={{ background: "var(--warning-muted, var(--bg-elevated))", border: "1px solid var(--bg-border)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning, #b45309)" }} aria-hidden="true" />
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>This renames the value forward — it does not edit in place.</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>A <strong>new region value</strong> is created (keeping the label “{region.label}”).</li>
              <li><strong>“{region.value}”</strong> is archived and linked to its successor.</li>
              <li><strong>{region.tenantCount} tenant(s)</strong> and <strong>{region.frameworkCount} framework scope(s)</strong> currently on it are moved to the new value{refs === 0 ? " (none right now)" : ""}.</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
