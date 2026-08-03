"use client";

/**
 * Pending tasks — work addressed to THIS user.
 *
 * Sourced from the server-built `Worklist`, whose authorisation is the strongest in
 * the app: every row is pinned to `ownerId`/`assigneeId === session.user.id` inside
 * the Prisma query. Consequences worth stating:
 *
 *   • Safe for every role — there is no role-based leak surface here at all.
 *   • Empty by construction for `viewer` (`isAssignedToTask` hard-stops the role),
 *     which is why the viewer config omits this widget rather than showing an
 *     always-empty panel.
 */

import { memo } from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { ListRow, WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

export const PendingTasksWidget = memo(function PendingTasksWidget({ data }: DashboardWidgetProps) {
  const overdue = data.pendingTasks.filter((t) => t.overdue).length;

  return (
    <CardSection
      icon={ListChecks}
      iconColor="#0ea5e9"
      title="My pending tasks"
      badge={
        overdue > 0
          ? <Badge variant="red">{overdue} overdue</Badge>
          : data.pendingTasks.length > 0
            ? <Badge variant="blue">{data.pendingTasks.length}</Badge>
            : undefined
      }
    >
      {data.pendingTasks.length === 0 ? (
        <WidgetEmpty
          icon={CheckCircle2}
          message="Nothing assigned to you"
          hint="Assigned CAPA actions, deviation tasks, validation rework and gap findings appear here."
          action={{ label: "Open worklist", href: "/worklist" }}
        />
      ) : (
        <ul role="list" className="space-y-0.5 list-none m-0 p-0">
          {data.pendingTasks.map((task) => (
            <li key={task.id}>
              <ListRow
                title={task.title}
                subtitle={task.context}
                meta={
                  task.dueDate ? (
                    <span style={{ color: task.overdue ? READINESS_COLORS.risk : "var(--text-muted)" }}>
                      due {dayjs.utc(task.dueDate).tz(data.timezone).format(data.dateFormat)}
                      {task.overdue ? " · overdue" : ""}
                    </span>
                  ) : (
                    <span>no due date</span>
                  )
                }
                href={task.href}
                badge={task.overdue ? <Badge variant="red">Overdue</Badge> : undefined}
                ariaLabel={`${task.title} — ${task.context}`}
              />
            </li>
          ))}
        </ul>
      )}
    </CardSection>
  );
});
