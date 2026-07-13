"use client";

import { useState, useEffect } from "react";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DisplayId } from "@/components/ui/DisplayId";
import { useToast } from "@/components/ui/Toast";
import { addFramework, editFramework } from "@/actions/frameworks";
import { frameworkDisplayId } from "@/lib/displayIds";
import type { CatalogFramework } from "@/lib/queries";

/**
 * Add / Edit a platform framework (Super Admin). In ADD mode the server allocates
 * a NEW unique slug key (never colliding with the 9 reserved keys) and rejects a
 * name that would slug to a reserved key. In EDIT mode (a `framework` is passed)
 * only the DISPLAY metadata + region scope change — name, description, and the
 * Global/specific-region scope; the stable `key` is shown READ-ONLY and is never
 * altered (it is the immutable Finding.framework contract). platformEnabled is
 * NOT edited here — that stays on the row toggle.
 */
export function AddFrameworkModal({
  open,
  onClose,
  regions,
  onSaved,
  framework = null,
  defaultRegion,
}: {
  open: boolean;
  onClose: () => void;
  regions: { value: string; label: string }[];
  onSaved: () => void;
  /** When set → Edit mode (prefilled, key read-only). Absent/null → Add mode. */
  framework?: CatalogFramework | null;
  /** Add mode only: pre-link the new CUSTOM framework to this region (region
   *  drill-down "+ Framework"). Defaults the scope to region-specific, not
   *  Global, with this region preselected. */
  defaultRegion?: string;
}) {
  const isEdit = !!framework;
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [global, setGlobal] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Prefill from the framework in Edit mode; reset blank in Add mode.
  useEffect(() => {
    if (!open) return;
    if (framework) {
      setName(framework.name);
      setDescription(framework.description ?? "");
      setCategory(framework.category ?? "");
      setGlobal(framework.appliesToAllRegions);
      setSelected(framework.regions);
    } else if (defaultRegion) {
      // Region drill-down "+ Framework": a CUSTOM framework LINKED to this region
      // (region-specific scope, this region preselected) — never a Global default.
      setName(""); setDescription(""); setCategory(""); setGlobal(false); setSelected([defaultRegion]);
    } else {
      setName(""); setDescription(""); setCategory(""); setGlobal(true); setSelected([]);
    }
    setBusy(false); setNameError(null);
  }, [open, framework, defaultRegion]);

  const toggleRegion = (v: string) =>
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const submit = async () => {
    if (name.trim().length < 2) { setNameError("Name must be at least 2 characters."); return; }
    if (!global && selected.length === 0) { toast.error("Select at least one region, or make the framework Global."); return; }
    setBusy(true); setNameError(null);
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim(), // "" clears it server-side
      appliesToAllRegions: global,
      regions: global ? undefined : selected,
    };
    const res = isEdit ? await editFramework(framework!.id, payload) : await addFramework(payload);
    setBusy(false);
    if (!res.success) {
      if (res.fieldErrors?.name?.length) setNameError(res.fieldErrors.name[0]);
      else toast.error(res.error);
      return;
    }
    toast.success(isEdit ? `Framework “${name.trim()}” updated.` : `Framework “${name.trim()}” added.`);
    onSaved();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? "Edit framework" : "Add framework"}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="sm" icon={isEdit ? Save : Plus} onClick={submit} loading={busy} disabled={busy}>
            {isEdit ? "Save changes" : "Add framework"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Read-only display id (Edit mode) — the immutable identifier, shown so
            the admin sees it but it can never be changed here. */}
        {isEdit && (
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Framework ID <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(permanent — cannot be changed)</span>
            </label>
            <div
              className="rounded-lg py-2 px-3"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
            >
              <DisplayId className="text-[12px]" style={{ color: "var(--text-muted)" }}>{frameworkDisplayId(framework!.key)}</DisplayId>
            </div>
          </div>
        )}

        <Input
          id="fw-name"
          label="Name"
          required
          autoFocus
          value={name}
          error={nameError ?? undefined}
          placeholder="e.g. EU Annex 1 (Sterile)"
          onChange={(e) => { setName(e.target.value); setNameError(null); }}
        />

        <Textarea
          id="fw-desc"
          label="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this framework covers"
        />

        <Input
          id="fw-category"
          label="Category (optional — for grouping)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. US · EU · ICH · Data Integrity"
        />

        <div className="rounded-lg border p-3" style={{ borderColor: "var(--bg-border)" }}>
          <Toggle
            id="fw-global"
            label="Applies to all regions (Global)"
            description="When off, the framework applies only to the specific regions you select below."
            checked={global}
            onChange={() => setGlobal((v) => !v)}
          />
          {!global && (
            <div className="mt-3">
              <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Regions</p>
              <div className="flex flex-wrap gap-2">
                {regions.map((r) => {
                  const on = selected.includes(r.value);
                  return (
                    <Button
                      key={r.value}
                      type="button"
                      size="sm"
                      variant={on ? "primary" : "secondary"}
                      aria-pressed={on}
                      onClick={() => toggleRegion(r.value)}
                    >
                      {r.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
