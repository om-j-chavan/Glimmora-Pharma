"use client";

import { useState } from "react";
import Link from "next/link";
import { Save, Send, Wrench, ExternalLink, CheckCircle2 } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant } from "@/lib/badgeVariants";
import { CategorizedDocUploader, type DocUploadEntry } from "@/components/shared/CategorizedDocUploader";
import { TaskThread } from "./DeviationTaskPanel";
import {
  uploadFindingEvidence, removeFindingEvidence, saveFindingWorkNotes, submitFinding, postFindingMessage,
} from "@/actions/findings";
import {
  attachDeviationTaskDocument, removeDeviationTaskDocument, submitDeviationTask, postDeviationTaskMessage,
} from "@/actions/deviation-tasks";
import { updateActionItem } from "@/actions/capas";
import { addEvidenceFile, addEvidenceFileToCategory, removeEvidenceFile } from "@/actions/evidence";
import type { WorklistActionItem } from "@/lib/queries/worklist";
import type { WorkItem } from "./workItem";

type Result = { success: boolean; error?: string };

/**
 * ONE shared work modal for every worklist item (Finding / CAPA action /
 * Deviation task) — the Finding-style detail surface: title "Source · Reference",
 * a status chip + link to the source, a metadata block, a description, an EVIDENCE
 * section on the shared <DocumentCard> (View / Download / + Add Document), a WORK
 * NOTES textarea, and a footer with "Save notes" + "Submit to QA". The layout is
 * identical for all sources; only the server actions differ, switched on
 * `item.source`. No readiness bar, no conditions, no per-category dropdown.
 */
export function WorkItemModal({
  item,
  currentUserId,
  onClose,
  onChanged,
}: {
  item: WorkItem;
  currentUserId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { org } = useTenantConfig();
  const [notes, setNotes] = useState(item.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msgBody, setMsgBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canWork = item.canWork;
  // Deviation tasks have no standalone "save notes" server action — their notes
  // are carried on Submit. Findings + CAPA actions persist notes independently.
  const canSaveNotes = item.source !== "deviation";
  const fmtDateTime = (iso: string) => dayjs.utc(iso).tz(org.timezone).format(`${org.dateFormat} HH:mm`);

  // ── EVIDENCE upload — same categorized flow for all sources; the server action
  //    differs by source (finding docs / deviation task docs / CAPA action evidence). ──
  async function handleUploadDocs(entries: DocUploadEntry[]): Promise<Result> {
    let failed = 0;
    let lastErr = "";
    for (const { file, category } of entries) {
      let res: Result;
      if (item.source === "finding") {
        const fd = new FormData(); fd.set("file", file);
        res = await uploadFindingEvidence(item.id, fd, category, "work");
      } else if (item.source === "deviation") {
        const fd = new FormData(); fd.set("fileName", file.name); fd.set("file", file);
        res = await attachDeviationTaskDocument(item.id, fd, category);
      } else {
        // CAPA action — attach to the CHOSEN category's EvidenceItem, linked to
        // this action item. The 7 categories are seeded at CAPA creation, so the
        // id resolves; fall back to the find-or-create category action otherwise.
        const a = item.raw as WorklistActionItem;
        const evId = a.evidenceItems.find((e) => e.category === category)?.id;
        const fd = new FormData(); fd.set("file", file);
        res = evId ? await addEvidenceFile(evId, fd, a.id) : await addEvidenceFileToCategory(a.capaId, category, fd);
      }
      if (!res.success) { failed += 1; lastErr = res.error ?? "Upload failed."; }
    }
    onChanged();
    if (failed > 0) { toast.error(`${failed} document${failed === 1 ? "" : "s"} failed to upload.`); return { success: false, error: lastErr }; }
    toast.success(`${entries.length} document${entries.length === 1 ? "" : "s"} uploaded.`);
    return { success: true };
  }

  async function handleRemoveDoc(docId: string): Promise<Result> {
    let res: Result;
    if (item.source === "finding") res = await removeFindingEvidence(item.id, docId);
    else if (item.source === "deviation") res = await removeDeviationTaskDocument(item.id, docId);
    else res = await removeEvidenceFile(docId, { reason: "Removed from the worklist before submission." });
    if (!res.success) { toast.error(res.error || "Failed to remove document."); return { success: false, error: res.error }; }
    toast.success("Document removed."); onChanged();
    return { success: true };
  }

  async function saveNotes() {
    setSavingNotes(true); setErr(null);
    const res: Result = item.source === "finding"
      ? await saveFindingWorkNotes(item.id, { notes: notes.trim() })
      : await updateActionItem(item.id, { completionNotes: notes.trim() }); // capa
    setSavingNotes(false);
    if (!res.success) { setErr(res.error || "Failed to save notes."); toast.error(res.error || "Failed to save notes."); return; }
    toast.success("Notes saved."); onChanged();
  }

  async function submit() {
    if (notes.trim().length < 5) { setErr("Add work notes (at least 5 characters) before submitting."); return; }
    setSubmitting(true); setErr(null);
    let res: Result;
    if (item.source === "finding") res = await submitFinding(item.id, { completionNotes: notes.trim() });
    else if (item.source === "deviation") res = await submitDeviationTask(item.id, { completionNotes: notes.trim() });
    else res = await updateActionItem(item.id, { status: "complete", completionNotes: notes.trim() }); // capa → mark complete
    setSubmitting(false);
    if (!res.success) { setErr(res.error || "Submit failed."); toast.error(res.error || "Submit failed."); return; }
    toast.success("Submitted to QA for review."); onChanged(); onClose();
  }

  async function postMsg() {
    if (msgBody.trim().length === 0) return;
    // Phase 6 — the CAPA worklist thread is retired; this composer only renders
    // for finding + deviation now (the Conversation block below is gated off for
    // CAPA). The former CAPA branch called addCAPAComment with an actionItemId;
    // that server branch is left in place but is now write-dead from the client.
    if (item.source === "capa") return;
    setPosting(true);
    const res: Result = item.source === "finding"
      ? await postFindingMessage(item.id, { body: msgBody.trim() })
      : await postDeviationTaskMessage(item.id, { body: msgBody.trim() });
    setPosting(false);
    if (!res.success) { toast.error(res.error || "Failed to post message."); return; }
    setMsgBody(""); onChanged();
  }

  const anyBusy = savingNotes || submitting;

  return (
    <Modal
      open
      onClose={anyBusy ? () => undefined : onClose}
      title={`${item.sourceLabel} · ${item.reference}`}
      footer={canWork ? (
        <div className="flex justify-end gap-2">
          {canSaveNotes && (
            <Button variant="secondary" size="sm" icon={Save} disabled={anyBusy} loading={savingNotes} onClick={() => void saveNotes()}>Save notes</Button>
          )}
          <Button variant="primary" size="sm" icon={Send} disabled={anyBusy} loading={submitting} onClick={() => void submit()}>Submit to QA</Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-3">
        {/* Status + priority + link chip to the source / parent CAPA */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Status:</span>
          <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
          {item.priority && <Badge variant={getSeverityVariant(item.priority, "generic")}>{item.priority}</Badge>}
          {item.link && (
            <Link href={item.link.href} className="ml-auto inline-flex items-center gap-1 text-[11px] no-underline" style={{ color: "var(--brand)" }}>
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> {item.link.label}
            </Link>
          )}
        </div>

        {/* Context — title + metadata block */}
        <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-[11px]">
            {item.metaFields.map((f) => (
              <div key={f.label}>
                <span style={{ color: "var(--text-muted)" }}>{f.label}</span><br />
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{f.value}</span>
              </div>
            ))}
          </div>
          {item.description && item.description !== item.title && (
            <p className="text-[11px] mt-2 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{item.description}</p>
          )}
        </div>

        {/* Returned / rework callout */}
        {item.isRework && item.reworkReason && (
          <div className="rounded-lg border p-3 flex items-start gap-2.5" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
            <Wrench className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--danger)" }}>Returned by QA</p>
              <p className="text-[12px] mt-0.5 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{item.reworkReason}</p>
            </div>
          </div>
        )}

        {!canWork && item.statusLabel === "Submitted" && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted — awaiting QA review. You can still respond in the conversation below.</p>
        )}

        {/* CLOSE MESSAGE — when the source record is closed, show its Close Message
            (Deviation.closureNotes), mirroring the Deviation module's close-message pattern. */}
        {item.closureMessage && (
          <div className="rounded-lg border p-3 flex items-start gap-2.5" style={{ background: "var(--success-bg)", borderColor: "var(--success)" }}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--success)" }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--success)" }}>Closed by QA{item.closedDate ? ` · ${dayjs.utc(item.closedDate).tz(org.timezone).format(org.dateFormat)}` : ""}</p>
              <p className="text-[12px] mt-0.5 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{item.closureMessage}</p>
            </div>
          </div>
        )}

        {/* Phase 7 — CAPA CLOSED state. When the parent CAPA is closed, the
            worker's accepted task is done: a plain acknowledgement, read-only.
            Deliberately NOT QA's closing notes or anyone else's rework history —
            the worker only needs to know their part is complete. Distinct from
            the deviation Close Message above (that carries the QA close text). */}
        {item.source === "capa" && item.capaStatus === "closed" && (
          <div className="rounded-lg border p-3 flex items-start gap-2.5" style={{ background: "var(--success-bg)", borderColor: "var(--success)" }}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--success)" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>This work was accepted and the CAPA is closed. Nothing further needed.</p>
          </div>
        )}

        {/* MY UPLOADED DOCUMENTS — the worker's own docs on this item (editable:
            + Add Document, View/Download, delete-where-permitted). Shared uploader. */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>My uploaded documents</p>
          <CategorizedDocUploader
            docs={item.myDocs}
            readOnly={!canWork}
            emptyText="No evidence uploaded yet — use Add Document to attach one or more."
            onUpload={canWork ? handleUploadDocs : undefined}
            onRemove={canWork ? handleRemoveDoc : undefined}
          />
        </div>

        {/* RELATED DOCUMENTS — module-sourced docs pulled from the source record
            (e.g. the parent Deviation's documents). READ-ONLY: the origin
            boundary means these are View/Download only — no edit/delete here.
            Rendered on the SAME shared <DocumentCard> (via readOnly + no onUpload). */}
        {item.relatedDocs.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Related documents <span className="normal-case font-normal" style={{ color: "var(--text-muted)" }}>· from {item.sourceLabel} (read-only)</span></p>
            <CategorizedDocUploader docs={item.relatedDocs} readOnly emptyText="No related documents." />
          </div>
        )}

        {/* Work notes */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Work notes</p>
          {canWork ? (
            <>
              <textarea
                className="input text-[12px] w-full min-h-24"
                placeholder="Summarise the work done…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                disabled={anyBusy}
              />
              {!canSaveNotes && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Your notes are sent to QA when you submit.</p>}
            </>
          ) : (
            <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{item.notes.trim() || "—"}</p>
          )}
        </div>

        {/* Conversation — flat QA ↔ worker thread. Phase 6: retired for CAPA
            action items (the CAPA worklist thread is gone; concerns now live on
            the CAPA detail's Concerns section). Finding + Deviation keep it — it's
            their ONLY QA channel, and it writes to their own tables
            (FindingMessage / DeviationTaskMessage), untouched by this change. */}
        {item.source !== "capa" && (
          <div className="pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Conversation</p>
            <TaskThread messages={item.messages} currentUserId={currentUserId} fmt={fmtDateTime} />
            {item.statusLabel !== "Closed" && item.statusLabel !== "Done" && (
              <div className="flex items-end gap-2 mt-2">
                <textarea className="input text-[12px] w-full min-h-14" placeholder="Reply to QA…" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} maxLength={2000} disabled={posting} />
                <Button variant="secondary" size="sm" icon={Send} disabled={posting || msgBody.trim().length === 0} loading={posting} onClick={() => void postMsg()}>Send</Button>
              </div>
            )}
          </div>
        )}

        {err && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
      </div>
    </Modal>
  );
}
