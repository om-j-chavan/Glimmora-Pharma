"use client";

import { useState, useEffect } from "react";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { addRegion, editRegionLabel } from "@/actions/regions";
import type { RegionCatalogRow } from "@/lib/queries";

/**
 * Add a region (value + label) or edit an existing region's LABEL only. In edit
 * mode the VALUE is shown READ-ONLY — it is an immutable key (stored as a bare
 * FK in Tenant.regulatoryRegion + FrameworkRegion.region); changing it is a
 * separate archive-and-alias flow (SupersedeRegionModal), never an edit.
 */
export function RegionFormModal({
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
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ value?: string; label?: string }>({});

  useEffect(() => {
    if (!open) return;
    setValue(region?.value ?? "");
    setLabel(region?.label ?? "");
    setBusy(false); setErrors({});
  }, [open, region]);

  const submit = async () => {
    if (label.trim().length < 2) { setErrors({ label: "Label must be at least 2 characters." }); return; }
    if (!isEdit && value.trim().length < 1) { setErrors({ value: "Enter a value." }); return; }
    setBusy(true); setErrors({});
    const res = isEdit
      ? await editRegionLabel(region!.id, { label: label.trim() })
      : await addRegion({ value: value.trim(), label: label.trim() });
    setBusy(false);
    if (!res.success) {
      setErrors({ value: res.fieldErrors?.value?.[0], label: res.fieldErrors?.label?.[0] });
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    toast.success(isEdit ? `Region label updated.` : `Region “${value.trim()}” added.`);
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? "Edit region label" : "Add region"}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={isEdit ? Save : Plus} onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? "Save label" : "Add region"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="rg-value" className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Value {isEdit ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(permanent — cannot be changed)</span> : <span style={{ color: "var(--danger)" }}>*</span>}
          </label>
          {isEdit ? (
            <div className="rounded-lg py-2 px-3 text-[12px] font-mono" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}>
              {region!.value}
            </div>
          ) : (
            <>
              <input
                id="rg-value"
                type="text"
                autoFocus
                value={value}
                onChange={(e) => { setValue(e.target.value); setErrors((p) => ({ ...p, value: undefined })); }}
                placeholder="e.g. EMA_EU"
                aria-invalid={!!errors.value}
                className={`input font-mono ${errors.value ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {errors.value && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.value}</p>}
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Letters, numbers, dash or underscore. This is the permanent key stored on tenants + framework scopes.</p>
            </>
          )}
        </div>

        <div>
          <label htmlFor="rg-label" className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Label <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <input
            id="rg-label"
            type="text"
            autoFocus={isEdit}
            value={label}
            onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label: undefined })); }}
            placeholder="e.g. EMA (European Union)"
            aria-invalid={!!errors.label}
            className={`input ${errors.label ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
          />
          {errors.label && <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{errors.label}</p>}
        </div>
      </div>
    </Modal>
  );
}
