"use client";

import { useState, useEffect } from "react";
import { KeyRound, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { supersedeFrameworkKey } from "@/actions/frameworks";
import type { CatalogFramework } from "@/lib/queries";

/**
 * Change a framework's key via archive-and-alias (Super Admin). This is NEVER an
 * in-place key mutation: it creates a NEW framework with the new key, archives
 * THIS one (pointing it forward to the successor), and migrates each tenant's
 * enablement to the new row. Historical findings keep their old key. The modal
 * doubles as the irreversible-forward confirmation — the consequences are stated
 * before the admin confirms.
 */
export function SupersedeKeyModal({
  open,
  framework,
  onClose,
  onDone,
}: {
  open: boolean;
  framework: CatalogFramework | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setNewKey(""); setBusy(false); setError(null); }
  }, [open, framework]);

  if (!framework) return null;

  const submit = async () => {
    if (newKey.trim().length < 1) { setError("Enter a new key."); return; }
    setBusy(true); setError(null);
    const res = await supersedeFrameworkKey(framework.id, { newKey: newKey.trim() });
    setBusy(false);
    if (!res.success) {
      if (res.fieldErrors?.newKey?.length) setError(res.fieldErrors.newKey[0]);
      else setError(res.error);
      return;
    }
    toast.success(`Key superseded — new framework created and tenant enablement migrated.`);
    onDone();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Change framework key"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={KeyRound} onClick={submit} loading={busy} disabled={busy}>
            Supersede key
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Current key</label>
          <div className="rounded-lg py-2 px-3 text-[12px] font-mono" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}>
            {framework.key}
          </div>
        </div>

        <div>
          <label htmlFor="fw-newkey" className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            New key <span style={{ color: "var(--danger)" }}>*</span>
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (lowercased to a slug; must be unique across active + archived)</span>
          </label>
          <input
            id="fw-newkey"
            type="text"
            autoFocus
            value={newKey}
            onChange={(e) => { setNewKey(e.target.value); setError(null); }}
            placeholder="e.g. eu-annex-1-2025"
            aria-invalid={!!error}
            className={`input font-mono ${error ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
          />
          {error && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
        </div>

        {/* Irreversible-forward confirmation — state exactly what will happen. */}
        <div className="rounded-lg p-3 flex gap-2.5" style={{ background: "var(--warning-muted, var(--bg-elevated))", border: "1px solid var(--bg-border)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning, #b45309)" }} aria-hidden="true" />
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>This moves the framework forward — it does not rename in place.</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>A <strong>new framework</strong> is created with the new key (same name, description, region scope, platform status).</li>
              <li><strong>“{framework.name}”</strong> is archived and linked to its successor.</li>
              <li>Every tenant that had it enabled/disabled keeps that state on the new framework.</li>
              <li>Existing findings keep their old key and still resolve their label.</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
