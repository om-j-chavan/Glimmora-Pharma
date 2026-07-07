"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Upload, Trash2, ZoomIn } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { updateTenantLogo } from "@/actions/tenants";

interface LogoCropModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  /** Current logo (data URL) so "Remove" can be offered when one exists. */
  currentLogo?: string | null;
  /** Called with the new logo (data URL) or null on removal, after the server
   *  write succeeds — lets the caller update Redux so the View reflects it now. */
  onSaved: (logoUrl: string | null) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp";
const OUTPUT_SIZE = 256; // square avatar — keeps the stored data URL small

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Render the selected crop area to a square canvas → JPEG data URL. */
async function cropToDataUrl(imageSrc: string, area: Area): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Minimal logo crop-and-upload modal (super admin, tenant detail). Pick →
 * crop (square) → save. The cropper is the live preview. Persists via
 * updateTenantLogo (logoUrl data URL) and hands the result back so the caller
 * refreshes Redux immediately. Intentionally NOT a media manager.
 */
export function LogoCropModal({ open, onClose, tenantId, tenantName, currentLogo, onSaved }: LogoCropModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  // Confirmation gate — a logo save/removal is a change to the tenant's brand,
  // so it is confirmed before it persists.
  const [pending, setPending] = useState<null | "save" | "remove">(null);

  const onCropComplete = useCallback((_area: Area, areaInPixels: Area) => {
    setAreaPixels(areaInPixels);
  }, []);

  const reset = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPixels(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    setPending(null);
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageSrc(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      toast.error("Could not read that image file.");
    }
  };

  const persist = async (logoUrl: string | null) => {
    setSaving(true);
    try {
      const res = await updateTenantLogo(tenantId, logoUrl);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      onSaved(logoUrl);
      toast.success(logoUrl ? `Logo updated for ${tenantName}.` : `Logo removed for ${tenantName}.`);
      reset();
      onClose();
    } catch (err) {
      console.error("[admin] updateTenantLogo failed", err);
      toast.error("Failed to save the logo. Please try again.");
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const handleSave = async () => {
    if (!imageSrc || !areaPixels) return;
    try {
      const dataUrl = await cropToDataUrl(imageSrc, areaPixels);
      await persist(dataUrl);
    } catch (err) {
      console.error("[admin] crop failed", err);
      toast.error("Could not process the image crop.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Update logo"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {currentLogo && !imageSrc && (
              <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={() => setPending("remove")} disabled={saving}>
                Remove logo
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setPending("save")} loading={saving} disabled={!imageSrc || !areaPixels}>
              Save logo
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {!imageSrc ? (
          <label
            htmlFor="logo-file"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer text-center transition-colors border-(--bg-border) hover:border-(--brand)"
          >
            <Upload className="w-6 h-6" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>Choose a logo image</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>PNG, JPEG, or WebP · square crop</span>
            <input
              id="logo-file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>Position &amp; zoom</p>
              <button
                type="button"
                onClick={reset}
                className="text-[11px] font-medium border-none bg-transparent cursor-pointer"
                style={{ color: "var(--brand)" }}
              >
                Choose a different image
              </button>
            </div>
            {/* Cropper needs a positioned, sized container. Rounded mask previews
                the final circular avatar; drag to reposition, slider to zoom. */}
            <div className="relative w-full h-[300px] rounded-xl overflow-hidden border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
              <ZoomIn className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              <label htmlFor="logo-zoom" className="sr-only">Zoom logo</label>
              <input
                id="logo-zoom"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
                aria-label="Zoom logo"
              />
            </div>
          </>
        )}
      </div>

      {/* Confirm before the logo actually changes (save or removal). */}
      <ConfirmModal
        open={pending !== null}
        onClose={() => { if (!saving) setPending(null); }}
        onConfirm={() => { if (pending === "remove") { persist(null); } else { handleSave(); } }}
        loading={saving}
        variant={pending === "remove" ? "danger" : "primary"}
        title={pending === "remove" ? "Remove logo?" : "Update logo?"}
        message={pending === "remove"
          ? <>The logo for {tenantName} will be removed and the default icon shown across the console.</>
          : <>Save this cropped image as the logo for {tenantName}? It updates on the detail page and the accounts table.</>}
        confirmLabel={pending === "remove" ? "Remove" : "Save logo"}
      />
    </Modal>
  );
}
