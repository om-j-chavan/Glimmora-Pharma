import { useState } from "react";
import clsx from "clsx";
import { ClipboardList, Pencil, X, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem, ValidationStatus, RoadmapActivity } from "@/store/systems.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

function validationBadge(s: ValidationStatus) {
  const m: Record<ValidationStatus, "green" | "amber" | "red" | "gray"> = { Validated: "green", "In Progress": "amber", Overdue: "red", "Not Started": "gray" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

function actStatusBadge(s: RoadmapActivity["status"]) {
  const m: Record<string, "green" | "amber" | "blue" | "red"> = { Complete: "green", "In Progress": "amber", Planned: "blue", Overdue: "red" };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}

function ownerName(uid: string, users: UserConfig[]) {
  return users.find((u) => u.id === uid)?.name ?? uid;
}

/* ── Props ── */

export interface ValidationPanelProps {
  system: GxPSystem;
  roadmapActivities: RoadmapActivity[];
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  role: string;
  onSavePlannedActions: (text: string) => void;
}

export function ValidationPanel({
  system, roadmapActivities, users, timezone, dateFormat, role,
  onSavePlannedActions,
}: ValidationPanelProps) {
  /* Local editing state */
  const [editingActions, setEditingActions] = useState(false);
  const [actionsText, setActionsText] = useState(system.plannedActions ?? "");

  const [prevId, setPrevId] = useState(system.id);
  if (system.id !== prevId) {
    setPrevId(system.id);
    setActionsText(system.plannedActions ?? "");
    setEditingActions(false);
  }

  return (
    <div className="space-y-4">
      <div className="card"><div className="card-header"><span className="card-title">Validation status</span></div><div className="card-body">
        <div className="flex items-center gap-4 flex-wrap">
          {validationBadge(system.validationStatus)}
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Last validated: {system.lastValidated ? dayjs.utc(system.lastValidated).tz(timezone).format(dateFormat) : "Not yet validated"}
          </div>
          {system.nextReview && (
            <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Next review: {dayjs.utc(system.nextReview).tz(timezone).format(dateFormat)}
              {dayjs.utc(system.nextReview).isBefore(dayjs()) && <span className="text-[#ef4444] ml-1 font-medium">(Overdue)</span>}
            </div>
          )}
        </div>
      </div></div>
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2"><ClipboardList className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Planned validation actions</span></div>
          {role !== "viewer" && (
            <button type="button" onClick={() => { if (editingActions) setActionsText(system.plannedActions ?? ""); setEditingActions((v) => !v); }}
              aria-label={editingActions ? "Cancel editing planned actions" : "Edit planned actions"}
              className={clsx("ml-auto flex items-center gap-1.5 text-[11px] border-none bg-transparent cursor-pointer transition-opacity", editingActions ? "text-[#64748b] hover:text-[#94a3b8]" : "text-[#0ea5e9] hover:opacity-80")}>
              {editingActions ? <X className="w-3.5 h-3.5" aria-hidden="true" /> : <Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{editingActions ? "Cancel" : "Edit"}</span>
            </button>
          )}
        </div>
        <div className="card-body">
          {editingActions ? (
            <div className="space-y-3">
              <label htmlFor="actions-input" className="text-[11px] block" style={{ color: "var(--text-muted)" }}>Describe planned IQ/OQ/PQ and remediation activities</label>
              <textarea id="actions-input" rows={4} className="input resize-none w-full text-[12px]" value={actionsText} onChange={(e) => setActionsText(e.target.value)}
                placeholder={"e.g. IQ/OQ/PQ planned Q2 2026.\nAudit trail remediation \u2014 see CAPA-0042.\nE-sig binding fix \u2014 CAPA-0043."} aria-describedby="actions-hint" />
              <p id="actions-hint" className="text-[10px]" style={{ color: "var(--text-muted)" }}>Visible in system detail and roadmap planning.</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => { setActionsText(system.plannedActions ?? ""); setEditingActions(false); }}>Cancel</Button>
                <Button variant="primary" size="sm" icon={Save} type="button" onClick={() => {
                  onSavePlannedActions(actionsText.trim());
                  setEditingActions(false);
                }}>Save</Button>
              </div>
            </div>
          ) : system.plannedActions?.trim() ? (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{system.plannedActions}</p>
          ) : (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No planned actions documented. Click Edit above to add a validation plan.</p>
          )}
        </div>
      </div>
      <div className="card"><div className="card-header"><span className="card-title">Roadmap activities</span></div><div className="card-body">
        {roadmapActivities.length === 0 ? (
          <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No roadmap activities planned yet.</p>
        ) : (
          <table className="data-table" aria-label={`Roadmap for ${system.name}`}>
            <thead><tr><th scope="col">Activity</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Owner</th></tr></thead>
            <tbody>{roadmapActivities.map((a) => (
              <tr key={a.id}>
                <th scope="row" className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</th>
                <td><Badge variant="gray">{a.type}</Badge></td>
                <td>{actStatusBadge(a.status)}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.startDate).format("DD MMM YY")}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(a.endDate).format("DD MMM YY")}</td>
                <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div></div>
    </div>
  );
}
