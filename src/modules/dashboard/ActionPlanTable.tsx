"use client";

import { ChevronRight } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { STATUS_LABEL as CAPA_STATUS_LABEL } from "@/types/capa";

/**
 * Bespoke 90-day action-plan table (Rung: dashboard action-plan redesign).
 *
 * Deliberately does NOT use the shared global `.data-table` class — its styling
 * is fully self-contained (inline styles + the `ap-` scoped classnames below)
 * so restyling it can never affect the ~12 other tables that DO use
 * `.data-table`. Same data, same 8 columns, same navigation as the original
 * inline block — only the markup/visual treatment differs.
 *
 * Row visual: a priority-colored left accent + a faint severity-tinted row
 * background, roomier rows (borderSpacing) than .data-table, a lighter
 * uppercase header. All text uses theme CSS vars so it reads in dark mode;
 * the accent/tint are derived from the same red/amber/green the badges use.
 */

export interface ActionPlanItem {
  id: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  area: string;
  action: string;
  owner: string;
  dueDate: string;
  status: string;
  module: string;
  refId: string;
  agiRisk: "High" | "Medium" | "Low";
}

interface ActionPlanTableProps {
  items: ActionPlanItem[];
  /** id → display name (DashboardPage passes its displayUserName binding). */
  ownerName: (id: string) => string;
  timezone: string;
  dateFormat: string;
  /** Minimal router surface — just push(href). */
  router: { push: (href: string) => void };
}

// Priority → accent colour + faint row tint. Mirrors the badge colour mapping
// (Critical=red, High=amber, Medium/Low=green). Tint is low-alpha so it works
// over both the light and dark card backgrounds.
const PRIORITY_STYLE: Record<string, { accent: string; tint: string }> = {
  Critical: { accent: "#ef4444", tint: "rgba(239, 68, 68, 0.08)" },
  High: { accent: "#f59e0b", tint: "rgba(245, 158, 11, 0.08)" },
  Medium: { accent: "#10b981", tint: "rgba(16, 185, 129, 0.08)" },
  Low: { accent: "#10b981", tint: "rgba(16, 185, 129, 0.08)" },
};

function pathForModule(module: string): string | null {
  if (module === "gap-assessment") return "/gap-assessment";
  if (module === "capa") return "/capa";
  if (module === "csv-csa") return "/csv-csa";
  return null;
}

function priorityBadgeVariant(p: string) {
  return p === "Critical" ? "red" : p === "High" ? "amber" : "green";
}

function statusBadgeVariant(s: string) {
  if (s === "Closed" || s === "closed") return "green";
  if (s === "In Progress" || s === "in_progress") return "amber";
  if (s === "Pending QA Review" || s === "pending_qa_review") return "purple";
  return "blue";
}

function agiBadgeVariant(r: string) {
  return r === "High" ? "red" : r === "Medium" ? "amber" : "green";
}

export function ActionPlanTable({ items, ownerName, timezone, dateFormat, router }: ActionPlanTableProps) {
  const go = (module: string) => {
    const p = pathForModule(module);
    if (p) router.push(p);
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    textTransform: "uppercase",
    fontSize: 10,
    letterSpacing: "0.05em",
    fontWeight: 600,
    color: "var(--text-muted)",
    padding: "4px 12px",
    whiteSpace: "nowrap",
  };

  return (
    // min-w-0 keeps the table shrinkable inside the fixed grid track (no overflow).
    <div className="ap-wrap min-w-0">
      <table
        aria-label="90 day action plan"
        style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px", tableLayout: "auto" }}
      >
        <caption className="sr-only">Priority actions due within 90 days</caption>
        <thead>
          <tr>
            <th scope="col" style={th}>Priority</th>
            <th scope="col" style={th}>Area</th>
            <th scope="col" style={th}>Action</th>
            <th scope="col" style={th}>Owner</th>
            <th scope="col" style={th}>Due date</th>
            <th scope="col" style={th}>Status</th>
            <th scope="col" style={th}>AGI risk</th>
            <th scope="col" style={th}><span className="sr-only">Nav</span></th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 10).map((item) => {
            const ps = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.Low;
            const overdue = !!item.dueDate && dayjs.utc(item.dueDate).isBefore(dayjs());
            const cell: React.CSSProperties = { background: ps.tint, padding: "10px 12px", verticalAlign: "middle" };
            return (
              <tr
                key={item.id}
                className="ap-row cursor-pointer"
                onClick={() => go(item.module)}
              >
                {/* Priority — first cell carries the accent left border + rounded left edge */}
                <td style={{ ...cell, borderLeft: `4px solid ${ps.accent}`, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>
                  <Badge variant={priorityBadgeVariant(item.priority)}>{item.priority}</Badge>
                </td>
                <td style={cell}><Badge variant="gray">{item.area}</Badge></td>
                <td style={cell}>
                  <p className="text-[12px]" style={{ color: "var(--text-primary)", maxWidth: 200, margin: 0 }}>{item.action}</p>
                </td>
                <td style={{ ...cell }}>
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(item.owner)}</span>
                </td>
                <td style={cell}>
                  {item.dueDate ? (
                    <>
                      <div className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(item.dueDate).tz(timezone).format(dateFormat)}</div>
                      {overdue && <div className="text-[10px] font-semibold text-[#b91c1c]">Overdue</div>}
                    </>
                  ) : (
                    <span className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>&mdash;</span>
                  )}
                </td>
                <td style={cell}>
                  <Badge variant={statusBadgeVariant(item.status)}>{CAPA_STATUS_LABEL[item.status as keyof typeof CAPA_STATUS_LABEL] ?? item.status}</Badge>
                </td>
                <td style={cell}><Badge variant={agiBadgeVariant(item.agiRisk)}>{item.agiRisk}</Badge></td>
                {/* Nav — rounded right edge; chevron stops propagation only to avoid a double-push (same target). */}
                <td style={{ ...cell, borderTopRightRadius: 8, borderBottomRightRadius: 8, textAlign: "right" }}>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={ChevronRight}
                    aria-label={`View ${item.refId}`}
                    onClick={() => go(item.module)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length > 10 && (
        <p className="text-[11px] text-center mt-2" style={{ color: "var(--text-muted)" }}>Showing 10 of {items.length} items</p>
      )}
    </div>
  );
}
