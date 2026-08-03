"use client";

/**
 * Regulatory calendar — Regulatory Affairs.
 *
 * The merged, date-sorted deadline list built by `computeRegulatoryKPIs`: FDA 483
 * response deadlines (`FDA483Event.responseDeadline`), agency commitments
 * (`FDA483Commitment.dueDate`) and expected inspection dates
 * (`Inspection.expectedDate`). Nothing is generated — a row exists only because a
 * date exists on a record.
 *
 * The panel also carries the submission-status roll-up, so the role's "where does
 * each response stand" question is answered without leaving the dashboard.
 */

import { memo } from "react";
import { Building2, CalendarClock } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { ListRow, MetricRow, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

const KIND_LABEL = {
  response: "483 response",
  commitment: "Commitment",
  inspection: "Inspection",
} as const;

export const RegulatoryCalendarWidget = memo(function RegulatoryCalendarWidget({
  data, canOpen,
}: DashboardWidgetProps) {
  const r = data.regulatory;
  const fmt = (d: string | Date) =>
    dayjs.utc(d instanceof Date ? d.toISOString() : d).tz(data.timezone).format(data.dateFormat);

  const overdueCount = r.deadlines.filter((d) => d.overdue).length;

  return (
    <CardSection
      icon={CalendarClock}
      iconColor="#6366f1"
      title="Regulatory calendar"
      badge={
        overdueCount > 0
          ? <Badge variant="red">{overdueCount} overdue</Badge>
          : r.deadlines.length > 0
            ? <Badge variant="blue">{r.deadlines.length} upcoming</Badge>
            : undefined
      }
    >
      {r.deadlines.length === 0 ? (
        <WidgetEmpty
          icon={Building2}
          message="No regulatory deadlines recorded"
          hint="Deadlines appear from 483 response dates, agency commitments and expected inspection dates."
          action={canOpen("fda483") ? { label: "Open Inspections & Regulatory", href: "/fda-483" } : undefined}
        />
      ) : (
        <div className="space-y-1">
          {r.deadlines.slice(0, 8).map((d) => (
            <ListRow
              key={d.id}
              title={d.label}
              subtitle={d.detail}
              meta={
                <span style={{ color: d.overdue ? READINESS_COLORS.risk : "var(--text-muted)" }}>
                  {KIND_LABEL[d.kind]} · {fmt(d.dueDate)}
                  {d.overdue ? " · overdue" : ""}
                </span>
              }
              href={
                d.kind === "inspection"
                  ? "/readiness"
                  : canOpen("fda483") ? "/fda-483" : null
              }
              badge={
                d.overdue
                  ? <Badge variant="red">Overdue</Badge>
                  : undefined
              }
            />
          ))}
          {r.deadlines.length > 8 && (
            <p className="text-[10px] text-center pt-1" style={{ color: "var(--text-muted)" }}>
              Showing the 8 soonest of {r.deadlines.length} deadlines
            </p>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
          Submission status
        </p>
        <MetricRow
          label="Responses submitted"
          value={`${r.submittedResponses}/${r.totalEvents}`}
          valueColor={READINESS_COLORS.ready}
        />
        <MetricRow
          label="Responses overdue"
          value={r.overdueResponses}
          valueColor={r.overdueResponses > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
        />
        <MetricRow
          label="Observations open"
          value={r.openObservations}
          valueColor={r.openObservations > 0 ? READINESS_COLORS.watch : READINESS_COLORS.ready}
        />
        <MetricRow
          label="Commitments open"
          value={r.openCommitments}
          valueColor={r.overdueCommitments > 0 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
          detail={r.overdueCommitments > 0 ? `${r.overdueCommitments} past due` : undefined}
        />
        {r.nextInspection && (
          <MetricRow
            label={`Next inspection · ${r.nextInspection.agency ?? ""}`.trim()}
            value={r.nextInspection.expectedDate ? fmt(r.nextInspection.expectedDate) : "—"}
            detail={`${r.nextInspection.title} · ${r.nextInspection.readinessScore}% ready`}
          />
        )}
      </div>
    </CardSection>
  );
});
