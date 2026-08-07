// CSV/CSA stage rework tasks — the reject → delegate → fix → review loop, shown
// inside a stage card. Mirrors the DeviationTask UX but scoped to a validation
// stage. Implements the five improvements: (1) AI auto-suggest tasks from the QA
// rejection reason, (2) optional — the section only appears when relevant, the
// Lead can still fix the stage directly, (3) finding-link per task, (4) the
// resubmit guard (mirrored in UI; enforced server-side), (5) progress display.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, UserPlus, Wrench, CheckCircle2, AlertCircle, Loader2, Send, Play, X } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { ValidationStage } from "@/types/csv-csa";
import { VALIDATION_STAGE_LABELS } from "@/types/csv-csa";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { suggestReworkTasks, type ReworkTaskSuggestion } from "@/lib/ai/reworkTasks";
import {
  assignStageReworkTask,
  startStageReworkTask,
  submitStageReworkTask,
  reviewStageReworkTask,
  cancelStageReworkTask,
} from "@/actions/stage-tasks";

// Client mirror of CSV_SYSTEM_WRITE_ROLES (the assign/review gate). The server
// re-checks; this only decides which affordances to render.
const MANAGE_ROLES = ["csv_val_lead", "qa_head", "customer_admin", "super_admin"];
const OPEN_STATUSES = ["pending", "in_progress", "submitted", "rework"];
const REWORKABLE_STAGE = ["in_progress", "draft", "rejected"];

type TaskStatus = "pending" | "in_progress" | "submitted" | "closed" | "rework" | "cancelled";

function statusBadge(s: TaskStatus) {
  const map: Record<string, { v: "gray" | "amber" | "purple" | "red" | "green"; label: string }> = {
    pending: { v: "gray", label: "Pending" },
    in_progress: { v: "amber", label: "In Progress" },
    submitted: { v: "purple", label: "Submitted" },
    rework: { v: "red", label: "Rework" },
    closed: { v: "green", label: "Done" },
    cancelled: { v: "gray", label: "Cancelled" },
  };
  const m = map[s] ?? map.pending;
  return <Badge variant={m.v}>{m.label}</Badge>;
}

export interface StageReworkTasksProps {
  stage: ValidationStage;
  users: UserConfig[];
  role: string;
  sessionUserId: string | null;
  isDark: boolean;
}

export function StageReworkTasks({ stage, users, role, sessionUserId, isDark }: StageReworkTasksProps) {
  const router = useRouter();
  const canManage = MANAGE_ROLES.includes(role);
  const tasks = (stage.reworkTasks ?? []).filter((t) => t.status !== "cancelled");
  const openTasks = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const closedCount = tasks.filter((t) => t.status === "closed").length;
  const stageReworkable = REWORKABLE_STAGE.includes(stage.status);
  // Show the section if there are tasks to act on, or the Lead can raise them on
  // a stage that QA returned. Otherwise stay hidden (improvement #2 — optional).
  const visible = tasks.length > 0 || (canManage && stageReworkable);
  const assigneeOptions = users.filter(
    (u) => u.status === "Active" && !["super_admin", "customer_admin", "viewer"].includes(u.role),
  );

  // Assign form
  const [showAssign, setShowAssign] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [message, setMessage] = useState("");
  const [findingRef, setFindingRef] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignErr, setAssignErr] = useState<string | null>(null);

  // AI suggestions
  const [suggestions, setSuggestions] = useState<ReworkTaskSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Worker submit + review modals
  const [submitTaskId, setSubmitTaskId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [reviewTask, setReviewTask] = useState<{ id: string; mode: "close" | "rework" } | null>(null);
  const [reworkReason, setReworkReason] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);

  if (!visible) return null;

  function runSuggest() {
    setSuggesting(true);
    // Deterministic + offline-safe — never throws. Wrapped in a tiny timeout so
    // the "thinking" state is visible like the other AI surfaces.
    const result = suggestReworkTasks({ rejectionReason: stage.rejectionReason });
    setSuggestions(result.length > 0 ? result : [{ message: "Address the QA rejection feedback and re-upload the corrected document." }]);
    setSuggesting(false);
  }

  function applySuggestion(s: ReworkTaskSuggestion) {
    setMessage(s.message);
    setFindingRef(s.findingRef ?? "");
    setShowAssign(true);
  }

  async function handleAssign() {
    if (!assigneeId || message.trim().length < 5) { setAssignErr("Pick an assignee and write an instruction (min 5 chars)."); return; }
    setAssignBusy(true); setAssignErr(null);
    const res = await assignStageReworkTask(stage.prismaId ?? "", {
      assigneeId, message: message.trim(),
      findingRef: findingRef.trim() || undefined,
      dueDate: dueDate || undefined,
    });
    setAssignBusy(false);
    if (!res.success) { setAssignErr(res.error); return; }
    setShowAssign(false); setAssigneeId(""); setMessage(""); setFindingRef(""); setDueDate("");
    router.refresh();
  }

  async function handleStart(taskId: string) {
    setRowBusy(taskId); setRowErr(null);
    const res = await startStageReworkTask(taskId);
    setRowBusy(null);
    if (!res.success) { setRowErr(res.error); return; }
    router.refresh();
  }

  async function handleSubmit() {
    if (!submitTaskId || completionNotes.trim().length < 5) return;
    setRowBusy(submitTaskId); setRowErr(null);
    const res = await submitStageReworkTask(submitTaskId, { completionNotes: completionNotes.trim() });
    setRowBusy(null);
    if (!res.success) { setRowErr(res.error); return; }
    setSubmitTaskId(null); setCompletionNotes("");
    router.refresh();
  }

  async function handleReview() {
    if (!reviewTask) return;
    if (reviewTask.mode === "rework" && reworkReason.trim().length < 5) return;
    setRowBusy(reviewTask.id); setRowErr(null);
    const res = await reviewStageReworkTask(reviewTask.id, {
      decision: reviewTask.mode,
      reworkReason: reviewTask.mode === "rework" ? reworkReason.trim() : undefined,
    });
    setRowBusy(null);
    if (!res.success) { setRowErr(res.error); return; }
    setReviewTask(null); setReworkReason("");
    router.refresh();
  }

  async function handleCancel(taskId: string) {
    setRowBusy(taskId); setRowErr(null);
    const res = await cancelStageReworkTask(taskId, "Cancelled by Validation Lead — no longer required");
    setRowBusy(null);
    if (!res.success) { setRowErr(res.error); return; }
    router.refresh();
  }

  const progressPct = tasks.length > 0 ? Math.round((closedCount / tasks.length) * 100) : 0;

  return (
    <div className="rounded-lg p-3 space-y-2.5" style={{ background: isDark ? "rgba(99,102,241,0.06)" : "#eef2ff", border: `1px solid ${isDark ? "rgba(99,102,241,0.22)" : "#c7d2fe"}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Wrench className="w-4 h-4" style={{ color: "#6366f1" }} aria-hidden="true" />
        <span className="text-[12px] font-semibold" style={{ color: "#6366f1" }}>Stage rework tasks</span>
        {tasks.length > 0 && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {closedCount}/{tasks.length} done</span>
        )}
        {canManage && stageReworkable && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={runSuggest} disabled={suggesting} className="flex items-center gap-1 text-[11px] font-medium border-none bg-transparent cursor-pointer p-0" style={{ color: "#6366f1" }}>
              {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              Suggest tasks (AI)
            </button>
            <button type="button" onClick={() => { setShowAssign((v) => !v); setAssignErr(null); }} className="flex items-center gap-1 text-[11px] font-medium border-none bg-transparent cursor-pointer p-0" style={{ color: "#6366f1" }}>
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> Assign task
            </button>
          </div>
        )}
      </div>

      {/* Progress (improvement #5) */}
      {tasks.length > 0 && (
        <div className="h-1.5 rounded-full" style={{ background: isDark ? "#1e293b" : "#e2e8f0" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: progressPct === 100 ? "#10b981" : "#6366f1" }} />
        </div>
      )}

      {/* AI suggestions (improvement #1) */}
      {suggestions && (
        <div className="rounded-md p-2 space-y-1.5" style={{ background: isDark ? "rgba(99,102,241,0.08)" : "#fff", border: `1px dashed ${isDark ? "rgba(99,102,241,0.3)" : "#c7d2fe"}` }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6366f1" }}>Suggested from QA rejection — click to assign</p>
          {suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => applySuggestion(s)} className="w-full text-left flex items-start gap-1.5 text-[11px] p-1 rounded border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)" style={{ color: "var(--text-secondary)" }}>
              <UserPlus className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#6366f1" }} aria-hidden="true" />
              <span className="flex-1">{s.message}{s.findingRef ? <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>↳ {s.findingRef}</span> : null}</span>
            </button>
          ))}
        </div>
      )}

      {/* Assign form */}
      {showAssign && canManage && (
        <div className="rounded-md p-2.5 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Assignee</label>
              {/* The empty entry is a real OPTION, not a placeholder prop, so the
                  user can still clear the choice back to "" exactly as the native
                  <select> allowed. */}
              <Dropdown
                value={assigneeId}
                onChange={setAssigneeId}
                options={[
                  { value: "", label: "Select worker…" },
                  ...assigneeOptions.map((u) => ({ value: u.id, label: u.name })),
                ]}
                size="sm"
                width="w-full"
              />
            </div>
            <div>
              <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Due date (optional)</label>
              <DatePicker id="rework-due-date" value={dueDate} onChange={setDueDate} />
            </div>
          </div>
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Instruction</label>
            <Textarea id="rework-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What needs to be fixed?" />
          </div>
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: "var(--text-muted)" }}>Linked finding / rubric (optional)</label>
            <Input id="rework-finding-ref" value={findingRef} onChange={(e) => setFindingRef(e.target.value)} placeholder="e.g. Approval signature block present" />
          </div>
          {assignErr && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{assignErr}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="xs" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button variant="primary" size="xs" icon={UserPlus} loading={assignBusy} disabled={assignBusy} onClick={handleAssign}>Assign</Button>
          </div>
        </div>
      )}

      {/* Task list */}
      {tasks.length > 0 && (
        <ul role="list" className="space-y-1.5 list-none p-0 m-0">
          {tasks.map((t) => {
            const isAssignee = sessionUserId !== null && t.assigneeId === sessionUserId;
            const isOpen = OPEN_STATUSES.includes(t.status);
            return (
              <li key={t.id} className="rounded-md p-2 text-[11px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p style={{ color: "var(--text-primary)" }}>{t.message}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {t.assignee}
                      {t.dueDate ? ` · due ${dayjs.utc(t.dueDate).format("DD MMM")}` : ""}
                      {t.findingRef ? ` · ${t.findingRef}` : ""}
                    </p>
                    {t.status === "rework" && t.reworkReason && (
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--danger)" }}>↩ Returned: {t.reworkReason}</p>
                    )}
                    {t.completionNotes && (t.status === "submitted" || t.status === "closed") && (
                      <p className="text-[10px] mt-0.5 italic" style={{ color: "var(--text-secondary)" }}>“{t.completionNotes}”</p>
                    )}
                  </div>
                  {statusBadge(t.status as TaskStatus)}
                </div>

                {/* Worker actions */}
                {isAssignee && (t.status === "pending" || t.status === "rework") && (
                  <div className="flex justify-end mt-1.5">
                    <Button variant="ghost" size="xs" icon={Play} loading={rowBusy === t.id} onClick={() => handleStart(t.id)}>Start</Button>
                  </div>
                )}
                {isAssignee && (t.status === "in_progress" || t.status === "pending" || t.status === "rework") && (
                  <div className="flex justify-end mt-1.5">
                    <Button variant="primary" size="xs" icon={Send} onClick={() => { setSubmitTaskId(t.id); setCompletionNotes(""); }}>Submit for review</Button>
                  </div>
                )}

                {/* Lead review actions (SoD: not the assignee) */}
                {canManage && t.status === "submitted" && !isAssignee && (
                  <div className="flex justify-end gap-2 mt-1.5">
                    <Button variant="ghost" size="xs" icon={AlertCircle} onClick={() => { setReviewTask({ id: t.id, mode: "rework" }); setReworkReason(""); }}>Send back</Button>
                    <Button variant="primary" size="xs" icon={CheckCircle2} loading={rowBusy === t.id} onClick={() => setReviewTask({ id: t.id, mode: "close" })}>Approve</Button>
                  </div>
                )}
                {canManage && t.status === "submitted" && isAssignee && (
                  <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#f59e0b" }}>
                    <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" /> You submitted this — a different reviewer must close it (SoD).
                  </p>
                )}
                {canManage && isOpen && t.status !== "submitted" && (
                  <div className="flex justify-end mt-1">
                    <button type="button" onClick={() => handleCancel(t.id)} disabled={rowBusy === t.id} className="text-[10px] border-none bg-transparent cursor-pointer p-0" style={{ color: "var(--text-muted)" }}>Cancel task</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rowErr && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{rowErr}</p>}

      {/* Resubmit guard hint (improvement #4) */}
      {openTasks.length > 0 && canManage && (
        <p className="text-[10px] flex items-center gap-1" style={{ color: "#f59e0b" }}>
          <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} — close all before resubmitting {VALIDATION_STAGE_LABELS[stage.key]} for QA.
        </p>
      )}

      {/* Submit modal */}
      <Modal open={!!submitTaskId} onClose={() => setSubmitTaskId(null)} title="Submit rework for review">
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Describe what you fixed (min 5 chars). The Validation Lead will review it.</p>
          <Textarea id="rework-completion-notes" rows={3} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="e.g. Updated Section 4.2 SOP reference to v2.0 and added the signature block." />
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Button variant="secondary" size="sm" onClick={() => setSubmitTaskId(null)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Send} disabled={completionNotes.trim().length < 5} onClick={handleSubmit}>Submit</Button>
          </div>
        </div>
      </Modal>

      {/* Review modal */}
      <Modal open={!!reviewTask} onClose={() => setReviewTask(null)} title={reviewTask?.mode === "close" ? "Approve rework task" : "Send task back for rework"}>
        <div className="space-y-3">
          {reviewTask?.mode === "close" ? (
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Confirm the rework is complete. The task will close and count toward stage progress.</p>
          ) : (
            <>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Tell the worker what still needs fixing (min 5 chars).</p>
              <Textarea id="rework-reason" rows={3} value={reworkReason} onChange={(e) => setReworkReason(e.target.value)} placeholder="What is still missing?" />
            </>
          )}
          <div className="flex justify-end gap-2 pt-2" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Button variant="secondary" size="sm" onClick={() => setReviewTask(null)}>Cancel</Button>
            <Button
              variant="primary" size="sm"
              icon={reviewTask?.mode === "close" ? CheckCircle2 : X}
              disabled={reviewTask?.mode === "rework" && reworkReason.trim().length < 5}
              onClick={handleReview}
            >
              {reviewTask?.mode === "close" ? "Approve & close" : "Send back"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
