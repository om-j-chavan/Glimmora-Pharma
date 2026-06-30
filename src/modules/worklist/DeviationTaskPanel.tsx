"use client";

import { useState } from "react";
import { Paperclip, Send, Clock, FileText, X } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { displayUserName } from "@/lib/identity-display";
import { roleLabel as fmtRole } from "@/lib/labels/roles";
import { DEVIATION_QA_ROLES } from "@/lib/permissions/roleSets";
import {
  startDeviationTask, submitDeviationTask, attachDeviationTaskDocument,
  postDeviationTaskMessage, removeDeviationTaskDocument,
} from "@/actions/deviation-tasks";
import type { WorklistDeviationTask, WorklistDoc } from "@/lib/queries/worklist";

const DEV_TASK_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", in_progress: "In Progress", submitted: "Submitted for Review", rework: "Needs Rework",
};
const roleLabel = (r?: string | null) => (r ? fmtRole(r) : "");

/**
 * Stage 4/5 (deviation redesign) — the ASSIGNEE's panel for a low-priority
 * DeviationTask. Single-person + simple (escalate to CAPA if it needs more).
 *   • context — the worker sees the deviation's problem + key fields, who
 *     assigned the task + when, and the deviation's docs READ-ONLY.
 *   • do — start, then SEND a response to QA via a confirm modal that holds the
 *     completion notes + the supporting-document upload (req 5).
 *   • talk — a FLAT append-only QA↔worker conversation (no threading); QA's
 *     rework feedback persists here across resubmits.
 */
export function DeviationTaskPanel({
  task,
  onClose,
  onChanged,
}: {
  task: WorklistDeviationTask;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { org, users, allSites } = useTenantConfig();
  const currentUser = useAppSelector((s) => s.auth.user);
  const [busy, setBusy] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false); // the "Send to QA" confirm modal
  const [notes, setNotes] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canWork = task.status === "pending" || task.status === "in_progress" || task.status === "rework";
  const fmtDate = (iso: string | null) => (iso ? dayjs.utc(iso).tz(org.timezone).format(org.dateFormat) : "—");
  const siteName = task.context.siteId
    ? allSites.find((s) => s.id === task.context.siteId)?.name ?? task.context.siteId
    : "—";
  const assignerName = task.assignerId ? displayUserName(task.assignerId, users) : "—";
  const assignerRole = users.find((u) => u.id === task.assignerId)?.role;

  async function start() {
    setBusy(true); setErr(null);
    const res = await startDeviationTask(task.id);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Could not start task."); toast.error(res.error || "Could not start task."); return; }
    toast.success("Task started."); onChanged();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("fileName", file.name);
    fd.set("file", file);
    const res = await attachDeviationTaskDocument(task.id, fd);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Upload failed."); toast.error(res.error || "Upload failed."); return; }
    toast.success("Document attached."); onChanged();
  }

  async function removeDoc(docId: string) {
    setBusy(true); setErr(null);
    const res = await removeDeviationTaskDocument(task.id, docId);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Failed to remove."); toast.error(res.error || "Failed to remove document."); return; }
    toast.success("Document removed."); onChanged();
  }

  async function submit() {
    setBusy(true); setErr(null);
    const res = await submitDeviationTask(task.id, { completionNotes: notes.trim() });
    setBusy(false);
    if (!res.success) { setErr(res.error || "Submit failed."); toast.error(res.error || "Submit failed."); return; }
    toast.success("Response sent to QA for review."); setSubmitOpen(false); onChanged(); onClose();
  }

  async function postMsg() {
    if (msgBody.trim().length === 0) return;
    setPosting(true);
    const res = await postDeviationTaskMessage(task.id, { body: msgBody.trim() });
    setPosting(false);
    if (!res.success) { toast.error(res.error || "Failed to post message."); return; }
    setMsgBody(""); onChanged();
  }

  return (
    <>
      <Modal
        open
        onClose={busy ? () => undefined : onClose}
        title={`Task · ${task.deviationReference ?? task.deviationId.slice(0, 8)}`}
        footer={canWork ? (
          <div className="flex justify-end gap-2">
            {(task.status === "pending" || task.status === "rework") && (
              <Button variant="secondary" size="sm" icon={Clock} disabled={busy} onClick={() => void start()}>Mark in progress</Button>
            )}
            <Button variant="primary" size="sm" icon={Send} disabled={busy} onClick={() => { setErr(null); setSubmitOpen(true); }}>Submit to QA</Button>
          </div>
        ) : undefined}
      >
        <div className="space-y-3">
          {/* Status */}
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Status: <Badge variant={task.status === "submitted" ? "purple" : task.status === "rework" ? "red" : "amber"}>{DEV_TASK_STATUS_LABEL[task.status] ?? task.status}</Badge></p>

          {/* Deviation context */}
          <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{task.deviationTitle}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{task.context.description}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-[11px]">
              <div><span style={{ color: "var(--text-muted)" }}>Severity</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{task.context.severity}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Priority</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{task.context.priority ?? "—"}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Area</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{task.context.area}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Site</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{siteName}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Detected by</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{task.context.detectedBy}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Detected</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(task.context.detectedDate)}</span></div>
            </div>
            {task.context.immediateAction && (
              <p className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--text-muted)" }}>Immediate action: </span>{task.context.immediateAction}</p>
            )}
          </div>

          {/* Who assigned + QA's instruction */}
          <div>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Assigned by <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{assignerName}{assignerRole ? ` · ${roleLabel(assignerRole)}` : ""}</span> on {fmtDate(task.assignedAt)}{task.dueDate ? ` · due ${fmtDate(task.dueDate)}` : ""}</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-primary)" }}>{task.message}</p>
          </div>

          {/* Rework "current ask" banner */}
          {task.status === "rework" && task.reworkReason && (
            <div className="p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>
              <p className="text-[11px]" style={{ color: "var(--danger)" }}><span className="font-semibold">Rework requested:</span> {task.reworkReason}</p>
            </div>
          )}

          {/* Deviation documents — READ-ONLY */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Deviation documents (read-only)</p>
            {task.deviationDocs.length === 0 ? (
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>None attached to the deviation.</p>
            ) : (
              <ul className="space-y-1">
                {task.deviationDocs.map((d) => <DocRow key={d.id} doc={d} />)}
              </ul>
            )}
          </div>

          {/* Worker's own task documents — read-only here; upload/remove live in
              the "Send to QA" modal (req 5). */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Your task documents</p>
            {task.taskDocs.length === 0 ? (
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No documents uploaded yet — add them when you send your response.</p>
            ) : (
              <ul className="space-y-1">
                {task.taskDocs.map((d) => <DocRow key={d.id} doc={d} />)}
              </ul>
            )}
          </div>

          {/* Conversation — flat QA↔worker thread */}
          <div className="pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Conversation</p>
            <TaskThread messages={task.messages} currentUserId={currentUser?.id} fmt={(iso) => dayjs.utc(iso).tz(org.timezone).format(`${org.dateFormat} HH:mm`)} />
            <div className="flex items-end gap-2 mt-2">
              <textarea className="input text-[12px] w-full min-h-14" placeholder="Reply to QA…" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} maxLength={2000} disabled={posting} />
              <Button variant="secondary" size="sm" icon={Send} disabled={posting || msgBody.trim().length === 0} loading={posting} onClick={() => void postMsg()}>Send</Button>
            </div>
          </div>

          {err && !submitOpen && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
        </div>
      </Modal>

      {/* Req 5 — "Send response to QA" confirm modal: completion notes + the
          supporting-document upload live HERE, not on the main panel. */}
      <Modal
        open={submitOpen}
        onClose={busy ? () => undefined : () => setSubmitOpen(false)}
        title="Send response to QA"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Send} disabled={busy || notes.trim().length < 5} loading={busy} onClick={() => void submit()}>Send Response to QA</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Send your completed work to QA for review. Summarise what you did and attach any supporting documents.</p>
          <div>
            <label htmlFor="dev-task-notes" className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Completion notes <span style={{ color: "var(--danger)" }}>*</span></label>
            <textarea id="dev-task-notes" className="input text-[12px] w-full min-h-24" placeholder="What was done? (≥ 5 characters)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} disabled={busy} />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Supporting documents (optional)</p>
            {task.taskDocs.length > 0 && (
              <ul className="space-y-1 mb-1.5">
                {task.taskDocs.map((d) => <DocRow key={d.id} doc={d} onRemove={() => void removeDoc(d.id)} removing={busy} />)}
              </ul>
            )}
            <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", opacity: busy ? 0.6 : 1 }}>
              <Paperclip className="w-3.5 h-3.5" /> Upload file
              <input type="file" className="hidden" disabled={busy} onChange={onPickFile} />
            </label>
          </div>
          {err && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
        </div>
      </Modal>
    </>
  );
}

/* ── Shared sub-components (also used by the QA-side panel) ── */

export function DocRow({ doc, onRemove, removing }: { doc: WorklistDoc; onRemove?: () => void; removing?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
      <a href={`/api/documents/${doc.id}`} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate underline" style={{ color: "var(--brand)" }}>{doc.fileName}</a>
      <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>{doc.uploadedBy}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={removing} aria-label={`Remove ${doc.fileName}`} className="border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--text-muted)" }}>
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export function TaskThread({
  messages,
  currentUserId,
  fmt,
}: {
  messages: WorklistDeviationTask["messages"];
  currentUserId?: string;
  fmt: (iso: string) => string;
}) {
  if (messages.length === 0) {
    return <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No messages yet.</p>;
  }
  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const isQA = DEVIATION_QA_ROLES.includes(m.authorRole);
        const isMine = !!currentUserId && m.authorId === currentUserId;
        return (
          <div key={m.id} className="rounded-lg p-2" style={{ background: isMine ? "var(--brand-muted)" : "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{m.authorName}</span>
              <Badge variant={isQA ? "purple" : "gray"}>{isQA ? "QA" : (roleLabel(m.authorRole) || "Worker")}</Badge>
              <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>{fmt(m.createdAt)}</span>
            </div>
            <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{m.body}</p>
          </div>
        );
      })}
    </div>
  );
}
