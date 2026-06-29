"use client";

import { useState } from "react";
import { Paperclip, Send, Clock, CheckCircle2 } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { startDeviationTask, submitDeviationTask, attachDeviationTaskDocument } from "@/actions/deviation-tasks";
import type { WorklistDeviationTask } from "@/lib/queries/worklist";

const DEV_TASK_STATUS_LABEL: Record<string, string> = {
  pending: "Pending", in_progress: "In Progress", submitted: "Submitted for Review", rework: "Needs Rework",
};

/**
 * Stage 4 (deviation redesign) — the ASSIGNEE's panel for a low-priority
 * DeviationTask. Mirrors TaskPanel's start → do → submit shape (REUSABLES.md):
 *   • start  — pending|rework → in_progress
 *   • attach — evidence upload; the assignee may upload even as a NON-author
 *     (attachDeviationTaskDocument relaxes the document author gate via
 *     isAssignedToTask), mirroring DeviationPage's file-input attach pattern.
 *   • submit — completionNotes → submitted.
 * The QA review (rework / Part 11 signed close) happens on the deviation, not
 * here — closure is never auto.
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
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const canWork = task.status === "pending" || task.status === "in_progress" || task.status === "rework";

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
    toast.success("Evidence attached."); onChanged();
  }

  async function submit() {
    setBusy(true); setErr(null);
    const res = await submitDeviationTask(task.id, { completionNotes: notes.trim() });
    setBusy(false);
    if (!res.success) { setErr(res.error || "Submit failed."); toast.error(res.error || "Submit failed."); return; }
    toast.success("Task submitted for QA review."); onChanged(); onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Task · ${task.deviationReference ?? task.deviationId.slice(0, 8)}`}
      footer={canWork ? (
        <div className="flex justify-end gap-2">
          {!submitting ? (
            <>
              {(task.status === "pending" || task.status === "rework") && (
                <Button variant="secondary" size="sm" icon={Clock} disabled={busy} onClick={() => void start()}>Mark in progress</Button>
              )}
              <Button variant="primary" size="sm" icon={Send} disabled={busy} onClick={() => setSubmitting(true)}>Submit for review</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setSubmitting(false); setNotes(""); }}>Cancel</Button>
              <Button variant="primary" size="sm" icon={CheckCircle2} disabled={busy || notes.trim().length < 5} loading={busy} onClick={() => void submit()}>Confirm submit</Button>
            </>
          )}
        </div>
      ) : undefined}
    >
      <div className="space-y-3">
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Status: <Badge variant={task.status === "submitted" ? "purple" : task.status === "rework" ? "red" : "amber"}>{DEV_TASK_STATUS_LABEL[task.status] ?? task.status}</Badge></p>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{task.deviationTitle}</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{task.message}</p>
          {task.dueDate && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Due {dayjs.utc(task.dueDate).format("DD MMM YYYY")}</p>}
        </div>
        {task.status === "rework" && task.reworkReason && (
          <div className="p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>
            <p className="text-[11px]" style={{ color: "var(--danger)" }}><span className="font-semibold">Rework requested:</span> {task.reworkReason}</p>
          </div>
        )}
        {canWork && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Attach evidence (optional)</label>
            <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", opacity: busy ? 0.6 : 1 }}>
              <Paperclip className="w-3.5 h-3.5" /> Upload file
              <input type="file" className="hidden" disabled={busy} onChange={onPickFile} />
            </label>
          </div>
        )}
        {canWork && submitting && (
          <div>
            <label htmlFor="dev-task-notes" className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Completion notes <span style={{ color: "var(--danger)" }}>*</span></label>
            <textarea id="dev-task-notes" className="input text-[12px] w-full min-h-20" placeholder="What was done? (≥ 5 characters)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </div>
        )}
        {err && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
      </div>
    </Modal>
  );
}
