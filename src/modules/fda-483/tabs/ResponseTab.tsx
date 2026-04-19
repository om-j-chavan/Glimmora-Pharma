<<<<<<< HEAD
import { useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import clsx from "clsx";
import {
  FileText,
  TrendingUp,
  CheckCircle2,
  Bot,
  Sparkles,
  Pencil,
  Save,
  ShieldCheck,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { addResponseDocument, removeResponseDocument } from "@/store/fda483.slice";
import { DocumentUpload } from "@/components/shared";
import type {
  FDA483Event,
  EventStatus,
} from "@/store/fda483.slice";
import type { CAPA } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

/* ── Helpers ── */

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
}

export interface ResponseTabProps {
  liveEvent: FDA483Event | null;
  capas: CAPA[];
  isDark: boolean;
  role: string;
  canSign: boolean;
  agiMode: string;
  agiAgent: boolean;
  timezone: string;
  dateFormat: string;
  responseText: string;
  editingResponse: boolean;
  canSubmit: boolean;
  ownerName: (id: string) => string;
  onGoToEvents: () => void;
  onResponseTextChange: (v: string) => void;
  onEditResponseToggle: () => void;
  onCancelEdit: () => void;
  onSaveDraft: () => void;
  onUseAGIDraft: () => void;
  onGenerateAGIDraft: () => void;
  onSignSubmit: () => void;
}

export function ResponseTab({
  liveEvent,
  capas,
  isDark,
  role,
  canSign,
  agiMode,
  agiAgent,
  timezone,
  dateFormat,
  responseText,
  canSubmit,
  ownerName,
  onGoToEvents,
  onResponseTextChange,
  onCancelEdit,
  onSaveDraft,
  onUseAGIDraft,
  onGenerateAGIDraft,
  onSignSubmit,
}: ResponseTabProps) {
  const dispatch = useAppDispatch();
  // Local UI state for modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [agiModalOpen, setAgiModalOpen] = useState(false);
  const [agiLoading, setAgiLoading] = useState(false);
  if (!liveEvent) {
    return (
      <div className="card p-8 text-center">
        <FileText
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: "#334155" }}
          aria-hidden="true"
        />
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Select an event from the Events tab
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onGoToEvents}
        >
          Go to Events
        </Button>
      </div>
    );
  }

  const isSubmitted =
    liveEvent.status === "Response Submitted" || liveEvent.status === "Closed";

  // Live CAPA lookup — always reads from the current Redux capa.items via the capas prop
  const linkedCapas = liveEvent.observations
    .filter((o) => !!o.capaId)
    .map((o) => capas.find((c) => c.id === o.capaId))
    .filter((c): c is CAPA => !!c);
  const totalObs = liveEvent.observations.length;
  const capasRaised = totalObs > 0 && liveEvent.observations.every((o) => !!o.capaId);
  const allCapasClosed = capasRaised && linkedCapas.length > 0
    && linkedCapas.every((c) => c.status === "Closed");

  const obsWithCapa = liveEvent.observations.filter((o) => (o.capaIds?.length ?? 0) > 0 || !!o.capaId).length;
  const hasResponseDocs = (liveEvent.responseDocuments?.length ?? 0) > 0;

  const checks = [
    {
      label: "All observations have RCA",
      done: liveEvent.observations.length > 0 && liveEvent.observations.every((o) => o.rootCause?.trim()),
    },
    {
      label: allCapasClosed
        ? "All CAPAs raised and closed"
        : capasRaised
          ? `CAPAs raised (${obsWithCapa}/${totalObs}) \u2014 pending closure`
          : `All observations have CAPA (${obsWithCapa}/${totalObs})`,
      done: allCapasClosed,
    },
    {
      label: `Response documents attached (${liveEvent.responseDocuments?.length ?? 0})`,
      done: hasResponseDocs,
    },
    {
      label: "Response draft written",
      done: (liveEvent.responseDraft?.trim().length ?? 0) > 0,
    },
    {
      label: "All commitments have due dates",
      done: liveEvent.commitments.length > 0 && liveEvent.commitments.every((c) => c.dueDate),
    },
    {
      label: "Response within deadline",
      done: daysLeft(liveEvent.responseDeadline) >= 0,
    },
    {
      label: "Signed and submitted",
      done: isSubmitted,
    },
  ];
  const score = Math.round(
    (checks.filter((c) => c.done).length / checks.length) * 100,
  );

  return (
    <>
      {/* Submitted success card — replaces guidance banner when locked */}
      {isSubmitted && (
        <div
          className={clsx(
            "rounded-xl p-5 mb-4 border",
            isDark ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.3)]" : "bg-[#f0fdf4] border-[#a7f3d0]",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-[#10b981]" aria-hidden="true" />
            <span className="text-[14px] font-semibold text-[#10b981]">Response submitted</span>
            <Badge variant="green">Locked</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Reference</p>
              <p className="font-mono mt-0.5" style={{ color: "var(--text-primary)" }}>{liveEvent.type} &middot; {liveEvent.referenceNumber}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Submitted</p>
              <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
                {liveEvent.submittedAt ? dayjs.utc(liveEvent.submittedAt).tz(timezone).format(`${dateFormat} HH:mm`) : "\u2014"}
              </p>
            </div>
            {liveEvent.submittedBy && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Signed by</p>
                <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>{ownerName(liveEvent.submittedBy)}</p>
              </div>
            )}
            {liveEvent.signatureMeaning && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Signature meaning</p>
                <p className="mt-0.5 italic" style={{ color: "var(--text-primary)" }}>&ldquo;{liveEvent.signatureMeaning}&rdquo;</p>
              </div>
            )}
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            This response has been signed and submitted under 21 CFR Part 11. The record is locked and cannot be modified.
          </p>

          {/* Linked CAPAs — live status from capa.slice */}
          {linkedCapas.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(16,185,129,0.25)" }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                Linked CAPAs ({linkedCapas.filter((c) => c.status === "Closed").length} of {linkedCapas.length} closed)
              </p>
              <ul className="space-y-1.5 list-none p-0">
                {linkedCapas.map((c) => {
                  const isClosed = c.status === "Closed";
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold" style={{ color: "var(--brand)" }}>{c.id}</span>
                        <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                          {c.description.length > 60 ? `${c.description.slice(0, 60)}\u2026` : c.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={isClosed ? "green" : c.status === "Pending QA Review" ? "purple" : c.status === "In Progress" ? "amber" : "blue"}>
                          {c.status}
                        </Badge>
                        {isClosed && c.closedAt && (
                          <span style={{ color: "var(--text-muted)" }}>
                            {dayjs.utc(c.closedAt).tz(timezone).format(dateFormat)}
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

      {/* Response readiness */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <TrendingUp
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="card-title">Response readiness</span>
          </div>
          <span
            className="ml-auto text-[18px] font-bold"
            style={{
              color:
                score === 100
                  ? "#10b981"
                  : score >= 60
                    ? "#f59e0b"
                    : "#ef4444",
            }}
          >
            {score}%
          </span>
        </div>
        <div className="card-body space-y-2">
          {checks.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[12px]"
            >
              {c.done ? (
                <CheckCircle2
                  className="w-4 h-4 text-[#10b981] flex-shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <div
                  className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: "#334155" }}
                />
              )}
              <span
                style={{
                  color: c.done
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                }}
              >
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Response draft card */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
            <span className="card-title">Response draft</span>
          </div>
          {isSubmitted && <Badge variant="green">Submitted &#10003;</Badge>}
        </div>
        <div className="card-body space-y-3">
          {liveEvent.responseDraft?.trim() ? (
            <>
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                {liveEvent.responseDraft}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {liveEvent.responseDraft.length} characters &middot; Draft saved
              </p>
            </>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              No draft yet. Use Edit Draft to write one, or AGI Draft to generate from your observations and CAPAs.
            </p>
          )}
          {!isSubmitted && role !== "viewer" && getEffectiveStatus(liveEvent) !== "Closed" && (
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => { onResponseTextChange(liveEvent.responseDraft ?? ""); setEditModalOpen(true); }}>
                Edit Draft
              </Button>
              {agiMode !== "manual" && agiAgent && (
                <Button variant="ghost" size="sm" icon={Bot} onClick={() => {
                  setAgiModalOpen(true);
                  if (!liveEvent.agiDraft) {
                    setAgiLoading(true);
                    setTimeout(() => { onGenerateAGIDraft(); setAgiLoading(false); }, 2000);
                  }
                }}>
                  AGI Draft
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Supporting Documents */}
      <div className="card mt-4">
        <div className="card-body">
          <DocumentUpload
            recordId={liveEvent.id + "_response"}
            recordTitle="Response Package"
            module="FDA 483 Response"
            existingDocs={liveEvent.responseDocuments ?? []}
            onUpload={(doc) => dispatch(addResponseDocument({ eventId: liveEvent.id, doc }))}
            onDelete={(docId) => dispatch(removeResponseDocument({ eventId: liveEvent.id, docId }))}
            readOnly={isSubmitted}
          />
          <p className="text-[10px] italic mt-2" style={{ color: "var(--text-muted)" }}>
            All attached documents will be included in the FDA response package when QA Head signs and submits.
          </p>
        </div>
      </div>

      {/* Sign & Submit */}
      {canSign &&
        liveEvent.responseDraft?.trim() &&
        getEffectiveStatus(liveEvent) !== "Closed" &&
        getEffectiveStatus(liveEvent) !== "Response Submitted" && (
          <div className="mt-4">
            <Button
              variant="primary"
              icon={ShieldCheck}
              fullWidth
              disabled={!canSubmit}
              onClick={onSignSubmit}
              aria-label={canSubmit ? "Sign and submit response" : "Complete previous steps first"}
            >
              Sign &amp; Submit to FDA
            </Button>
            <p
              className="text-[10px] text-center mt-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              {canSubmit
                ? "GxP e-signature \u2014 identity, meaning and hash recorded"
                : "Complete RCA Workspace and Observations steps first"}
            </p>
          </div>
        )}

      {/* ── Edit Draft Modal ── */}
      <Modal open={editModalOpen} onClose={() => { onCancelEdit(); setEditModalOpen(false); }} title="Response Draft">
        <div className="space-y-4">
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <p><span style={{ color: "var(--text-muted)" }}>Reference:</span> <span className="font-mono" style={{ color: "var(--text-primary)" }}>{liveEvent.referenceNumber}</span></p>
            <p className="mt-0.5"><span style={{ color: "var(--text-muted)" }}>Event:</span> {liveEvent.type} &middot; {liveEvent.agency}</p>
          </div>
          <textarea
            rows={14}
            className="input resize-none w-full text-[12px] font-mono"
            value={responseText}
            onChange={(e) => onResponseTextChange(e.target.value)}
            placeholder={"Write your formal response here.\nInclude:\n- Acknowledgement of observation\n- Root cause identified\n- Corrective actions taken\n- Preventive measures\n- Target completion dates"}
            aria-label="Response draft editor"
          />
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{responseText.length} characters</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { onCancelEdit(); setEditModalOpen(false); }}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={() => { onSaveDraft(); setEditModalOpen(false); }}>Save Draft</Button>
          </div>
        </div>
      </Modal>

      {/* ── AGI Draft Modal ── */}
      <Modal open={agiModalOpen} onClose={() => setAgiModalOpen(false)} title="AGI Response Draft">
        <div className="space-y-3">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>AI-generated draft based on your observations and RCA.</p>
          {agiLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-live="polite">
              <div className="w-8 h-8 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin" aria-hidden="true" />
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Generating response draft...</p>
            </div>
          ) : liveEvent.agiDraft ? (
            <>
              <div className="p-3 rounded-lg agi-panel">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                  <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Generated draft</span>
                </div>
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto" style={{ color: "var(--text-secondary)" }}>
                  {liveEvent.agiDraft}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setAgiModalOpen(false)}>Cancel</Button>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => {
                  onResponseTextChange(liveEvent.agiDraft ?? "");
                  setAgiModalOpen(false);
                  setEditModalOpen(true);
                }}>Edit this draft</Button>
                <Button variant="primary" size="sm" icon={Sparkles} onClick={() => { onUseAGIDraft(); setAgiModalOpen(false); }}>Use this draft</Button>
              </div>
            </>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No draft available. Click Generate to create one from observations and CAPAs.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
=======
import { useState } from "react";
import clsx from "clsx";
import {
  FileText,
  TrendingUp,
  CheckCircle2,
  Bot,
  Sparkles,
  Pencil,
  Save,
  ShieldCheck,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  FDA483Event,
  EventStatus,
} from "@/store/fda483.slice";
import type { CAPA } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

/* ── Helpers ── */

function daysLeft(d: string) {
  return dayjs.utc(d).diff(dayjs(), "day");
}

function getEffectiveStatus(e: FDA483Event): EventStatus {
  if (e.status === "Closed") return "Closed";
  if (e.status === "Response Submitted") return "Response Submitted";
  if (daysLeft(e.responseDeadline) <= 15) return "Response Due";
  return e.status;
}

export interface ResponseTabProps {
  liveEvent: FDA483Event | null;
  capas: CAPA[];  role: string;
  canSign: boolean;
  agiMode: string;
  agiAgent: boolean;
  timezone: string;
  dateFormat: string;
  responseText: string;
  editingResponse: boolean;
  canSubmit: boolean;
  ownerName: (id: string) => string;
  onGoToEvents: () => void;
  onResponseTextChange: (v: string) => void;
  onEditResponseToggle: () => void;
  onCancelEdit: () => void;
  onSaveDraft: () => void;
  onUseAGIDraft: () => void;
  onGenerateAGIDraft: () => void;
  onSignSubmit: () => void;
}

export function ResponseTab({
  liveEvent,
  capas,
  role,
  canSign,
  agiMode,
  agiAgent,
  timezone,
  dateFormat,
  responseText,
  canSubmit,
  ownerName,
  onGoToEvents,
  onResponseTextChange,
  onCancelEdit,
  onSaveDraft,
  onUseAGIDraft,
  onGenerateAGIDraft,
  onSignSubmit,
}: ResponseTabProps) {
  // Local UI state for modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [agiModalOpen, setAgiModalOpen] = useState(false);
  const [agiLoading, setAgiLoading] = useState(false);
  if (!liveEvent) {
    return (
      <div className="card p-8 text-center">
        <FileText
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: "#334155" }}
          aria-hidden="true"
        />
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Select an event from the Events tab
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onGoToEvents}
        >
          Go to Events
        </Button>
      </div>
    );
  }

  const isSubmitted =
    liveEvent.status === "Response Submitted" || liveEvent.status === "Closed";

  // Live CAPA lookup — always reads from the current Redux capa.items via the capas prop
  const linkedCapas = liveEvent.observations
    .filter((o) => !!o.capaId)
    .map((o) => capas.find((c) => c.id === o.capaId))
    .filter((c): c is CAPA => !!c);
  const totalObs = liveEvent.observations.length;
  const capasRaised = totalObs > 0 && liveEvent.observations.every((o) => !!o.capaId);
  const allCapasClosed = capasRaised && linkedCapas.length > 0
    && linkedCapas.every((c) => c.status === "Closed");

  const checks = [
    {
      label: "All observations have RCA",
      done:
        liveEvent.observations.length > 0 &&
        liveEvent.observations.every((o) => o.rootCause?.trim()),
    },
    {
      label: allCapasClosed
        ? "All CAPAs raised and closed"
        : capasRaised
          ? "CAPAs raised \u2014 pending closure"
          : "All observations have CAPA raised",
      done: allCapasClosed,
    },
    {
      label: "Response draft written",
      done: (liveEvent.responseDraft?.trim().length ?? 0) > 0,
    },
    {
      label: "All commitments have due dates",
      done:
        liveEvent.commitments.length > 0 &&
        liveEvent.commitments.every((c) => c.dueDate),
    },
    {
      label: "Response within deadline",
      done: daysLeft(liveEvent.responseDeadline) >= 0,
    },
    {
      label: "Signed and submitted",
      done: isSubmitted,
    },
  ];
  const score = Math.round(
    (checks.filter((c) => c.done).length / checks.length) * 100,
  );

  return (
    <>
      {/* Submitted success card — replaces guidance banner when locked */}
      {isSubmitted && (
        <div
          className={clsx(
            "rounded-xl p-5 mb-4 border",
            "bg-(--success-bg) border-(--success)",
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-[#10b981]" aria-hidden="true" />
            <span className="text-[14px] font-semibold text-[#10b981]">Response submitted</span>
            <Badge variant="green">Locked</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Reference</p>
              <p className="font-mono mt-0.5" style={{ color: "var(--text-primary)" }}>{liveEvent.type} &middot; {liveEvent.referenceNumber}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Submitted</p>
              <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>
                {liveEvent.submittedAt ? dayjs.utc(liveEvent.submittedAt).tz(timezone).format(`${dateFormat} HH:mm`) : "\u2014"}
              </p>
            </div>
            {liveEvent.submittedBy && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Signed by</p>
                <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>{ownerName(liveEvent.submittedBy)}</p>
              </div>
            )}
            {liveEvent.signatureMeaning && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Signature meaning</p>
                <p className="mt-0.5 italic" style={{ color: "var(--text-primary)" }}>&ldquo;{liveEvent.signatureMeaning}&rdquo;</p>
              </div>
            )}
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            This response has been signed and submitted under 21 CFR Part 11. The record is locked and cannot be modified.
          </p>

          {/* Linked CAPAs — live status from capa.slice */}
          {linkedCapas.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(16,185,129,0.25)" }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                Linked CAPAs ({linkedCapas.filter((c) => c.status === "Closed").length} of {linkedCapas.length} closed)
              </p>
              <ul className="space-y-1.5 list-none p-0">
                {linkedCapas.map((c) => {
                  const isClosed = c.status === "Closed";
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold" style={{ color: "var(--brand)" }}>{c.id}</span>
                        <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                          {c.description.length > 60 ? `${c.description.slice(0, 60)}\u2026` : c.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={isClosed ? "green" : c.status === "Pending QA Review" ? "purple" : c.status === "In Progress" ? "amber" : "blue"}>
                          {c.status}
                        </Badge>
                        {isClosed && c.closedAt && (
                          <span style={{ color: "var(--text-muted)" }}>
                            {dayjs.utc(c.closedAt).tz(timezone).format(dateFormat)}
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

      {/* Response readiness */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <TrendingUp
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="card-title">Response readiness</span>
          </div>
          <span
            className="ml-auto text-[18px] font-bold"
            style={{
              color:
                score === 100
                  ? "#10b981"
                  : score >= 60
                    ? "#f59e0b"
                    : "#ef4444",
            }}
          >
            {score}%
          </span>
        </div>
        <div className="card-body space-y-2">
          {checks.map((c, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-[12px]"
            >
              {c.done ? (
                <CheckCircle2
                  className="w-4 h-4 text-[#10b981] flex-shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <div
                  className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: "#334155" }}
                />
              )}
              <span
                style={{
                  color: c.done
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                }}
              >
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Response draft card */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
            <span className="card-title">Response draft</span>
          </div>
          {isSubmitted && <Badge variant="green">Submitted &#10003;</Badge>}
        </div>
        <div className="card-body space-y-3">
          {liveEvent.responseDraft?.trim() ? (
            <>
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                {liveEvent.responseDraft}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {liveEvent.responseDraft.length} characters &middot; Draft saved
              </p>
            </>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              No draft yet. Use Edit Draft to write one, or AGI Draft to generate from your observations and CAPAs.
            </p>
          )}
          {!isSubmitted && role !== "viewer" && getEffectiveStatus(liveEvent) !== "Closed" && (
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => { onResponseTextChange(liveEvent.responseDraft ?? ""); setEditModalOpen(true); }}>
                Edit Draft
              </Button>
              {agiMode !== "manual" && agiAgent && (
                <Button variant="ghost" size="sm" icon={Bot} onClick={() => {
                  setAgiModalOpen(true);
                  if (!liveEvent.agiDraft) {
                    setAgiLoading(true);
                    setTimeout(() => { onGenerateAGIDraft(); setAgiLoading(false); }, 2000);
                  }
                }}>
                  AGI Draft
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sign & Submit */}
      {canSign &&
        liveEvent.responseDraft?.trim() &&
        getEffectiveStatus(liveEvent) !== "Closed" &&
        getEffectiveStatus(liveEvent) !== "Response Submitted" && (
          <div className="mt-4">
            <Button
              variant="primary"
              icon={ShieldCheck}
              fullWidth
              disabled={!canSubmit}
              onClick={onSignSubmit}
              aria-label={canSubmit ? "Sign and submit response" : "Complete previous steps first"}
            >
              Sign &amp; Submit Response
            </Button>
            <p
              className="text-[10px] text-center mt-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              {canSubmit
                ? "GxP e-signature \u2014 identity, meaning and hash recorded"
                : "Complete RCA Workspace and Observations steps first"}
            </p>
          </div>
        )}

      {/* ── Edit Draft Modal ── */}
      <Modal open={editModalOpen} onClose={() => { onCancelEdit(); setEditModalOpen(false); }} title="Response Draft">
        <div className="space-y-4">
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <p><span style={{ color: "var(--text-muted)" }}>Reference:</span> <span className="font-mono" style={{ color: "var(--text-primary)" }}>{liveEvent.referenceNumber}</span></p>
            <p className="mt-0.5"><span style={{ color: "var(--text-muted)" }}>Event:</span> {liveEvent.type} &middot; {liveEvent.agency}</p>
          </div>
          <textarea
            rows={14}
            className="input resize-none w-full text-[12px] font-mono"
            value={responseText}
            onChange={(e) => onResponseTextChange(e.target.value)}
            placeholder={"Write your formal response here.\nInclude:\n- Acknowledgement of observation\n- Root cause identified\n- Corrective actions taken\n- Preventive measures\n- Target completion dates"}
            aria-label="Response draft editor"
          />
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{responseText.length} characters</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { onCancelEdit(); setEditModalOpen(false); }}>Cancel</Button>
            <Button variant="primary" size="sm" icon={Save} onClick={() => { onSaveDraft(); setEditModalOpen(false); }}>Save Draft</Button>
          </div>
        </div>
      </Modal>

      {/* ── AGI Draft Modal ── */}
      <Modal open={agiModalOpen} onClose={() => setAgiModalOpen(false)} title="AGI Response Draft">
        <div className="space-y-3">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>AI-generated draft based on your observations and RCA.</p>
          {agiLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3" role="status" aria-live="polite">
              <div className="w-8 h-8 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin" aria-hidden="true" />
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Generating response draft...</p>
            </div>
          ) : liveEvent.agiDraft ? (
            <>
              <div className="p-3 rounded-lg agi-panel">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-[#6366f1]" aria-hidden="true" />
                  <span className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Generated draft</span>
                </div>
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto" style={{ color: "var(--text-secondary)" }}>
                  {liveEvent.agiDraft}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setAgiModalOpen(false)}>Cancel</Button>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => {
                  onResponseTextChange(liveEvent.agiDraft ?? "");
                  setAgiModalOpen(false);
                  setEditModalOpen(true);
                }}>Edit this draft</Button>
                <Button variant="primary" size="sm" icon={Sparkles} onClick={() => { onUseAGIDraft(); setAgiModalOpen(false); }}>Use this draft</Button>
              </div>
            </>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No draft available. Click Generate to create one from observations and CAPAs.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
>>>>>>> 21ab890b6aefc93457f3a82fd19e6298bb7a5a7d
