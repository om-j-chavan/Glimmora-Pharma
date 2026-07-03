/**
 * OverviewTab — at-a-glance summary of a single FDA 483 event.
 *
 * Three vertically-stacked cards:
 *   A. Response readiness  (5-row checklist from computeReadinessRows)
 *   B. Commitments         (list lifted from ObservationsTab, plus [+ Add])
 *   C. Recent activity     (last 5 audit-log rows for this event)
 *
 * Spec source: AUDIT-FDA483-MODULE.md Cat 8 + R2 spec items #6-7.
 *
 * Lock semantics: when the event is already submitted (Response Submitted
 * or Closed) the readiness card collapses to a green success state showing
 * submittedAt + submittedBy, and the Commitments card hides its [+ Add]
 * affordances (commitments are part of the locked record under 21 CFR Part 11).
 *
 * The tab is a pure render — it never fetches, never mutates. All click
 * handlers are forwarded to props (`onNavigate`, `onAddCommitment`) so the
 * parent (FDA483Page) keeps owning router/state.
 */

import {
  CheckCircle2,
  Circle,
  CheckSquare,
  Plus,
  Pencil,
  CalendarClock,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import clsx from "clsx";
import { usePermissions } from "@/hooks/usePermissions";
import dayjs from "@/lib/dayjs";
import type { FDA483Event, Commitment } from "@/types/fda483";
import type { CAPA } from "@/store/capa.slice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/shared";
import {
  computeReadinessRows,
  daysUntil,
  isEventLocked,
  type ReadinessRow,
} from "../_shared";
import type { DetailTab } from "../useEventDetailUrlState";

export interface OverviewTabProps {
  /** Active event. Always non-null when this tab renders. */
  liveEvent: FDA483Event;
  /** Live CAPA slice — reserved for future "Linked CAPAs" surfacing. */
  capas: CAPA[];
  /** Tenant timezone (IANA) for date formatting. */
  timezone: string;
  /** Tenant date format token (dayjs) — e.g. "DD MMM YYYY". */
  dateFormat: string;
  /** Resolves a commitment owner's user id to a display name (the parent
   *  owns the users list; without this the card would render a raw cuid). */
  ownerName: (id: string) => string;
  /** Click handler for readiness rows. Parent forwards to
   *  useEventDetailUrlState().navigate. */
  onNavigate: (target: { tab: DetailTab; obsIndex?: number }) => void;
  /** Open the AddCommitmentModal. Parent owns the modal state.
   *  NOTE (integration phase): this prop must be added to the parent's
   *  <OverviewTab/> wiring; FDA483Page already maintains an
   *  addCommitOpen state for the existing AddCommitmentModal. */
  onAddCommitment?: () => void;
  /** Open the CommitmentDetailModal in edit / complete mode (parent owns it). */
  onEditCommitment?: (c: Commitment) => void;
  onCompleteCommitment?: (c: Commitment) => void;
}

/* ── Subcomponents ───────────────────────────────────────────────── */

interface ReadinessCardProps {
  event: FDA483Event;
  timezone: string;
  dateFormat: string;
  onNavigate: OverviewTabProps["onNavigate"];
}

function ReadinessCard({
  event,
  timezone,
  dateFormat,
  onNavigate,
}: ReadinessCardProps) {
  const submitted = isEventLocked(event.status);

  if (submitted) {
    return (
      <div
        className="card"
        role="region"
        aria-label="Response submitted"
      >
        <div
          className="card-body flex items-start gap-3"
          style={{
            background: "var(--success-bg)",
            borderRadius: "inherit",
          }}
        >
          <ShieldCheck
            className="w-5 h-5 mt-0.5 shrink-0"
            style={{ color: "var(--success)" }}
            aria-hidden="true"
          />
          <div className="flex-1">
            <p
              className="text-[13px] font-semibold"
              style={{ color: "var(--success)" }}
            >
              Response submitted
            </p>
            <p
              className="text-[11px] mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {event.submittedAt
                ? `Submitted ${dayjs.utc(event.submittedAt).tz(timezone).format(`${dateFormat} HH:mm`)}`
                : "Submitted"}
              {event.submittedBy ? ` by ${event.submittedBy}` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { rows, doneCount, total } = computeReadinessRows(event);

  // Item 3 — when every readiness check passes (and the event isn't yet
  // submitted, handled above), promote Sign & Submit here so the user
  // doesn't have to hunt for it on the Response tab. The button NAVIGATES
  // to the Response tab (it does not open the SignSubmit modal) so the
  // signer still sees Step 3's locked-state context first.
  if (doneCount === total) {
    return (
      <div className="card" role="region" aria-label="Response readiness">
        <div className="card-header">
          <span className="card-title">Response readiness</span>
          <span
            className="ml-auto text-[11px] font-semibold"
            style={{ color: "var(--success)" }}
            aria-live="polite"
          >
            {doneCount} of {total} done
          </span>
        </div>
        <div className="card-body">
          <div
            className="rounded-lg p-4 flex flex-col items-start gap-2"
            style={{ background: "var(--success-bg)" }}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2
                className="w-5 h-5 shrink-0"
                style={{ color: "var(--success)" }}
                aria-hidden="true"
              />
              <p
                className="text-[13px] font-semibold"
                style={{ color: "var(--success)" }}
              >
                Response is ready to submit
              </p>
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              All {total} readiness checks complete.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              className="mt-1"
              onClick={() => onNavigate({ tab: "response" })}
            >
              Sign &amp; Submit to FDA
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" role="region" aria-label="Response readiness">
      <div className="card-header">
        <span className="card-title">Response readiness</span>
        <span
          className="ml-auto text-[11px] font-semibold"
          style={{ color: "var(--text-secondary)" }}
          aria-live="polite"
        >
          {doneCount} of {total} done
        </span>
      </div>
      <div className="card-body">
        <ul className="space-y-1" role="list">
          {rows.map((row) => (
            <ReadinessRowItem
              key={row.id}
              row={row}
              onNavigate={onNavigate}
            />
          ))}
        </ul>

        <DeadlineIndicator
          deadline={event.responseDeadline}
          timezone={timezone}
          dateFormat={dateFormat}
        />
      </div>
    </div>
  );
}

function ReadinessRowItem({
  row,
  onNavigate,
}: {
  row: ReadinessRow;
  onNavigate: OverviewTabProps["onNavigate"];
}) {
  const Icon = row.done ? CheckCircle2 : Circle;
  const iconColor = row.done ? "var(--success)" : "var(--text-muted)";

  const content = (
    <span className="flex items-center gap-2.5 py-1.5">
      <Icon
        className="w-4 h-4 shrink-0"
        style={{ color: iconColor }}
        aria-hidden="true"
      />
      <span
        className={clsx("text-[12px]", row.done && "line-through")}
        style={{
          color: row.done ? "var(--text-muted)" : "var(--text-primary)",
        }}
      >
        {row.label}
      </span>
    </span>
  );

  if (row.done) {
    return (
      <li>
        <div className="px-2">{content}</div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() =>
          onNavigate({ tab: row.targetTab, obsIndex: row.targetObsIndex })
        }
        className="w-full text-left rounded-md px-2 transition-colors hover:bg-(--bg-elevated) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand) border-none bg-transparent cursor-pointer"
      >
        {content}
      </button>
    </li>
  );
}

function DeadlineIndicator({
  deadline,
  timezone,
  dateFormat,
}: {
  deadline: string;
  timezone: string;
  dateFormat: string;
}) {
  const days = daysUntil(deadline);

  // No deadline / unparseable → render nothing rather than "NaN days".
  if (days === null) return null;

  // Tone bands per spec:
  //   days < 0  → overdue (red)
  //   days <=5  → red
  //   days <=15 → amber
  //   days >15  → neutral
  let bg: string;
  let fg: string;
  let label: string;
  if (days < 0) {
    bg = "var(--danger-bg)";
    fg = "var(--danger)";
    label = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  } else if (days <= 5) {
    bg = "var(--danger-bg)";
    fg = "var(--danger)";
    label = `${days} day${days === 1 ? "" : "s"} remaining`;
  } else if (days <= 15) {
    bg = "var(--warning-bg)";
    fg = "var(--warning)";
    label = `${days} days remaining`;
  } else {
    bg = "var(--bg-elevated)";
    fg = "var(--text-secondary)";
    label = `${days} days remaining`;
  }

  const formatted = dayjs.utc(deadline).tz(timezone).format(dateFormat);

  return (
    <div
      className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{ background: bg }}
      role="status"
    >
      <CalendarClock
        className="w-4 h-4 shrink-0"
        style={{ color: fg }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-semibold"
          style={{ color: fg }}
        >
          {label}
        </p>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: "var(--text-muted)" }}
        >
          Due {formatted}
        </p>
      </div>
    </div>
  );
}

/* ── Commitments card ───────────────────────────────────────────── */

interface CommitmentsCardProps {
  event: FDA483Event;
  timezone: string;
  dateFormat: string;
  ownerName: (id: string) => string;
  fullyLocked: boolean;
  onAddCommitment?: () => void;
  onEditCommitment?: (c: Commitment) => void;
  onCompleteCommitment?: (c: Commitment) => void;
  onNavigate: (target: { tab: DetailTab; obsIndex?: number }) => void;
}

// Overdue is a DERIVED display state — an open commitment past its due date.
function isCommitmentOverdue(c: Commitment): boolean {
  return (
    !!c.dueDate &&
    dayjs.utc(c.dueDate).isBefore(dayjs()) &&
    c.status !== "Complete" &&
    c.status !== "Cancelled"
  );
}

function CommitmentsCard({
  event,
  timezone,
  dateFormat,
  ownerName,
  fullyLocked,
  onAddCommitment,
  onEditCommitment,
  onCompleteCommitment,
  onNavigate,
}: CommitmentsCardProps) {
  const commitments = event.commitments;
  // Capability mirror of the server (excludes super_admin from authoring).
  const fdaCan = usePermissions("fda483");
  const showAdd = !fullyLocked && !!onAddCommitment && fdaCan.canEdit;
  const overdueCount = commitments.filter(isCommitmentOverdue).length;

  return (
    <div className="card" role="region" aria-label="Commitments">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4" style={{ color: "var(--success)" }} aria-hidden="true" />
          <span className="card-title">Commitments</span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            ({commitments.length} item{commitments.length === 1 ? "" : "s"}
            {overdueCount > 0 && <span style={{ color: "var(--danger)" }}> · {overdueCount} overdue</span>})
          </span>
        </div>
        {showAdd && (
          <Button variant="ghost" size="sm" icon={Plus} className="ml-auto" onClick={onAddCommitment}>Add</Button>
        )}
      </div>
      <div className="card-body space-y-3">
        {commitments.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              No commitments logged. Add commitments to track response obligations.
            </p>
            {showAdd && (
              <Button variant="secondary" size="sm" icon={Plus} onClick={onAddCommitment}>Add commitment</Button>
            )}
          </div>
        ) : (
          commitments.map((c) => {
            const overdue = isCommitmentOverdue(c);
            const pill =
              c.status === "Complete"
                ? { variant: "green" as const, label: "Complete" }
                : c.status === "Cancelled"
                  ? { variant: "gray" as const, label: "Cancelled" }
                  : overdue
                    ? { variant: "red" as const, label: "Overdue" }
                    : c.status === "In Progress"
                      ? { variant: "blue" as const, label: "In Progress" }
                      : { variant: "amber" as const, label: "Pending" };
            const canComplete = !fullyLocked && c.status !== "Complete" && c.status !== "Cancelled";
            return (
              <div
                key={c.id}
                className="rounded-lg border p-3"
                style={{ borderColor: overdue ? "var(--danger)" : "var(--bg-border)", borderLeftWidth: overdue ? 3 : 1 }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {c.reference ?? ""}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={pill.variant}>{pill.label}</Badge>
                    {!fullyLocked && onEditCommitment && (
                      <Button variant="ghost" size="xs" icon={Pencil} onClick={() => onEditCommitment(c)}>Edit</Button>
                    )}
                  </div>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>{c.text}</p>
                {/* Source linkage */}
                <div className="mt-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {c.observationId ? (
                    <button
                      type="button"
                      className="text-[#0ea5e9] hover:underline border-none bg-transparent p-0 cursor-pointer"
                      onClick={() => onNavigate({ tab: "observations", obsIndex: (c.observationNumber ?? 1) - 1 })}
                    >
                      From: Observation #{c.observationNumber ?? "?"} →
                    </button>
                  ) : c.capaId ? (
                    <a href={`/capa/${c.capaId}`} className="text-[#0ea5e9] hover:underline">
                      From: {c.capaRef ?? c.capaId.slice(0, 8)} →
                    </a>
                  ) : (
                    <span className="italic">Event-level commitment</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span>Due: {c.dueDate ? dayjs.utc(c.dueDate).tz(timezone).format(dateFormat) : "—"}</span>
                  {c.owner && <span>Owner: {ownerName(c.owner)}</span>}
                </div>
                {c.status === "Complete" && (
                  <div className="mt-1.5 text-[10px]" style={{ color: "var(--success)" }}>
                    Completed{c.completedAt ? ` ${dayjs.utc(c.completedAt).tz(timezone).format(dateFormat)}` : ""}
                    {c.completedByName ? ` by ${c.completedByName}` : ""}
                    {c.completionNotes && (
                      <span className="block mt-0.5" style={{ color: "var(--text-muted)" }}>{c.completionNotes}</span>
                    )}
                    {c.documents && c.documents.length > 0 && (
                      <span className="block mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        Evidence: {c.documents.map((d) => d.fileName).join(", ")}
                      </span>
                    )}
                  </div>
                )}
                {canComplete && onCompleteCommitment && (
                  <div className="mt-2">
                    <Button variant="primary" size="xs" icon={CheckCircle2} onClick={() => onCompleteCommitment(c)}>
                      Mark Complete
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Metrics strip (Item 1) ──────────────────────────────────────── */

/** 4 stat tiles derived purely from liveEvent — no new queries. Reuses the
 *  shared StatCard tile shape used by the dashboard / list views. */
function MetricsStrip({
  event,
  timezone,
  dateFormat,
}: {
  event: FDA483Event;
  timezone: string;
  dateFormat: string;
}) {
  const GREEN = "var(--success)";
  const AMBER = "var(--warning)";
  const RED = "var(--danger)";
  const NEUTRAL = "var(--text-secondary)";

  // Tile 1 — readiness
  const { doneCount, total } = computeReadinessRows(event);
  const readinessDone = doneCount === total;
  const remaining = total - doneCount;

  // Tile 2 — commitments
  const commitments = event.commitments;
  const overdueCommit = commitments.filter(
    (c) =>
      !!c.dueDate &&
      dayjs.utc(c.dueDate).isBefore(dayjs()) &&
      c.status !== "Complete",
  ).length;
  const pendingCommit = commitments.filter((c) => c.status === "Pending").length;

  // Tile 3 — deadline
  const days = daysUntil(event.responseDeadline);
  let deadlineValue: string;
  let deadlineSub: string;
  let deadlineColor: string;
  if (days === null) {
    deadlineValue = "—";
    deadlineSub = "No deadline set";
    deadlineColor = NEUTRAL;
  } else if (days < 0) {
    deadlineValue = "Overdue";
    deadlineSub = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    deadlineColor = RED;
  } else {
    deadlineValue = `${days} day${days === 1 ? "" : "s"}`;
    deadlineSub = `Due ${dayjs.utc(event.responseDeadline).tz(timezone).format(dateFormat)}`;
    deadlineColor = days <= 5 ? RED : days <= 15 ? AMBER : NEUTRAL;
  }

  // Tile 4 — observations
  const obs = event.observations;
  const withRca = obs.filter((o) => !!o.rootCause?.trim()).length;
  const withCapa = obs.filter((o) => !!o.capaId).length;
  const obsAllComplete =
    obs.length > 0 && withRca === obs.length && withCapa === obs.length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={CheckCircle2}
        color={readinessDone ? GREEN : AMBER}
        label="Readiness"
        value={`${doneCount} / ${total}`}
        sub={
          readinessDone
            ? "Ready to submit"
            : `${remaining} item${remaining === 1 ? "" : "s"} remaining`
        }
      />
      <StatCard
        icon={CheckSquare}
        color={overdueCommit > 0 ? RED : NEUTRAL}
        label="Commitments"
        value={String(commitments.length)}
        sub={`${overdueCommit} overdue · ${pendingCommit} pending`}
      />
      <StatCard
        icon={CalendarClock}
        color={deadlineColor}
        label="Deadline"
        value={deadlineValue}
        sub={deadlineSub}
      />
      <StatCard
        icon={ClipboardList}
        color={obs.length === 0 ? NEUTRAL : obsAllComplete ? GREEN : AMBER}
        label="Observations"
        value={String(obs.length)}
        sub={`${withRca} with RCA · ${withCapa} with CAPA`}
      />
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────── */

export function OverviewTab({
  liveEvent,
  timezone,
  dateFormat,
  ownerName,
  onNavigate,
  onAddCommitment,
  onEditCommitment,
  onCompleteCommitment,
}: OverviewTabProps) {
  const fullyLocked = isEventLocked(liveEvent.status);

  return (
    <div className="space-y-4">
      <MetricsStrip
        event={liveEvent}
        timezone={timezone}
        dateFormat={dateFormat}
      />
      <ReadinessCard
        event={liveEvent}
        timezone={timezone}
        dateFormat={dateFormat}
        onNavigate={onNavigate}
      />
      <CommitmentsCard
        event={liveEvent}
        timezone={timezone}
        dateFormat={dateFormat}
        ownerName={ownerName}
        fullyLocked={fullyLocked}
        onAddCommitment={onAddCommitment}
        onEditCommitment={onEditCommitment}
        onCompleteCommitment={onCompleteCommitment}
        onNavigate={onNavigate}
      />
    </div>
  );
}
