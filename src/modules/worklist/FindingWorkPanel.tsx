"use client";

import { useState } from "react";
import { Paperclip, Save, Send } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant } from "@/lib/badgeVariants";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABEL } from "@/lib/queries/evidence";
import { uploadFindingEvidence, removeFindingEvidence, saveFindingWorkNotes, submitFinding, postFindingMessage } from "@/actions/findings";
import { GroupedTaskDocs, TaskThread } from "./DeviationTaskPanel";
import type { WorklistFinding } from "@/lib/queries/worklist";

/** Status pill variant for the finding loop states. */
function statusVariant(s: string): "purple" | "red" | "amber" | "blue" {
  return s === "Submitted" ? "purple" : s === "Rework" ? "red" : s === "In Progress" ? "amber" : "blue";
}

/**
 * Gap Step 4 — the assignee's work surface for a gap finding: upload categorized
 * evidence (mandatory type, multiple files, removable before submit), record
 * completion notes, submit for QA review via a confirm modal, and converse with QA
 * in a flat thread. Clones the DeviationTaskPanel loop (mandatory category +
 * remove-before-submit + submit confirmation + read-only notes after submit +
 * TaskThread); QA's review/rework actions live on the gap-assessment register.
 */
export function FindingWorkPanel({
  finding,
  onClose,
  onChanged,
}: {
  finding: WorklistFinding;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { org } = useTenantConfig();
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const [notes, setNotes] = useState(finding.completionNotes ?? "");
  const [uploadCategory, setUploadCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false); // the "Submit to QA" confirm modal
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const [msgBody, setMsgBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fmtDate = (iso: string | null) => (iso ? dayjs.utc(iso).tz(org.timezone).format(org.dateFormat) : "—");
  const canWork = finding.status === "Open" || finding.status === "In Progress" || finding.status === "Rework";
  const isClosed = finding.status === "Closed";

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the SAME file (or another) can be picked again → multiple uploads
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadFindingEvidence(finding.id, fd, uploadCategory);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Upload failed."); toast.error(res.error || "Upload failed."); return; }
    toast.success("Document uploaded."); onChanged();
  }

  async function removeDoc(docId: string) {
    setBusy(true); setRemovingDocId(docId); setErr(null);
    const res = await removeFindingEvidence(finding.id, docId);
    setBusy(false); setRemovingDocId(null);
    if (!res.success) { setErr(res.error || "Failed to remove."); toast.error(res.error || "Failed to remove document."); return; }
    toast.success("Document removed."); onChanged();
  }

  async function saveNotes() {
    setSavingNotes(true); setErr(null);
    const res = await saveFindingWorkNotes(finding.id, { notes: notes.trim() });
    setSavingNotes(false);
    if (!res.success) { setErr(res.error || "Failed to save notes."); toast.error(res.error || "Failed to save notes."); return; }
    toast.success("Notes saved."); onChanged();
  }

  async function submit() {
    if (notes.trim().length < 5) { setErr("Add completion notes (at least 5 characters) before submitting."); return; }
    setSubmitting(true); setErr(null);
    const res = await submitFinding(finding.id, { completionNotes: notes.trim() });
    setSubmitting(false);
    if (!res.success) { setErr(res.error || "Submit failed."); toast.error(res.error || "Submit failed."); return; }
    toast.success("Submitted to QA for review."); setSubmitOpen(false); onChanged(); onClose();
  }

  async function postMsg() {
    if (msgBody.trim().length === 0) return;
    setPosting(true);
    const res = await postFindingMessage(finding.id, { body: msgBody.trim() });
    setPosting(false);
    if (!res.success) { toast.error(res.error || "Failed to post message."); return; }
    setMsgBody(""); onChanged();
  }

  const anyBusy = busy || savingNotes || submitting;

  return (
    <>
      <Modal
        open
        onClose={anyBusy ? () => undefined : onClose}
        title={`Finding · ${finding.reference ?? finding.id.slice(0, 8)}`}
        footer={canWork ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" icon={Save} disabled={anyBusy} loading={savingNotes} onClick={() => void saveNotes()}>Save notes</Button>
            <Button variant="primary" size="sm" icon={Send} disabled={anyBusy} onClick={() => { setErr(null); setSubmitOpen(true); }}>Submit to QA</Button>
          </div>
        ) : undefined}
      >
        <div className="space-y-3">
          {/* Status */}
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Status: <Badge variant={statusVariant(finding.status)}>{finding.status}</Badge></p>

          {/* Context */}
          <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
            <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{finding.requirement}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <Badge variant={getSeverityVariant(finding.severity, "generic")}>{finding.severity}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-[11px]">
              <div><span style={{ color: "var(--text-muted)" }}>Framework</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{finding.framework ?? "—"}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Area</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{finding.area}</span></div>
              <div><span style={{ color: "var(--text-muted)" }}>Target date</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(finding.targetDate)}</span></div>
            </div>
          </div>

          {/* Rework "current ask" banner */}
          {finding.status === "Rework" && finding.reworkReason && (
            <div className="p-2 rounded-lg" style={{ background: "var(--danger-bg)" }}>
              <p className="text-[11px]" style={{ color: "var(--danger)" }}><span className="font-semibold">Rework requested:</span> {finding.reworkReason}</p>
            </div>
          )}

          {finding.status === "Submitted" && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted — awaiting QA review. You can still respond in the conversation below.</p>
          )}

          {/* Evidence documents — grouped by GxP category. Mandatory type to upload,
              multiple files allowed, and each doc is removable until submitted. */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Evidence documents</p>
            <GroupedTaskDocs
              docs={finding.docs}
              emptyText="No evidence uploaded yet — pick a category and upload below."
              onRemove={canWork ? (id) => void removeDoc(id) : undefined}
              busyId={removingDocId}
            />
            {canWork && (
              <>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <Dropdown
                    placeholder="Select category…"
                    value={uploadCategory}
                    onChange={setUploadCategory}
                    width="w-48"
                    size="sm"
                    options={EVIDENCE_CATEGORIES.map((c) => ({ value: c, label: EVIDENCE_CATEGORY_LABEL[c] }))}
                    disabled={busy}
                  />
                  <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", opacity: (busy || !uploadCategory) ? 0.6 : 1 }}>
                    <Paperclip className="w-3.5 h-3.5" /> Upload file
                    <input type="file" className="hidden" disabled={busy || !uploadCategory} onChange={onPickFile} />
                  </label>
                </div>
                {!uploadCategory && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Pick a category to enable upload.</p>}
              </>
            )}
          </div>

          {/* Work / completion notes — editable while working; read-only once submitted. */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Work notes</p>
            {canWork ? (
              <textarea
                className="input text-[12px] w-full min-h-24"
                placeholder="Summarise the work done to close this gap…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                disabled={savingNotes || submitting}
              />
            ) : (
              <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{finding.completionNotes?.trim() || "—"}</p>
            )}
          </div>

          {/* Conversation — flat QA↔assignee thread */}
          <div className="pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Conversation</p>
            <TaskThread messages={finding.messages} currentUserId={currentUserId} fmt={(iso) => dayjs.utc(iso).tz(org.timezone).format(`${org.dateFormat} HH:mm`)} />
            {!isClosed && (
              <div className="flex items-end gap-2 mt-2">
                <textarea className="input text-[12px] w-full min-h-14" placeholder="Reply to QA…" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} maxLength={2000} disabled={posting} />
                <Button variant="secondary" size="sm" icon={Send} disabled={posting || msgBody.trim().length === 0} loading={posting} onClick={() => void postMsg()}>Send</Button>
              </div>
            )}
          </div>

          {err && !submitOpen && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
        </div>
      </Modal>

      {/* Req 7 — submit confirmation (mirrors the deviation "Send response to QA"
          confirm). Previews the completion notes; the worker enters/edits them on
          the panel, so this guards the final hand-off to QA. */}
      <Modal
        open={submitOpen}
        onClose={submitting ? () => undefined : () => setSubmitOpen(false)}
        title="Submit to QA for review"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={submitting} onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Send} disabled={submitting || notes.trim().length < 5} loading={submitting} onClick={() => void submit()}>Submit to QA</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Send your completed work to QA for review. They&apos;ll see your completion notes and any uploaded evidence. You can still reply in the conversation after submitting, but the notes become read-only.</p>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Completion notes</p>
            <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{notes.trim() || "—"}</p>
          </div>
          {notes.trim().length < 5 && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>Add completion notes (at least 5 characters) on the panel before submitting.</p>}
        </div>
      </Modal>
    </>
  );
}
