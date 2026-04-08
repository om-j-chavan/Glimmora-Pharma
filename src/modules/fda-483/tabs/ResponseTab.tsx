import clsx from "clsx";
import {
  FileText,
  TrendingUp,
  CheckCircle2,
  Bot,
  Sparkles,
  ArrowRight,
  Pencil,
  X,
  Save,
  ShieldCheck,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import type {
  FDA483Event,
  EventType,
  EventStatus,
} from "@/store/fda483.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function eventTypeBadge(t: EventType) {
  const m: Record<EventType, "red" | "amber" | "blue"> = {
    "FDA 483": "red",
    "Warning Letter": "red",
    "EMA Inspection": "amber",
    "MHRA Inspection": "amber",
    "WHO Inspection": "blue",
  };
  return <Badge variant={m[t]}>{t}</Badge>;
}

function eventStatusBadge(s: EventStatus) {
  const m: Record<EventStatus, "blue" | "red" | "amber" | "green"> = {
    Open: "blue",
    "Response Due": "red",
    "Response Submitted": "amber",
    Closed: "green",
  };
  return <Badge variant={m[s]}>{s}</Badge>;
}

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
  isDark: boolean;
  role: string;
  canSign: boolean;
  agiMode: string;
  agiAgent: boolean;
  timezone: string;
  dateFormat: string;
  responseText: string;
  editingResponse: boolean;
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
  isDark,
  role,
  canSign,
  agiMode,
  agiAgent,
  timezone,
  dateFormat,
  responseText,
  editingResponse,
  onGoToEvents,
  onResponseTextChange,
  onEditResponseToggle,
  onCancelEdit,
  onSaveDraft,
  onUseAGIDraft,
  onGenerateAGIDraft,
  onSignSubmit,
}: ResponseTabProps) {
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

  const checks = [
    {
      label: "All observations have RCA",
      done:
        liveEvent.observations.length > 0 &&
        liveEvent.observations.every((o) => o.rootCause?.trim()),
    },
    {
      label: "All observations have CAPA raised",
      done: liveEvent.observations.every((o) => o.capaId),
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
  ];
  const score = Math.round(
    (checks.filter((c) => c.done).length / checks.length) * 100,
  );

  return (
    <>
      {/* Status bar */}
      <div
        className={clsx(
          "flex items-center justify-between p-4 rounded-xl mb-4 border flex-wrap gap-3",
          isDark
            ? "bg-[#0a1f38] border-[#1e3a5a]"
            : "bg-[#f8fafc] border-[#e2e8f0]",
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {eventTypeBadge(liveEvent.type)}
          <span className="font-mono text-[12px] text-[#0ea5e9]">
            {liveEvent.referenceNumber}
          </span>
          {eventStatusBadge(getEffectiveStatus(liveEvent))}
        </div>
        <div className="text-right">
          <p
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Response deadline
          </p>
          {(() => {
            const d = daysLeft(liveEvent.responseDeadline);
            return (
              <p
                className={clsx(
                  "text-[15px] font-bold",
                  d <= 0
                    ? "text-[#ef4444]"
                    : d <= 5
                      ? "text-[#f59e0b]"
                      : "text-[#10b981]",
                )}
              >
                {d < 0
                  ? `${Math.abs(d)} days overdue`
                  : d === 0
                    ? "Due today"
                    : `${d} days remaining`}
              </p>
            );
          })()}
          <p
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            {dayjs
              .utc(liveEvent.responseDeadline)
              .tz(timezone)
              .format(dateFormat)}
          </p>
        </div>
      </div>

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

      {/* AGI draft panel */}
      {agiMode !== "manual" && agiAgent && (
        <div className="agi-panel mb-4" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot
                className="w-4 h-4 text-[#6366f1]"
                aria-hidden="true"
              />
              <span
                className="text-[12px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                AGI Response Draft
              </span>
            </div>
            {liveEvent.agiDraft && (
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowRight}
                onClick={onUseAGIDraft}
              >
                Use this draft
              </Button>
            )}
          </div>
          {liveEvent.agiDraft ? (
            <p
              className="text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--text-secondary)" }}
            >
              {liveEvent.agiDraft}
            </p>
          ) : (
            <div>
              <p
                className="text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                AGI can generate a response draft based on observations
                and linked CAPAs.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={Sparkles}
                className="mt-2"
                onClick={onGenerateAGIDraft}
              >
                Generate AGI draft
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Response editor */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText
              className="w-4 h-4 text-[#0ea5e9]"
              aria-hidden="true"
            />
            <span className="card-title">Response draft</span>
          </div>
          {role !== "viewer" && getEffectiveStatus(liveEvent) !== "Closed" && (
            <button
              type="button"
              onClick={onEditResponseToggle}
              className="ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer"
              style={{ color: editingResponse ? "#64748b" : "#0ea5e9" }}
              aria-label={
                editingResponse ? "Cancel editing" : "Edit response"
              }
            >
              {editingResponse ? (
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {editingResponse ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        <div className="card-body">
          {editingResponse ? (
            <div className="space-y-3">
              <textarea
                rows={14}
                className="input resize-none w-full text-[12px] font-mono"
                value={responseText}
                onChange={(e) => onResponseTextChange(e.target.value)}
                placeholder="Write or paste your regulatory response here..."
                aria-label="Response draft editor"
              />
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {responseText.length} characters
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={onCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    type="button"
                    onClick={onSaveDraft}
                  >
                    Save draft
                  </Button>
                </div>
              </div>
            </div>
          ) : liveEvent.responseDraft ? (
            <p
              className="text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{ color: "var(--text-secondary)" }}
            >
              {liveEvent.responseDraft}
            </p>
          ) : (
            <p
              className="text-[11px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              No response draft yet. Click Edit above or use the AGI
              draft.
            </p>
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
              onClick={onSignSubmit}
            >
              Sign &amp; Submit Response
            </Button>
            <p
              className="text-[10px] text-center mt-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              GxP e-signature &mdash; identity, meaning and hash recorded
            </p>
          </div>
        )}
    </>
  );
}
