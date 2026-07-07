"use client";

import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { archiveRegion, previewRegionArchive } from "@/actions/regions";
import type { RegionCatalogRow } from "@/lib/queries";

/**
 * Archive-region confirmation (Stage 3). Before archiving, it fetches what the
 * region is in use by and NAMES the affected tenants (+ framework-link count),
 * stating they will move to Global — per the warning standard. Only on confirm
 * does it call archiveRegion, which archives + reassigns atomically.
 */
export function ArchiveRegionConfirm({
  region,
  onClose,
  onDone,
}: {
  region: RegionCatalogRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [impact, setImpact] = useState<{ tenants: string[]; frameworkLinks: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!region) { setImpact(null); return; }
    let alive = true;
    setLoading(true);
    previewRegionArchive(region.id).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (r.success) setImpact({ tenants: r.data.tenants, frameworkLinks: r.data.frameworkLinks });
    });
    return () => { alive = false; };
  }, [region]);

  const confirm = async () => {
    if (!region) return;
    setBusy(true);
    const res = await archiveRegion(region.id);
    setBusy(false);
    if (!res.success) { toast.error(res.error); return; }
    const d = res.data as { tenantsReassigned?: number } | null;
    const moved = d?.tenantsReassigned ?? 0;
    toast.success(moved ? `${region.label} archived — ${moved} tenant${moved === 1 ? "" : "s"} moved to Global.` : `${region.label} archived.`);
    onDone();
    onClose();
  };

  const inUse = !!impact && (impact.tenants.length > 0 || impact.frameworkLinks > 0);
  const message = !region ? null : loading ? (
    <>Checking what&rsquo;s using <strong>{region.label}</strong>&hellip;</>
  ) : inUse ? (
    <>
      Archiving <strong>{region.label}</strong> will move everything on it to <strong>Global</strong>:{" "}
      {impact!.tenants.length > 0 && (
        <>{impact!.tenants.length} tenant{impact!.tenants.length === 1 ? "" : "s"} (<strong>{impact!.tenants.join(", ")}</strong>){impact!.frameworkLinks > 0 ? " and " : ""}</>
      )}
      {impact!.frameworkLinks > 0 && (
        <>{impact!.frameworkLinks} framework link{impact!.frameworkLinks === 1 ? "" : "s"}</>
      )}
      . You can restore or permanently delete the region afterwards. Continue?
    </>
  ) : (
    <>Archive <strong>{region.label}</strong>? It has no tenants or framework links. You can restore or permanently delete it later.</>
  );

  return (
    <ConfirmModal
      open={!!region}
      onClose={busy ? () => {} : onClose}
      onConfirm={confirm}
      title="Archive region?"
      message={message}
      confirmLabel={inUse ? "Archive & move to Global" : "Archive"}
      cancelLabel="Cancel"
      variant="warning"
      icon={Archive}
      loading={busy || loading}
    />
  );
}
