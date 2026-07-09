"use client";

import { useCallback, useEffect, useState } from "react";
import { Users2, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RoleMatrixTable } from "@/components/shared/RoleMatrixTable";
import { ConfigureRoleLimitsModal, type RoleLimitsMap } from "@/components/shared/ConfigureRoleLimitsModal";
import { getTenantRoleMatrixAction, getMyRoleMatrix, setTenantRoleLimits } from "@/actions/roleLimits";
import type { RoleMatrixSummary } from "@/lib/roleLimits";

/**
 * Tenant-detail "Role Limits & Usage" section (Screen 3/4, item 2b). Shows the
 * EFFECTIVE per-tenant matrix (resolveTenantRoleMatrix via the read action):
 * LIMIT / USED / REMAINING / bar per role. Super Admin gets "Edit Limits" →
 * per-tenant OVERRIDES via setTenantRoleLimits (same invariants). For a
 * non-super-admin viewer the section is READ-ONLY and scoped to their own tenant.
 */
export function TenantRoleLimitsSection({ tenantId, isSuperAdmin }: { tenantId: string; isSuperAdmin: boolean }) {
  const [matrix, setMatrix] = useState<RoleMatrixSummary | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    // SA reads any tenant; a non-SA viewer reads only their OWN tenant (scoped).
    const res = isSuperAdmin ? await getTenantRoleMatrixAction(tenantId) : await getMyRoleMatrix();
    if (res.success) setMatrix(res.data);
  }, [tenantId, isSuperAdmin]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(limits: RoleLimitsMap) {
    const res = await setTenantRoleLimits(tenantId, limits);
    if (res.success) await load();
    return res;
  }

  if (!matrix) return null;

  return (
    <div className="mt-6">
    <Card
      header={
        <>
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Role Limits &amp; Usage</span>
          </div>
          {isSuperAdmin && (
            <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setEditOpen(true)} disabled={matrix.total <= 0}>Edit Limits</Button>
          )}
        </>
      }
    >
      <RoleMatrixTable rows={matrix.rows} variant="usage" />
      {isSuperAdmin && (
        <ConfigureRoleLimitsModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Edit role limits (per-tenant override)"
          rows={matrix.rows}
          total={matrix.total}
          onSave={handleSave}
        />
      )}
    </Card>
    </div>
  );
}
