"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil, CheckCircle2, Circle, Gavel } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { canEditManagementDecision } from "@/lib/permissions/roleSets";
import {
  updateManagementDecision,
  uploadDecisionDocument,
  removeDecisionDocument,
  setDecisionItemStatus,
} from "@/actions/management-decisions";
import { PageLayout } from "@/components/layout/PageLayout";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { CategorizedDocUploader, type DocUploadEntry } from "@/components/shared/CategorizedDocUploader";
import { formatReference } from "@/lib/reference";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { roleLabel } from "@/lib/labels/roles";
import {
  DECISION_DOC_CATEGORIES,
  DECISION_DOC_CATEGORY_LABEL,
  DECISION_ITEM_STATUS_BADGE,
  DECISION_ITEM_STATUS_LABEL,
  isActionItem,
  type DecisionItemStatus,
} from "@/constants/managementDecision";
import type { ManagementDecisionRow, DecisionItemRow } from "@/lib/queries/managementDecisions";
import type { WorklistDoc } from "@/lib/queries/worklist";
import { ManagementDecisionModal, type DecisionParticipant, type ManagementDecisionFormValues } from "./modals/ManagementDecisionModal";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1 block";

export interface DecisionAuditEntry {
  id: string;
  action: string;
  userName: string;
  userRole: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface ManagementDecisionDetailPageProps {
  decision: ManagementDecisionRow;
  docs: WorklistDoc[];
  audit: DecisionAuditEntry[];
  participants: DecisionParticipant[];
}

/**
 * Management-decision detail. The server route already proved the caller may SEE
 * this meeting (getManagementDecision → the visibility where-clause), so this
 * component only gates ACTIONS.
 *
 * The meeting is the DURABLE RECORD: nothing here hard-deletes anything, and
 * every amendment lands in the audit trail (the clock modal), including the text
 * of any decision item that was removed. That is the "complete history for future
 * reference" — the current minutes plus the full trail of how they got that way.
 */
export function ManagementDecisionDetailPage({ decision, docs, audit, participants }: ManagementDecisionDetailPageProps) {
  const router = useRouter();
  const { org } = useTenantConfig();
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const reference = formatReference("MGT", decision);

  const canEdit = canEditManagementDecision(role, user?.id ?? null, decision);
  const fmt = (iso: string) => dayjs.utc(iso).tz(timezone).format(`${dateFormat} HH:mm`);

  const attendeeList = decision.attendees.split(/\r?\n/).map((a) => a.trim()).filter(Boolean);
  const decisions = decision.items.filter((i) => !isActionItem(i));
  const actionItems = decision.items.filter(isActionItem);

  async function handleEditSubmit(values: ManagementDecisionFormValues) {
    const res = await updateManagementDecision(decision.id, {
      topic: values.topic,
      meetingDate: dayjs(values.meetingDate).utc().toISOString(),
      attendees: values.attendees,
      chairedById: values.chairedById || null,
      items: values.items.map((i) => ({
        id: i.id,
        text: i.text,
        ownerId: i.ownerId || null,
        dueDate: i.dueDate ? dayjs(i.dueDate).utc().toISOString() : null,
      })),
    });
    if (!res.success) return { success: false, error: res.error };
    setSavedPopup(true);
    router.refresh();
    return { success: true as const };
  }

  async function handleUploadDocs(entries: DocUploadEntry[]) {
    for (const entry of entries) {
      const fd = new FormData();
      fd.append("file", entry.file);
      const res = await uploadDecisionDocument(decision.id, fd, entry.category);
      if (!res.success) return { success: false, error: res.error };
    }
    router.refresh();
    return { success: true as const };
  }

  async function handleRemoveDoc(docId: string) {
    const res = await removeDecisionDocument(decision.id, docId);
    if (res.success) router.refresh();
    return res;
  }

  async function toggleItem(item: DecisionItemRow) {
    if (!canEdit) return;
    setBusyItemId(item.id);
    const next: DecisionItemStatus = item.status === "done" ? "open" : "done";
    const res = await setDecisionItemStatus(decision.id, item.id, next);
    setBusyItemId(null);
    if (res.success) router.refresh();
  }

  function renderItem(item: DecisionItemRow, index: number, showTask: boolean) {
    const overdue =
      !!item.dueDate && item.status !== "done" && dayjs.utc(item.dueDate).isBefore(dayjs());
    return (
      <div key={item.id} className="flex items-start gap-2.5 rounded-lg border p-3"
           style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
        {showTask ? (
          <button
            type="button"
            onClick={() => void toggleItem(item)}
            disabled={!canEdit || busyItemId === item.id}
            aria-label={item.status === "done" ? "Mark action item open" : "Mark action item done"}
            className="mt-0.5 shrink-0 bg-transparent border-none p-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {item.status === "done"
              ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} aria-hidden="true" />
              : <Circle className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
          </button>
        ) : (
          <span className="text-[11px] font-mono mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }}>{index + 1}.</span>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)" }}>{item.text}</p>
          {showTask && (
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <span className={DECISION_ITEM_STATUS_BADGE[item.status as DecisionItemStatus] ?? "badge badge-gray"}>
                {DECISION_ITEM_STATUS_LABEL[item.status as DecisionItemStatus] ?? item.status}
              </span>
              {item.ownerName && (
                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {item.ownerName}{item.ownerId === user?.id ? " (You)" : ""}
                </span>
              )}
              {item.dueDate && (
                <span className="text-[11px]" style={{ color: overdue ? "#ef4444" : "var(--text-muted)" }}>
                  due {dayjs.utc(item.dueDate).tz(timezone).format(dateFormat)}
                  {overdue && " · overdue"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <PageLayout
      breadcrumb={{ parent: "Governance & KPIs", parentHref: "/governance", current: decision.topic }}
      description={reference}
      actions={canEdit ? [{ label: "Amend", onClick: () => setEditOpen(true), variant: "primary", icon: Pencil }] : []}
      headerRight={
        <button
          type="button"
          onClick={() => setAuditOpen(true)}
          aria-label="Audit trail"
          title="Audit trail"
          className="w-8 h-8 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors"
        >
          <Clock className="w-4 h-4 text-(--text-muted)" aria-hidden="true" />
        </button>
      }
    >
      <div className="space-y-5">
        {/* Meeting info */}
        <div className="rounded-lg border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <h3 className={LABEL}>Meeting date</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {dayjs.utc(decision.meetingDate).tz(timezone).format(dateFormat)}
              </p>
            </div>
            <div>
              <h3 className={LABEL}>Chaired by</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{decision.chairedByName ?? "—"}</p>
            </div>
            <div>
              <h3 className={LABEL}>Minuted by</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{decision.createdBy}</p>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <h3 className={LABEL}>Attendees <span className="normal-case font-normal">· {attendeeList.length}</span></h3>
              <div className="flex flex-wrap gap-1.5">
                {attendeeList.map((a) => <Badge key={a} variant="gray">{a}</Badge>)}
              </div>
            </div>
          </div>
        </div>

        {/* Decisions */}
        {decisions.length > 0 && (
          <div>
            <h3 className={LABEL}>Decisions <span className="normal-case font-normal">· {decisions.length}</span></h3>
            <div className="space-y-2">{decisions.map((i, n) => renderItem(i, n, false))}</div>
          </div>
        )}

        {/* Action items */}
        {actionItems.length > 0 && (
          <div>
            <h3 className={LABEL}>Action items <span className="normal-case font-normal">· {actionItems.length}</span></h3>
            <div className="space-y-2">{actionItems.map((i, n) => renderItem(i, n, true))}</div>
          </div>
        )}

        {decision.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8">
            <Gavel className="w-8 h-8 text-[#334155]" aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Nothing was minuted for this meeting.</p>
          </div>
        )}

        {/* Supporting documents */}
        <div className="pt-4 border-t border-(--bg-border)">
          <h3 className={LABEL}>Supporting documents</h3>
          <CategorizedDocUploader
            docs={docs}
            categories={DECISION_DOC_CATEGORIES}
            categoryLabels={DECISION_DOC_CATEGORY_LABEL}
            readOnly={!canEdit}
            emptyText="No supporting documents attached."
            onUpload={canEdit ? handleUploadDocs : undefined}
            onRemove={canEdit ? handleRemoveDoc : undefined}
          />
        </div>
      </div>

      {/* Amend modal — the SAME modal as the register's Record/Amend. */}
      <ManagementDecisionModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        decision={decision}
        participants={participants}
        docs={docs}
        onSubmit={handleEditSubmit}
        onUploadDocs={handleUploadDocs}
        onRemoveDoc={handleRemoveDoc}
      />

      {/* Audit trail modal (the header clock) — the complete amendment history. */}
      {auditOpen && (
        <Modal open onClose={() => setAuditOpen(false)} title={`Audit Trail — ${reference}`}>
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 text-[11px] pr-1">
            {audit.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No audit entries recorded yet.</p>
            ) : (
              audit.map((e) => (
                <div key={e.id} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--brand)" }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</p>
                    <p style={{ color: "var(--text-muted)" }}>
                      {e.userName}{e.userRole ? ` (${roleLabel(e.userRole)})` : ""} — {fmt(e.createdAt)}
                    </p>
                    {e.oldValue && <p style={{ color: "#ef4444" }}>{e.oldValue}</p>}
                    {e.newValue && <p style={{ color: "var(--text-secondary)" }}>{e.newValue}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      <Popup isOpen={savedPopup} variant="success" title="Meeting amended"
             description="Changes saved and recorded in the audit trail." onDismiss={() => setSavedPopup(false)} />
    </PageLayout>
  );
}
