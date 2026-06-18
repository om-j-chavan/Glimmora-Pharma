"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { roleLabel } from "@/lib/labels/roles";
import type { AuditTrailRow } from "@/lib/queries";
import { SEVERITY_VARIANT, formatAction, severityOf } from "../audit-helpers";

/**
 * Read-only detail for a single audit event. Reuses the standard ui/Modal
 * (backdrop, Esc, focus-return, aria-labelledby via `title`). Shows the full
 * record — timestamp, actor, action, affected entity by its PROPER domain id,
 * before/after values — and links to the source record where one exists.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1">{label}</dt>
      <dd className="text-[13px] text-(--text-primary)">{children}</dd>
    </div>
  );
}

export function AuditDetailModal({
  row,
  timezone,
  onClose,
}: {
  row: AuditTrailRow;
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const hasDiff = !!(row.oldValue || row.newValue);
  const ts = dayjs(row.createdAt);

  const footer = (
    <div className="flex items-center justify-end gap-2">
      {row.href && (
        <Button
          variant="secondary"
          icon={ExternalLink}
          onClick={() => {
            onClose();
            router.push(row.href!);
          }}
        >
          Open source record
        </Button>
      )}
      <Button variant="primary" onClick={onClose}>
        Close
      </Button>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Audit event" footer={footer}>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Field label="Timestamp">
          <span className="font-mono text-[12px]">{ts.tz(timezone).format("DD MMM YYYY HH:mm:ss")}</span>
          <span className="block text-[11px] text-(--text-muted) font-mono">UTC {ts.utc().format("YYYY-MM-DD HH:mm:ss")}</span>
        </Field>

        <Field label="Action">
          <Badge variant={SEVERITY_VARIANT[severityOf(row.action)]}>{formatAction(row.action)}</Badge>
        </Field>

        <Field label="Actor">
          <span className="font-medium">{row.userName}</span>
          {row.userRole && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-(--bg-elevated) text-(--text-secondary)">
              {roleLabel(row.userRole)}
            </span>
          )}
        </Field>

        <Field label="Module">
          <span className="font-mono text-[12px] text-(--brand)">{row.module}</span>
        </Field>

        <Field label="Affected record">
          {row.href ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(row.href!);
              }}
              className="font-mono text-[12px] text-(--brand) hover:underline inline-flex items-center gap-1 border-none bg-transparent p-0 cursor-pointer"
            >
              {row.displayId}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : (
            <span className="font-mono text-[12px]">{row.displayId}</span>
          )}
          {row.recordTitle && row.recordTitle !== row.displayId && (
            <span className="block text-[11px] text-(--text-muted) mt-0.5">{row.recordTitle}</span>
          )}
        </Field>

        {row.ipAddress && (
          <Field label="IP address">
            <span className="font-mono text-[12px]">{row.ipAddress}</span>
          </Field>
        )}
      </dl>

      {hasDiff && (
        <div className="mt-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted) mb-2">Change</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 rounded-lg bg-(--bg-elevated) border border-(--card-border) text-[11px]">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">Before</div>
              <pre className="font-mono text-(--danger) whitespace-pre-wrap break-all m-0">{row.oldValue ?? "—"}</pre>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">After</div>
              <pre className="font-mono text-(--success) whitespace-pre-wrap break-all m-0">{row.newValue ?? "—"}</pre>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
