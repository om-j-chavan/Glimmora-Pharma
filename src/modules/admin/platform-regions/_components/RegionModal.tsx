"use client";

import { useState, useEffect } from "react";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DisplayId } from "@/components/ui/DisplayId";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { createRegion, updateRegion } from "@/actions/regions";
import { deriveRegionValue } from "@/constants/regulatoryRegions";
import { regionDisplayId } from "@/lib/displayIds";
import type { RegionCatalogRow } from "@/lib/queries";

/**
 * Create / edit a region (Stage 2). Inputs are NAME (required, unique) +
 * DESCRIPTION (optional) — NO status field (lifecycle is via the row ⋮). The
 * readable REG-<VALUE> id is shown READ-ONLY: on create it previews the id the
 * server will derive from the name; on edit it is the region's permanent id.
 * Sticky footer; Cancel with unsaved edits → "Discard changes?".
 */
export function RegionModal({
  open,
  region,
  onClose,
  onSaved,
}: {
  open: boolean;
  region: RegionCatalogRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!region;
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(region?.label ?? "");
    setDescription(region?.description ?? "");
    setBusy(false);
    setNameError(null);
    setDiscardOpen(false);
  }, [open, region]);

  const initialName = region?.label ?? "";
  const initialDescription = region?.description ?? "";
  const dirty = name !== initialName || description !== initialDescription;

  // Readable id preview: on edit it's fixed; on create it follows the name.
  const previewValue = isEdit ? region!.value : deriveRegionValue(name);
  const previewId = previewValue ? regionDisplayId(previewValue) : "—";

  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscardOpen(true);
    else onClose();
  };

  const submit = async () => {
    if (name.trim().length < 2) { setNameError("Region name must be at least 2 characters."); return; }
    setBusy(true);
    setNameError(null);
    const res = isEdit
      ? await updateRegion(region!.id, { name: name.trim(), description: description.trim() })
      : await createRegion({ name: name.trim(), description: description.trim() });
    setBusy(false);
    if (!res.success) {
      if (res.fieldErrors?.name?.length) setNameError(res.fieldErrors.name[0]);
      else toast.error(res.error);
      return;
    }
    toast.success(isEdit ? "Region updated." : `Region “${name.trim()}” added.`);
    onSaved();
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={isEdit ? "Edit region" : "Add region"}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={requestClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" icon={isEdit ? Save : Plus} onClick={submit} loading={busy} disabled={busy}>
              {isEdit ? "Save changes" : "Add region"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Readable id (read-only) — derived from the immutable value. */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Region ID <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({isEdit ? "permanent — cannot be changed" : "auto-generated from the name"})</span>
            </label>
            <div className="rounded-lg py-2 px-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
              <DisplayId className="text-[12px]" style={{ color: "var(--text-muted)" }}>{previewId}</DisplayId>
            </div>
          </div>

          <Input
            id="region-name"
            label="Region Name"
            required
            autoFocus
            value={name}
            error={nameError ?? undefined}
            placeholder="e.g. EMA (European Union)"
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
          />

          <Textarea
            id="region-desc"
            label="Description (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this region covers"
          />
        </div>
      </Modal>

      <ConfirmModal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => { setDiscardOpen(false); onClose(); }}
        title="Discard changes?"
        message="You have unsaved changes. Discard them and close?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
      />
    </>
  );
}
