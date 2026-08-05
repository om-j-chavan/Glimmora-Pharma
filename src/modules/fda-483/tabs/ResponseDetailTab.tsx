"use client";

/**
 * ResponseDetailTab — three-step Response workspace.
 *
 * R2 spec items #17-22. Mirrors the Investigation tab's "Step card"
 * pattern (Locked / Ready / Done) for three sequential gates:
 *   Step 1 — Response draft
 *   Step 2 — Attached documents
 *   Step 3 — Sign & Submit
 *
 * Source-of-truth helpers:
 *   - `computeReadinessRows(liveEvent)` from ../_shared powers the Step 3
 *     unlock — when every row is `done`, the Sign & Submit button leaves
 *     the locked state. The same helper is used by the Overview tab so
 *     the two screens never diverge on what "ready" means.
 *   - `getEffectiveEventStatus` decides whether the event is in a
 *     terminal "Submitted / Closed" state and the entire tab flips into
 *     the read-only success view.
 *
 * The existing SignSubmitModal is untouched — the Part 11 ceremony stays
 * exactly where it lives (FDA483Page). This tab only opens it through
 * `onSignSubmit()`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import clsx from "clsx";
import {
  FileText,
  CheckCircle2,
  Bot,
  Pencil,
  Save,
  ShieldCheck,
  Lock,
  ArrowRight,
  Paperclip,
  AlertCircle,
  Download,
  Trash2,
} from "lucide-react";
import { downloadPDF, downloadLetterPDF, type Cell } from "@/lib/exportTable";
import dayjs from "@/lib/dayjs";
import { addResponseDocument, removeResponseDocument } from "@/actions/fda483";
import { DocumentUpload } from "@/components/shared";
import type { FDA483Event } from "@/types/fda483";
import { displayName } from "@/lib/identity-display";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { computeReadinessRows, getEffectiveEventStatus, isEventLocked, FDA483_AUDIT_MODULE } from "../_shared";
import type { DetailTab } from "../useEventDetailUrlState";

export interface ResponseDetailTabProps {
  /** Active event (already adapted from Prisma). */
  liveEvent: FDA483Event;
  /** Live CAPA slice — used in the submitted-success card to show
   *  linked CAPA closure progress. */
  capas: CAPA[];
  /** Current user's role string — gates Edit Draft / AGI Draft etc. */
  role: string;
  /** True iff the current user is allowed to sign (QA Head + not a
   *  customer admin masquerade). */
  canSign: boolean;
  /** True iff the prior readiness gates have all passed (so the Sign
   *  & Submit button is enabled rather than just visible). */
  canSubmit: boolean;
  /** Settings.agi.mode — gates whether AGI Draft button is rendered
   *  ("manual" hides it). */
  agiMode: string;
  /** Settings.agi.agents.fda483 — per-module toggle to hide the AGI
   *  Draft button even when global agi is on. */
  agiAgent: boolean;
  /** Tenant timezone (IANA) for submitted-at / due-date formatting. */
  timezone: string;
  /** Tenant date format token (dayjs). */
  dateFormat: string;
  /** Local response-draft text buffer. Owned by the parent today; can
   *  move into the tab in a later refactor. */
  responseText: string;
  /** True when the Edit Draft modal is open (drives the cancel-edit
   *  reset behaviour). */
  editingResponse: boolean;
  /** Setter for the response-draft buffer. */
  onResponseTextChange: (v: string) => void;
  /** Toggle the Edit Draft modal open/closed. */
  onEditResponseToggle: () => void;
  /** Cancel an in-progress edit — resets the buffer to the saved
   *  draft and closes the modal. */
  onCancelEdit: () => void;
  /** Persist the current responseText buffer as the response draft. */
  onSaveDraft: () => void;
  /** Persist liveEvent.agiDraft as the response draft (one click). */
  onUseAGIDraft: () => void;
  /** Generate (and persist) a new AGI draft from the current
   *  observations + CAPAs. Resolves to the generated draft text, or
   *  null if generation failed — the modal uses this to clear its
   *  loading spinner (the deterministic mock yields identical text on
   *  regeneration, so a value-diff can't detect completion). */
  onGenerateAGIDraft: () => Promise<string | null>;
  /** Open the SignSubmitModal at the page level. */
  onSignSubmit: () => void;
  /** Cross-tab nav from the readiness mini-section (spec #27). */
  onNavigate: (target: { tab: DetailTab; obsIndex?: number }) => void;
  /** Optional actions rendered at the LEFT of the export toolbar row (e.g. the
   *  Summarize affordance), so it sits on one line with the PDF buttons. */
  leadingActions?: React.ReactNode;
}

/* ── Tiny presentational helpers ─────────────────────────────────── */

type StepState = "locked" | "ready" | "done";

function stepBadge(state: StepState) {
  if (state === "locked") return <Badge variant="amber">Locked</Badge>;
  if (state === "ready") return <Badge variant="blue">Ready</Badge>;
  return <Badge variant="green">Complete</Badge>;
}

/** Card shell used by all three steps. Subtle border tint per state so
 *  the eye lands on the active card without us inventing new variants. */
function StepCard({
  state,
  title,
  badge,
  children,
}: {
  state: StepState;
  title: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        opacity: state === "locked" ? 0.85 : 1,
      }}
    >
      <div className="card-header">
        <div className="flex items-center gap-2">
          {state === "locked" ? (
            <Lock className="w-4 h-4 text-(--text-muted)" aria-hidden="true" />
          ) : state === "done" ? (
            <CheckCircle2
              className="w-4 h-4 text-[#10b981]"
              aria-hidden="true"
            />
          ) : (
            <FileText
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
          )}
          <span className="card-title">{title}</span>
        </div>
        <div className="ml-auto">{badge}</div>
      </div>
      <div className="card-body space-y-3">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */

export function ResponseDetailTab({
  liveEvent,
  capas,
  role,
  canSign,
  canSubmit,
  agiMode,
  agiAgent,
  timezone,
  dateFormat,
  responseText,
  onResponseTextChange,
  onCancelEdit,
  onSaveDraft,
  onGenerateAGIDraft,
  onSignSubmit,
  onNavigate,
  leadingActions,
}: ResponseDetailTabProps) {
  const router = useRouter();
  const toast = useToast();

  /* ── Local UI state ── */
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  // Attached-document id pending delete confirmation (null = no prompt open).
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState<string | null>(null);
  // Track whether the AI generation request has been kicked off this
  // open-cycle so we don't fire the server action twice if React
  // re-renders the tab while the modal is open.
  const [aiLoading, setAiLoading] = useState(false);
  // True when the read-only submitted-package preview modal is open.
  const [packagePreviewOpen, setPackagePreviewOpen] = useState(false);

  /* ── Derived state ── */

  const isSubmitted = isEventLocked(liveEvent.status);
  const effectiveStatus = getEffectiveEventStatus(
    liveEvent.status,
    liveEvent.responseDeadline,
  );
  const isTerminal = isEventLocked(effectiveStatus);

  // Linked CAPAs for the submitted-success card.
  const linkedCapas = liveEvent.observations
    .filter((o) => !!o.capaId)
    .map((o) => capas.find((c) => c.id === o.capaId))
    .filter((c): c is CAPA => !!c);

  // ── Step 1 (Response draft) gating ──
  // Investigation is "complete" when every observation has BOTH rootCause
  // AND a linked CAPA. The audit (Cat 6) calls out the exact phrasing
  // used in the locked-state body below.
  const totalObs = liveEvent.observations.length;
  const obsWithRca = liveEvent.observations.filter(
    (o) => !!o.rootCause?.trim(),
  ).length;
  const obsWithCapa = liveEvent.observations.filter((o) => !!o.capaId).length;
  const investigationComplete =
    totalObs > 0 && obsWithRca === totalObs && obsWithCapa === totalObs;

  const draftText = liveEvent.responseDraft?.trim() ?? "";
  const hasDraft = draftText.length > 0;

  const draftState: StepState = !investigationComplete
    ? "locked"
    : hasDraft
      ? "done"
      : "ready";

  // ── Step 2 (Attached documents) gating ──
  // Fix Rung 1, Bug 1: documents can be attached at any time before the
  // response is signed and submitted. The R2 spec gated docs on "draft
  // written first", but smoke testing showed that users routinely want
  // to attach reference materials BEFORE drafting (and the chain felt
  // broken when every step appeared locked). The only true lock is the
  // Part 11 record-lock after submission.
  const docCount = liveEvent.responseDocuments?.length ?? 0;
  const docsState: StepState = isTerminal
    ? "locked"
    : docCount >= 1
      ? "done"
      : "ready";

  // ── Step 3 (Sign & Submit) gating ──
  // Use the same readiness rows the Overview tab shows so this card and
  // the readiness banner can never disagree on "what's left".
  const { rows: readinessRows, doneCount: readinessDoneCount, total: readinessTotal } =
    computeReadinessRows(liveEvent);
  const readinessOutstanding = readinessTotal - readinessDoneCount;

  const submitState: StepState = isSubmitted
    ? "done"
    : readinessDoneCount === readinessTotal
      ? "ready"
      : "locked";

  async function openAiModal() {
    setAiModalOpen(true);
    // Always regenerate when the user clicks "AI Draft" — the observations +
    // CAPAs may have changed since the last cached draft.
    setAiLoading(true);
    // Await the generated draft and clear the spinner deterministically.
    // We can't infer completion from liveEvent.agiDraft changing, because the
    // mock returns byte-identical text on regeneration (no Date/random), so a
    // second generation would otherwise spin forever.
    const draft = await onGenerateAGIDraft();
    if (draft != null) {
      // Pre-fill the editable textarea (the shared response-draft buffer).
      onResponseTextChange(draft);
    }
    setAiLoading(false);
  }

  function closeAiModal() {
    setAiModalOpen(false);
    setAiLoading(false);
  }

  function cancelAiModal() {
    // Restore the page draft buffer (we pre-filled it with the AI draft).
    onResponseTextChange(liveEvent.responseDraft ?? "");
    closeAiModal();
  }

  function handleSaveApplyAiDraft() {
    // Commit the (possibly edited) textarea value via the existing save-draft
    // action — same commit path as the manual editor's Save Draft.
    onSaveDraft();
    closeAiModal();
  }

  /* ── AGI button visibility (mirrors the old ResponseTab gate) ── */
  // Capability mirror of the server (excludes super_admin from authoring).
  const fdaCan = usePermissions("fda483");
  const showAiButton = agiMode !== "manual" && agiAgent && role !== "viewer" && fdaCan.canEdit;
  const canEditDraft = role !== "viewer" && !isTerminal && fdaCan.canEdit;

  /* ════════════ Render ════════════ */

  function exportResponsePackage() {
    const headers = ["#", "Observation", "Severity", "Area", "Regulation", "Root cause", "CAPA"];
    const rows: Cell[][] = liveEvent.observations.map((o) => {
      const capa = o.capaId ? capas.find((c) => c.id === o.capaId) : undefined;
      return [
        o.number,
        o.text,
        o.severity,
        o.area || "—",
        o.regulation || "—",
        o.rootCause || "—",
        capa?.reference ?? (o.capaId ? o.capaId.slice(0, 8) : "—"),
      ];
    });
    downloadPDF(`response-package-${liveEvent.referenceNumber}`, headers, rows, {
      title: `FDA 483 ${liveEvent.referenceNumber} — Response Package`,
      subtitle: `${liveEvent.observations.length} observation${liveEvent.observations.length === 1 ? "" : "s"} · status: ${liveEvent.status}`,
    });
  }

  // The actual response LETTER (the drafted narrative) as a formal PDF the user
  // sends to the agency. Distinct from the observations "package" table above.
  function exportResponseLetter() {
    downloadLetterPDF(
      `response-letter-${liveEvent.referenceNumber}`,
      `${liveEvent.agency} ${liveEvent.referenceNumber} — Response Letter`,
      draftText,
      {
        reference: liveEvent.referenceNumber,
        agency: liveEvent.agency,
        date: dayjs().tz(timezone).format(dateFormat),
      },
    );
  }

  // Runs the actual removal once the user confirms the delete prompt.
  async function confirmDeleteDoc() {
    if (!pendingDeleteDocId) return;
    const result = await removeResponseDocument(pendingDeleteDocId, liveEvent.id);
    setPendingDeleteDocId(null);
    if (!result.success) {
      toast.error(
        `Could not complete action: ${result.error || "Failed to remove document. Please try again."}`,
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* ── One-row toolbar: Summarize (left) · PDF exports (right) ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">{leadingActions}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            icon={Download}
            onClick={exportResponseLetter}
            disabled={!draftText}
            title={draftText ? "Download the response letter as a PDF to send to the agency" : "Write or generate the response draft first"}
          >
            Download response letter (PDF)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={exportResponsePackage}
            disabled={liveEvent.observations.length === 0}
          >
            Export observations (PDF)
          </Button>
        </div>
      </div>

      {/* ── Submitted success card (only when terminal) ── */}
      {isSubmitted && (
        <div
          className="rounded-2xl p-5 border bg-(--success-bg) border-(--success)/30"
          role="status"
          aria-live="polite"
          style={{ borderColor: "rgba(16,185,129,0.3)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck
              className="w-5 h-5 text-[#10b981]"
              aria-hidden="true"
            />
            <span className="text-[14px] font-semibold text-[#10b981]">
              Response submitted
            </span>
            <Badge variant="green">Locked</Badge>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            <div>
              <p
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                Reference
              </p>
              <p
                className="font-mono mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {liveEvent.type} &middot; {liveEvent.referenceNumber}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                Submitted
              </p>
              <p
                className="mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {liveEvent.submittedAt
                  ? dayjs
                      .utc(liveEvent.submittedAt)
                      .tz(timezone)
                      .format(`${dateFormat} HH:mm`)
                  : "—"}
              </p>
            </div>
            {liveEvent.submittedBy && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  Signed by
                </p>
                <p
                  className="mt-0.5"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayName({ name: liveEvent.submittedBy })}
                </p>
              </div>
            )}
            {liveEvent.signatureMeaning && (
              <div>
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  Signature meaning
                </p>
                <p
                  className="mt-0.5 italic"
                  style={{ color: "var(--text-primary)" }}
                >
                  &ldquo;{liveEvent.signatureMeaning}&rdquo;
                </p>
              </div>
            )}
          </div>
          <p
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            This response has been signed and submitted under 21 CFR Part 11.
            The record is locked and cannot be modified.
          </p>

          {/* Linked CAPAs */}
          {linkedCapas.length > 0 && (
            <div
              className="mt-4 pt-3"
              style={{ borderTop: "1px solid rgba(16,185,129,0.25)" }}
            >
              <p
                className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Linked CAPAs (
                {linkedCapas.filter((c) => c.status === "closed").length} of{" "}
                {linkedCapas.length} closed)
              </p>
              <ul className="space-y-1.5 list-none p-0">
                {linkedCapas.map((c) => {
                  const isClosed = c.status === "closed";
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-mono font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {c.reference ?? c.id.slice(0, 8)}
                        </span>
                        <span
                          className="truncate"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {c.description.length > 60
                            ? `${c.description.slice(0, 60)}…`
                            : c.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            isClosed
                              ? "green"
                              : c.status === "pending_qa_review"
                                ? "purple"
                                : c.status === "in_progress"
                                  ? "amber"
                                  : "blue"
                          }
                        >
                          {CAPA_STATUS_LABEL[c.status]}
                        </Badge>
                        {isClosed && c.closedAt && (
                          <span style={{ color: "var(--text-muted)" }}>
                            {dayjs
                              .utc(c.closedAt)
                              .tz(timezone)
                              .format(dateFormat)}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ════════════ STEP 1 — Response draft ════════════ */}
      <StepCard
        state={draftState}
        title="Step 1 — Response draft"
        badge={stepBadge(draftState)}
      >
        {draftState === "locked" && (
          <>
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              {totalObs === 0
                ? "No observations yet. Add observations before drafting the response."
                : `${obsWithRca} of ${totalObs} observations have RCA. ${obsWithCapa} of ${totalObs} have a linked CAPA.`}
            </p>
            <button
              type="button"
              onClick={() => onNavigate({ tab: "investigation" })}
              className="bg-transparent border-none cursor-pointer p-0 text-[12px] inline-flex items-center gap-1 hover:underline"
              style={{ color: "var(--brand)" }}
            >
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              Go to Investigation
            </button>
            {/* Surface the saved draft (if any) inside the locked state so
             *  a user who drafted early — then later changed an observation,
             *  invalidating investigation-complete — can still see their
             *  work. Buttons stay disabled until investigation is complete. */}
            {hasDraft && (
              <div
                className="mt-2 p-3 rounded-lg border"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--bg-border)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Saved draft
                </p>
                <p
                  className="text-[12px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {draftText}
                </p>
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  ({draftText.length} chars total)
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                icon={Pencil}
                disabled
                aria-label="Edit draft (locked until investigation is complete)"
              >
                Edit draft
              </Button>
              {showAiButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Bot}
                  disabled
                  aria-label="Generate AI draft (locked until investigation is complete)"
                >
                  Generate AI draft
                </Button>
              )}
            </div>
          </>
        )}

        {draftState === "ready" && (
          <>
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              No draft yet. Use{" "}
              <span style={{ color: "var(--text-primary)" }}>Edit draft</span>{" "}
              to write one
              {showAiButton ? (
                <>
                  , or{" "}
                  <span style={{ color: "var(--text-primary)" }}>
                    Generate AI draft
                  </span>{" "}
                  to compose from your observations and CAPAs.
                </>
              ) : (
                "."
              )}
            </p>
            {canEditDraft && (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  onClick={() => {
                    onResponseTextChange(liveEvent.responseDraft ?? "");
                    setEditModalOpen(true);
                  }}
                >
                  Edit draft
                </Button>
                {showAiButton && (
                  <AIButton onClick={openAiModal}>AI Draft</AIButton>
                )}
              </div>
            )}
          </>
        )}

        {draftState === "done" && (
          <>
            {/* Full draft in a scrollable container — no ellipsis truncation,
             *  so the user can read the entire saved draft without opening
             *  Edit. Matches the AI-preview scroll pattern used below. */}
            <div
              className="text-[12px] leading-relaxed whitespace-pre-wrap rounded-lg p-3 border max-h-60 overflow-y-auto"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-surface)",
                borderColor: "var(--bg-border)",
              }}
            >
              {draftText}
            </div>
            <p
              className="text-[10px] mt-1"
              style={{ color: "var(--text-muted)" }}
            >
              ({draftText.length} chars total)
            </p>
            {canEditDraft && (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  onClick={() => {
                    onResponseTextChange(liveEvent.responseDraft ?? "");
                    setEditModalOpen(true);
                  }}
                >
                  Edit
                </Button>
                {showAiButton && (
                  <AIButton onClick={openAiModal}>AI Draft</AIButton>
                )}
              </div>
            )}
          </>
        )}
      </StepCard>

      {/* ════════════ STEP 2 — Attached documents ════════════ */}
      <StepCard
        state={docsState}
        title="Step 2 — Attached documents"
        badge={stepBadge(docsState)}
      >
        {docsState === "locked" && (
          <div className="flex items-start gap-2">
            <Paperclip
              className="w-4 h-4 mt-0.5 shrink-0 text-(--text-muted)"
              aria-hidden="true"
            />
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Record locked — response has been signed and submitted under
              21 CFR Part 11.
            </p>
          </div>
        )}

        {docsState !== "locked" && (
          <>
            <DocumentUpload
              recordId={liveEvent.id + "_response"}
              recordTitle="Response Package"
              module={FDA483_AUDIT_MODULE}
              existingDocs={liveEvent.responseDocuments ?? []}
              onUpload={async (doc) => {
                // Duplicate guard: reject a document already attached to THIS
                // response. A fresh upload has no stable document id at attach
                // time (the picker mints a throwaway client id), so match on
                // fileName + fileSize — the keys the response record persists.
                const alreadyAttached = (liveEvent.responseDocuments ?? []).some(
                  (d) => d.fileName === doc.fileName && d.fileSize === doc.fileSize,
                );
                if (alreadyAttached) {
                  toast.error("This document is already attached");
                  // Throw so DocumentUpload aborts its "Document attached" popup
                  // and no second copy is persisted.
                  throw new Error("This document is already attached");
                }
                // Server Actions throw — they don't return { success: false }
                // — for the framework body-size limit ("Body exceeded N MB
                // limit"), which fires BEFORE addResponseDocument runs. Wrap
                // the call so that, and any other rejection, surfaces a toast
                // instead of failing silently. Re-throw on failure so the
                // DocumentUpload primitive skips its "Document attached" popup.
                let result;
                try {
                  result = await addResponseDocument({
                    eventId: liveEvent.id,
                    fileName: doc.fileName,
                    fileUrl: doc.dataUrl ?? doc.fileName,
                    fileType: doc.fileType,
                    fileSize: doc.fileSize,
                    type: "response",
                  });
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : String(err);
                  if (
                    message.includes("Body exceeded") ||
                    message.includes("size limit")
                  ) {
                    toast.error(
                      "File is too large. Maximum size is 10 MB. Try compressing the file or splitting it.",
                    );
                  } else {
                    toast.error(`Could not attach document: ${message}`);
                  }
                  throw err;
                }
                if (!result.success) {
                  toast.error(
                    `Could not attach document: ${result.error || "Failed to attach document. Please try again."}`,
                  );
                  throw new Error(result.error || "Failed to attach document");
                }
                router.refresh();
              }}
              // Confirm before removing — the actual delete runs in
              // confirmDeleteDoc() on confirm; Cancel aborts.
              onDelete={(docId) => setPendingDeleteDocId(docId)}
              readOnly={isTerminal}
            />
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              All attached documents will be included in the response package
              when QA Head signs and submits.
            </p>
          </>
        )}
      </StepCard>

      {/* ════════════ STEP 3 — Sign & Submit ════════════ */}
      <StepCard
        state={submitState}
        title="Step 3 — Sign & Submit"
        badge={stepBadge(submitState)}
      >
        {submitState === "locked" && (
          <>
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Response is not ready. {readinessOutstanding} item
              {readinessOutstanding === 1 ? "" : "s"} still need completion.
            </p>
            {/* Mini list of outstanding rows, mirroring Overview readiness. */}
            <ul className="list-none p-0 space-y-1.5">
              {readinessRows
                .filter((r) => !r.done)
                .map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <AlertCircle
                      className="w-3.5 h-3.5 text-[#f59e0b] shrink-0"
                      aria-hidden="true"
                    />
                    <span>{r.label}</span>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              onClick={() => onNavigate({ tab: "overview" })}
              className="bg-transparent border-none cursor-pointer p-0 text-[12px] inline-flex items-center gap-1 hover:underline"
              style={{ color: "var(--brand)" }}
            >
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              View readiness on Overview
            </button>
            <div className="pt-1">
              <Button
                variant="primary"
                icon={ShieldCheck}
                disabled
                aria-label="Sign and submit to FDA (locked until readiness is complete)"
              >
                Sign &amp; Submit to FDA
              </Button>
            </div>
          </>
        )}

        {submitState === "ready" && (
          <>
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              All readiness checks complete. Ready to submit.
            </p>
            {canSign ? (
              <>
                <Button
                  variant="primary"
                  icon={ShieldCheck}
                  onClick={onSignSubmit}
                  disabled={!canSubmit}
                  aria-label="Sign and submit response"
                >
                  Sign &amp; Submit to FDA
                </Button>
                <p
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  GxP e-signature — identity, meaning and hash recorded.
                </p>
              </>
            ) : (
              <p
                className="text-[11px] italic"
                style={{ color: "var(--text-muted)" }}
              >
                Only QA Head can sign and submit the response.
              </p>
            )}
          </>
        )}

        {submitState === "done" && (
          <>
            <div
              className={clsx(
                "rounded-lg p-3 border",
                "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.3)]",
              )}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-[#10b981]"
                  aria-hidden="true"
                />
                <span className="text-[12px] font-semibold text-[#10b981]">
                  Response submitted
                </span>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-[11px]">
                {liveEvent.submittedAt && (
                  <div>
                    <dt
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Submitted at
                    </dt>
                    <dd
                      className="mt-0.5"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {dayjs
                        .utc(liveEvent.submittedAt)
                        .tz(timezone)
                        .format(`${dateFormat} HH:mm`)}
                    </dd>
                  </div>
                )}
                {liveEvent.submittedBy && (
                  <div>
                    <dt
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Submitted by
                    </dt>
                    <dd
                      className="mt-0.5"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {displayName({ name: liveEvent.submittedBy })}
                    </dd>
                  </div>
                )}
                {liveEvent.signatureMeaning && (
                  <div className="sm:col-span-2">
                    <dt
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Signature meaning
                    </dt>
                    <dd
                      className="mt-0.5 italic"
                      style={{ color: "var(--text-primary)" }}
                    >
                      &ldquo;{liveEvent.signatureMeaning}&rdquo;
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            <button
              type="button"
              onClick={() => setPackagePreviewOpen(true)}
              className="bg-transparent border-none cursor-pointer p-0 text-[12px] inline-flex items-center gap-1 hover:underline"
              style={{ color: "var(--brand)" }}
            >
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              Open signed package
            </button>
          </>
        )}
      </StepCard>

      {/* ════════════ Edit Draft Modal ════════════ */}
      <Modal
        open={editModalOpen}
        onClose={() => {
          onCancelEdit();
          setEditModalOpen(false);
        }}
        title="Response draft"
      >
        <div className="space-y-4">
          <div
            className="text-[12px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <p>
              <span style={{ color: "var(--text-muted)" }}>Reference:</span>{" "}
              <span
                className="font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {liveEvent.referenceNumber}
              </span>
            </p>
            <p className="mt-0.5">
              <span style={{ color: "var(--text-muted)" }}>Event:</span>{" "}
              {liveEvent.type} &middot; {liveEvent.agency}
            </p>
          </div>
          <textarea
            rows={14}
            className="input resize-none w-full text-[12px] font-mono"
            value={responseText}
            onChange={(e) => onResponseTextChange(e.target.value)}
            placeholder={
              "Write your formal response here.\nInclude:\n- Acknowledgement of observation\n- Root cause identified\n- Corrective actions taken\n- Preventive measures\n- Target completion dates"
            }
            aria-label="Response draft editor"
          />
          <p
            className="text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {responseText.length} characters
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onCancelEdit();
                setEditModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Save}
              onClick={() => {
                onSaveDraft();
                setEditModalOpen(false);
              }}
            >
              Save Draft
            </Button>
          </div>
        </div>
      </Modal>

      {/* ════════════ AI Draft Modal ════════════ */}
      <Modal
        open={aiModalOpen}
        onClose={cancelAiModal}
        title="AI Draft — FDA 483 Response"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={cancelAiModal}>
              Cancel
            </Button>
            {!aiLoading && (
              <AIButton onClick={handleSaveApplyAiDraft}>
                Save &amp; Apply
              </AIButton>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          {aiLoading ? (
            <div
              className="flex flex-col items-center justify-center py-10 gap-3"
              role="status"
              aria-live="polite"
            >
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: "var(--ai-accent)", borderTopColor: "transparent" }}
                aria-hidden="true"
              />
              <p
                className="text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Generating draft based on observations and CAPAs...
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Edit the draft below if needed. Click Save to apply.
              </p>
              <textarea
                rows={16}
                className="input resize-none w-full text-[12px] font-mono"
                style={{ padding: "10px 12px" }}
                value={responseText}
                onChange={(e) => onResponseTextChange(e.target.value)}
                aria-label="AI-generated response draft (editable)"
              />
              {/* Non-dismissable AI warning (21 CFR Part 11). */}
              <div
                className="flex items-start gap-2 p-3 rounded-lg border"
                style={{
                  background: "var(--warning-bg)",
                  borderColor: "var(--warning)",
                  color: "var(--warning)",
                }}
                role="note"
              >
                <AlertCircle
                  className="w-4 h-4 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-[11px]">
                  AI-generated draft. Review carefully before using. Citations
                  to observations and CAPAs are based on your event data. Tone,
                  accuracy, and final language are your responsibility under
                  21 CFR Part 11.
                </p>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ════════════ Signed package preview ════════════ */}
      <Modal
        open={packagePreviewOpen}
        onClose={() => setPackagePreviewOpen(false)}
        title="Signed response package"
      >
        <div className="space-y-3">
          <div
            className="text-[12px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <p>
              <span style={{ color: "var(--text-muted)" }}>Reference:</span>{" "}
              <span
                className="font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {liveEvent.referenceNumber}
              </span>
            </p>
            {liveEvent.submittedAt && (
              <p className="mt-0.5">
                <span style={{ color: "var(--text-muted)" }}>Submitted:</span>{" "}
                {dayjs
                  .utc(liveEvent.submittedAt)
                  .tz(timezone)
                  .format(`${dateFormat} HH:mm`)}
              </p>
            )}
          </div>
          <div
            className="rounded-lg p-3 border border-(--bg-border) bg-(--bg-elevated) max-h-[420px] overflow-y-auto"
          >
            <p
              className="text-[12px] leading-relaxed whitespace-pre-wrap font-mono"
              style={{ color: "var(--text-primary)" }}
            >
              {draftText || "(No draft body recorded.)"}
            </p>
          </div>
          {(liveEvent.responseDocuments?.length ?? 0) > 0 && (
            <div>
              <p
                className="text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Attached documents ({liveEvent.responseDocuments?.length ?? 0})
              </p>
              <ul className="list-none p-0 space-y-1">
                {(liveEvent.responseDocuments ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <FileText
                      className="w-3.5 h-3.5 text-(--text-muted) shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{d.fileName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPackagePreviewOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm before removing an attached document (destructive). */}
      <ConfirmModal
        open={!!pendingDeleteDocId}
        onClose={() => setPendingDeleteDocId(null)}
        onConfirm={confirmDeleteDoc}
        title="Remove attached document?"
        message={
          pendingDeleteDocId
            ? `“${
                (liveEvent.responseDocuments ?? []).find(
                  (d) => d.id === pendingDeleteDocId,
                )?.fileName ?? "This document"
              }” will be removed from the response package.`
            : undefined
        }
        confirmLabel="Remove"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}
