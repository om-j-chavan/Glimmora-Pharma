"use client";

/**
 * Ticket attachments — view, add and remove documents on a support ticket.
 *
 * COMPOSES existing pieces; it owns no upload, storage or permission logic:
 *   • <DocumentUpload>       — the shared server-fileStorage picker (drag & drop,
 *                              type/size validation, per-file remove) that the
 *                              Raise Ticket modal already uses.
 *   • uploadDocuments()      — the same persist helper, so ticket attachments
 *                              take the identical createDocument → fileStorage →
 *                              /api/documents/[id] path in both surfaces.
 *   • <DocumentCard>         — the shared stored-document tile (View/Download
 *                              against the authenticated, tenant-scoped route).
 *   • deleteDocument()       — the shared soft-delete action (Part 11 retention).
 *   • usePermissions("evidence") — the CLIENT MIRROR of those two server gates,
 *                              so no forbidden control is ever rendered.
 *
 * Permission model is inherited, not invented:
 *   add    → createDocument's author gate (COMPLIANCE_AUTHOR_ROLES; excludes
 *            viewer, customer_admin and super_admin) = canCreate
 *   remove → deleteDocument's gate (qa_head + ADMIN_DELETE_ROLES, super_admin
 *            walled off by requireGxPAuthor) = canDelete
 * Both are additionally scoped to the ticket: a viewer of the ticket who is
 * neither its requester nor a handler gets a read-only list, and a terminal
 * ticket (Closed / Cancelled) is read-only for everyone.
 *
 * Ordering note: uploads here are immediate — the ticket already exists, so
 * `linkedRecordId` is available (unlike the create flow, which must create the
 * ticket first). Each successful batch calls router.refresh() so the server
 * re-reads getTicketAttachments and the list reflects what is actually stored.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import dayjs from "@/lib/dayjs";
import { DocumentUpload, uploadDocuments } from "@/components/documents/DocumentUpload";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { deleteDocument } from "@/actions/documents";
import type { TicketAttachment } from "@/lib/queries";

/** linkedModule value every ticket attachment is stored under. Must match the
 *  string getTicketAttachments filters on and RaiseTicketModal uploads with. */
const SUPPORT_MODULE = "Support";

export interface TicketAttachmentsPanelProps {
  ticketId: string;
  attachments: TicketAttachment[];
  /** False once the ticket is Closed / Cancelled — the record goes read-only. */
  editable: boolean;
  /** The viewer is the requester or a handler on this ticket. A bystander with
   *  view rights (e.g. a CA browsing their tenant's queue) reads only. */
  involved: boolean;
}

export function TicketAttachmentsPanel({ ticketId, attachments, editable, involved }: TicketAttachmentsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const { org } = useTenantConfig();
  // Mirrors createDocument (canCreate) and deleteDocument (canDelete) exactly.
  const docPerms = usePermissions("evidence");

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TicketAttachment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canAdd = editable && involved && docPerms.canCreate;
  const canRemove = editable && docPerms.canDelete;

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const { uploaded, failed, firstError } = await uploadDocuments(
      files,
      { module: SUPPORT_MODULE, recordId: ticketId },
      (done, total) => setProgress({ done, total }),
    );
    setUploading(false);
    setProgress(null);
    if (uploaded > 0) {
      // Drop only what landed: anything that failed stays staged so the user can
      // retry it without re-picking. Since uploadDocuments processes in order,
      // the successes are not necessarily the first N — but a partial failure is
      // rare and re-uploading a duplicate is harmless, so clearing on full
      // success and keeping everything on partial failure is the safer trade.
      if (failed === 0) setFiles([]);
      toast.success(`${uploaded} document${uploaded === 1 ? "" : "s"} attached.`);
      router.refresh();
    }
    if (failed > 0) {
      toast.error(firstError ?? `${failed} attachment${failed === 1 ? "" : "s"} failed to upload.`);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setDeletingId(target.id);
    const res = await deleteDocument(target.id, `Removed from support ticket ${ticketId}`);
    setDeletingId(null);
    if (!res.success) {
      toast.error(res.error ?? "Could not remove the document.");
      return;
    }
    toast.success("Document removed.");
    router.refresh();
  }

  return (
    <>
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Paperclip className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-wider m-0" style={{ color: "var(--text-muted)" }}>
            Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
          </p>
        </div>

        {/* Stored attachments — or a real empty state. The old block rendered
            nothing at all when empty, which reads as "this ticket has no
            attachments feature" rather than "no attachments yet". */}
        {attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center border-(--bg-border)">
            <p className="text-[12px] m-0" style={{ color: "var(--text-muted)" }}>
              No documents attached yet.
              {canAdd ? " Add screenshots, logs or exports that help support reproduce the issue." : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((a) => (
              <DocumentCard
                key={a.id}
                doc={a}
                meta={`${a.uploadedBy} · ${dayjs.utc(a.createdAt).tz(org.timezone).format(org.dateFormat)}`}
                onRemove={canRemove ? () => setPendingDelete(a) : undefined}
                removing={deletingId === a.id}
              />
            ))}
          </div>
        )}

        {/* Add more — same picker as the Raise Ticket modal. */}
        {canAdd && (
          <div className="mt-3">
            <DocumentUpload
              files={files}
              onChange={setFiles}
              disabled={uploading}
              onReject={(m) => toast.error(m)}
            />
            {files.length > 0 && (
              <div className="flex items-center justify-end gap-3 mt-2">
                {uploading && progress && (
                  <span role="status" aria-live="polite" className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Uploading {progress.done} of {progress.total}…
                  </span>
                )}
                <Button variant="primary" size="sm" icon={Upload} loading={uploading} disabled={uploading} onClick={handleUpload}>
                  {`Upload ${files.length} file${files.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Why the add control is absent — silence would read as a missing
            feature. Only shown to someone who could otherwise expect it. */}
        {editable && involved && !docPerms.canCreate && (
          <p className="text-[10px] mt-2 m-0" style={{ color: "var(--text-muted)" }}>
            Your role can view and download attachments, but not add them.
          </p>
        )}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Remove this attachment?"
        message={`"${pendingDelete?.originalFileName ?? pendingDelete?.fileName ?? ""}" will be removed from this ticket. The record is retained for audit, but it will no longer be visible here.`}
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        icon={Trash2}
      />
    </>
  );
}
