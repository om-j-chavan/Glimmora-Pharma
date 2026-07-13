"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { Button } from "@/components/ui/Button";
import type { ChangeControlStatus } from "@/lib/change-control-constants";
import type { CCDetail } from "../_shared";
import { Card } from "../components/Card";
// CHANGE CONTROL HIDDEN — reciprocal CAPA-dependency banner suppressed
// as part of disconnecting the CC user-facing surface. The /change-control
// route is still reachable by direct URL; this just removes the
// downstream-CAPA banner from the CC detail modal Overview tab. To
// re-enable: uncomment this import and the <CAPADependencyBanner />
// render below.
// import { CAPADependencyBanner } from "../components/CAPADependencyBanner";

/**
 * Change Control detail — Overview tab. Shows the descriptive cards,
 * status-transition buttons, and the soft-delete affordance. The
 * reciprocal CAPA-dependency banner sits at the top so a CC owner
 * sees the downstream load this CC carries.
 */
export function OverviewTab({
  cc,
  isDeleted,
  transitions,
  isApproverRole,
  canDelete,
  onTransition,
  onDelete,
}: {
  cc: CCDetail;
  isDeleted: boolean;
  transitions: { label: string; target: ChangeControlStatus; variant: "primary" | "secondary" | "danger" | "ghost"; needsApprover: boolean }[];
  isApproverRole: boolean;
  canDelete: boolean;
  onTransition: (target: ChangeControlStatus) => void;
  onDelete: () => void;
}) {
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  return (
    <div className="space-y-3">
      {/* CHANGE CONTROL HIDDEN — reciprocal CAPA dependency banner
       *  suppressed alongside the rest of the CC user-facing surface. The
       *  /change-control route is still URL-reachable; this just removes
       *  the downstream-CAPA banner from the Overview tab. To re-enable:
       *  uncomment the import at the top of this file and the JSX below.
       *  <CAPADependencyBanner cc={cc} />
       */}

      <Card label="Description">{cc.description}</Card>
      <Card label="Rationale">{cc.rationale}</Card>
      {cc.impactAssessment && (
        <Card label="Impact assessment">{cc.impactAssessment}</Card>
      )}
      {cc.affectedSystems && (
        <Card label="Affected systems">{cc.affectedSystems}</Card>
      )}

      <div
        className="rounded-md p-2.5"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--bg-border)",
        }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Timeline
        </p>
        <p
          className="text-[12px]"
          style={{ color: "var(--text-primary)" }}
        >
          Target:{" "}
          {cc.targetImplementationDate
            ? dayjs.utc(cc.targetImplementationDate).format(dateFormat)
            : "—"}
          {" · "}
          Actual:{" "}
          {cc.actualImplementationDate
            ? dayjs.utc(cc.actualImplementationDate).format(dateFormat)
            : "—"}
        </p>
      </div>

      {/* Status transition buttons */}
      {!isDeleted && transitions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2">
          {transitions.map((t) => {
            const disabled = t.needsApprover && !isApproverRole;
            return (
              <Button
                key={t.target}
                variant={t.variant}
                size="sm"
                icon={
                  t.target === "Approved" || t.target === "Closed"
                    ? ShieldCheck
                    : t.target === "Rejected"
                      ? AlertTriangle
                      : t.target === "Implemented"
                        ? CheckCircle2
                        : Send
                }
                disabled={disabled}
                onClick={() => onTransition(t.target)}
                title={
                  disabled
                    ? "Requires QA Head, Customer Admin, or Super Admin"
                    : undefined
                }
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      )}

      {!isDeleted && canDelete && (
        <div
          className="pt-3"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={onDelete}
          >
            Delete change control
          </Button>
          <p
            className="text-[10px] mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Soft delete — owner or Super Admin only. Cannot delete while CAPA
            links exist.
          </p>
        </div>
      )}

      {isDeleted && (
        <div
          className="alert alert-danger flex items-start gap-2 mt-3"
          role="status"
        >
          <Trash2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            Deleted by {cc.deletedByName ?? "(unknown)"} —{" "}
            {cc.deletionReason ?? "no reason recorded"}
          </p>
        </div>
      )}
    </div>
  );
}
