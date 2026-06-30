"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, FileUp, Lock, MessageSquare, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { roleLabel } from "@/lib/labels/roles";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { updateActionItem } from "@/actions/capas";
import { addEvidenceFile, initializeEvidenceForCAPA } from "@/actions/evidence";
import { addCAPAComment } from "@/actions/capa-comments";
import { getActionItemTask, type TaskDetail } from "@/actions/worklist";

// Display-only labels (enum values unchanged).
const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  complete: "Completed",
  skipped: "Skipped",
  rework: "Rework",
};
const EVIDENCE_CATEGORY_LABEL: Record<string, string> = {
  BATCH_RECORDS: "Batch records",
  TRAINING_RECORDS: "Training records",
  EQUIPMENT_LOGS: "Equipment logs",
  ENVIRONMENTAL_DATA: "Environmental data",
  DEVIATION_HISTORY: "Deviation history",
  WITNESS_INTERVIEWS: "Witness interviews",
  SUPPLIER_DATA: "Supplier data",
};
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Phase 5 — the fixer's task view. Read-only context (parent CAPA, the action
 * description = QA's instruction, the approved RCA = the "why", rework reason)
 * plus EXACTLY the Phase-3 keyhole: status (in progress / complete+notes),
 * action-scoped file upload, action-scoped comment. No structural edits, no
 * approve/reject/verify/close. When the CAPA isn't open/in_progress the panel
 * is read-only with the lock explained.
 */
export function TaskPanel({
  actionItemId,
  currentUserId,
  isAuthor,
  isViewer,
  onClose,
  onChanged,
}: {
  actionItemId: string;
  currentUserId: string;
  isAuthor: boolean;
  isViewer: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  // Resolve the uploader's role for file provenance (consistent with Evidence).
  const { users, org } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getActionItemTask(actionItemId);
    if (!res.success) { setLoadError(res.error); return; }
    setDetail(res.data);
  }, [actionItemId]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => { await load(); onChanged(); };

  if (loadError) {
    return (
      <Modal open onClose={onClose} title="Task">
        <p role="alert" className="text-[12px]" style={{ color: "var(--danger)" }}>{loadError}</p>
      </Modal>
    );
  }
  if (!detail) {
    return (
      <Modal open onClose={onClose} title="Task">
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
      </Modal>
    );
  }

  const { action, capa, files, comments } = detail;
  const isOwner = action.ownerId === currentUserId;
  const isDriver = capa.ownerId === currentUserId;
  const editableStatus = capa.status === "open" || capa.status === "in_progress";
  const locked = !editableStatus;
  // Keyhole gates (mirror the server owner/driver paths):
  const canStatus = !isViewer && !locked && (isOwner || isAuthor);
  const canUpload = !isViewer && !locked && (isOwner || isAuthor);
  const canComment = !isViewer && !locked && (isOwner || isAuthor || isDriver);

  async function setStatus(target: "in_progress" | "complete") {
    setBusy(true); setErr(null);
    const input = target === "complete" ? { status: target, completionNotes: notes.trim() } : { status: target };
    const res = await updateActionItem(action.id, input);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Update failed"); toast.error(res.error || "Could not update task."); return; }
    setCompleting(false); setNotes("");
    toast.success(target === "complete" ? "Task marked complete." : "Task started.");
    await refresh();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    let evidenceItemId = detail!.defaultEvidenceItemId;
    if (!evidenceItemId) {
      const init = await initializeEvidenceForCAPA(capa.id);
      if (!init.success) { setBusy(false); setErr(init.error || "Could not prepare evidence storage"); return; }
      const re = await getActionItemTask(actionItemId);
      evidenceItemId = re.success ? re.data.defaultEvidenceItemId : null;
    }
    if (!evidenceItemId) { setBusy(false); setErr("No evidence category available."); return; }
    const fd = new FormData();
    fd.set("file", file);
    const res = await addEvidenceFile(evidenceItemId, fd, action.id);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.success) { setErr(res.error || "Upload failed"); toast.error(res.error || "Could not upload file."); return; }
    toast.success("Evidence uploaded.");
    await refresh();
  }

  async function postComment() {
    if (comment.trim().length < 5) { setErr("Add a brief comment (at least 5 characters)."); return; }
    setBusy(true); setErr(null);
    const res = await addCAPAComment(capa.id, { body: comment.trim(), actionItemId: action.id });
    setBusy(false);
    if (!res.success) { setErr(res.error || "Comment failed"); toast.error(res.error || "Could not post comment."); return; }
    setComment("");
    toast.success("Comment posted.");
    await refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Task · ${capa.reference ?? capa.id.slice(0, 8)}`}
      footer={canStatus ? (
        <div className="flex justify-end gap-2">
          {!completing ? (
            <>
              {action.status !== "in_progress" && action.status !== "complete" && (
                <Button variant="secondary" size="sm" icon={Clock} disabled={busy} onClick={() => void setStatus("in_progress")}>Mark in progress</Button>
              )}
              {action.status !== "complete" && (
                <Button variant="primary" size="sm" icon={CheckCircle2} disabled={busy} onClick={() => setCompleting(true)}>Mark complete</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setCompleting(false); setNotes(""); }}>Cancel</Button>
              {/* "Done is earned" — still requires completion notes ≥ 5 chars. */}
              <Button variant="primary" size="sm" disabled={busy || notes.trim().length < 5} loading={busy} onClick={() => void setStatus("complete")}>Confirm complete</Button>
            </>
          )}
        </div>
      ) : undefined}
    >
      {/* Task header (read-only context) */}
      <div className="mb-3">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {capa.reference ?? capa.id.slice(0, 8)} · {capa.title} · CAPA due {capa.dueDate ? dayjs.utc(capa.dueDate).format(dateFormat) : "—"}
        </p>
        <p className="text-[13px] font-medium mt-2" style={{ color: "var(--text-primary)" }}>{action.description}</p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Due {dayjs.utc(action.dueDate).format(dateFormat)} · <Badge variant={action.status === "rework" ? "red" : action.status === "complete" ? "green" : "amber"}>{TASK_STATUS_LABEL[action.status] ?? action.status}</Badge>
        </p>
        {action.status === "rework" && action.reworkReason && (
          <div className="alert mt-2 flex items-start gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger)" }}>
            <span className="text-[11px]" style={{ color: "var(--danger)" }}><strong>Returned for rework:</strong> {action.reworkReason}</span>
          </div>
        )}
        <p className="text-[12px] mt-2" style={{ color: "var(--text-secondary)" }}>
          <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: "var(--text-muted)" }}>Root cause (approved):</span>
          {capa.rca?.trim() ? capa.rca : <em>No RCA text recorded.</em>}
          {capa.rcaApproved === true && <Badge variant="green">QA approved</Badge>}
        </p>
      </div>

      {locked && (
        <div role="status" className="alert alert-info flex items-start gap-2 mb-3">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[11px]">
            This CAPA is <strong>{capa.status.replace(/_/g, " ")}</strong> — tasks are read-only until it returns to investigation.
          </p>
        </div>
      )}

      {/* EVIDENCE — upload proof + file provenance */}
      <Section title="Evidence" icon={FileUp}>
        {files.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No files yet.</p>
        ) : (
          <ul className="list-none p-0 m-0 space-y-1.5">
            {files.map((f) => {
              const uploaderUser = f.uploadedById ? users.find((x) => x.id === f.uploadedById) : undefined;
              const uploaderLabel = uploaderUser ? `${f.uploadedBy} (${roleLabel(uploaderUser.role)})` : f.uploadedBy;
              return (
                <li key={f.id} className="text-[11px]">
                  <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</p>
                  <p style={{ color: "var(--text-muted)" }}>
                    {EVIDENCE_CATEGORY_LABEL[f.category] ?? f.category} · {formatSize(f.fileSize)} · {uploaderLabel} · {dayjs.utc(f.createdAt).tz(timezone).format(dateFormat)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {canUpload && (
          <div className="mt-2">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} />
            <Button variant="secondary" size="xs" icon={FileUp} disabled={busy} onClick={() => fileRef.current?.click()}>Upload proof</Button>
          </div>
        )}
      </Section>

      {/* COMMENTS — the shared QA↔fixer thread (FIX 4) */}
      <Section title="Comments" icon={MessageSquare}>
        {comments.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No comments yet.</p>
        ) : (
          <ul className="list-none p-0 m-0 space-y-2 mb-2">
            {comments.map((c) => (
              <li key={c.id} className="text-[11px]">
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.authorName}</span>
                {c.authorRole && (
                  <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--card-border, var(--bg-border))" }}>
                    {roleLabel(c.authorRole)}
                  </span>
                )}
                <span style={{ color: "var(--text-muted)" }}> · {dayjs.utc(c.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                <p style={{ color: "var(--text-secondary)" }}>{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {canComment && (
          <div className="flex gap-2 items-end">
            <textarea className="input text-[12px] flex-1 min-h-10" placeholder="Add a comment (≥ 5 chars)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} />
            <Button variant="secondary" size="sm" disabled={busy || comment.trim().length < 5} onClick={() => void postComment()}>Post</Button>
          </div>
        )}
      </Section>

      {/* YOUR ACTION — worker decisions ONLY (no QA verdict actions). The
          buttons live in the sticky footer; "done is earned" gating intact. */}
      <Section title="Your action" icon={CheckCircle2}>
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          Status: <Badge variant={action.status === "rework" ? "red" : action.status === "complete" ? "green" : "amber"}>{TASK_STATUS_LABEL[action.status] ?? action.status}</Badge>
        </p>
        {canStatus && completing && (
          <div className="mt-2">
            <label htmlFor="task-complete-notes" className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Completion notes <span className="text-(--danger)">*</span></label>
            <textarea id="task-complete-notes" className="input text-[12px] w-full min-h-20" placeholder="What was done? (≥ 5 characters)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
        )}
        {canStatus ? (
          <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
            Use the buttons below to update status. Marking complete requires a completion note and attached proof.
          </p>
        ) : (
          <p className="text-[11px] italic mt-1" style={{ color: "var(--text-muted)" }}>You have read-only access to this task.</p>
        )}
      </Section>

      {/* AUDIT — read-only activity summary (no actions) */}
      <Section title="Audit" icon={History}>
        <ul className="list-none p-0 m-0 space-y-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          <li>Current status: <strong>{TASK_STATUS_LABEL[action.status] ?? action.status}</strong></li>
          {action.completionNotes && <li>Completion note on record: &ldquo;{action.completionNotes}&rdquo;</li>}
          {action.reworkReason && <li>Returned for rework: &ldquo;{action.reworkReason}&rdquo;</li>}
        </ul>
        <p className="text-[10px] mt-2 italic" style={{ color: "var(--text-muted)" }}>
          The full timestamped audit trail (who changed what, and when) is maintained in the CAPA module&rsquo;s Audit Trail and is not duplicated in this task view.
        </p>
      </Section>

      {err && <p role="alert" className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>{err}</p>}
    </Modal>
  );
}

/** Labelled, card-style section for the task modal (presentation only). */
function Section({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-lg p-3 mb-3" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
        {title}
      </p>
      {children}
    </section>
  );
}
