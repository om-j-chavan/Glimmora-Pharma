import clsx from "clsx";
import { GitBranch, Plus } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem, RiskLevel, RoadmapActivity } from "@/store/systems.slice";
import type { UserConfig } from "@/store/settings.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

/* ── Helpers ── */

const ACTIVITY_COLORS: Record<string, string> = {
  IQ: "#0ea5e9", OQ: "#6366f1", PQ: "#10b981", PV: "#f59e0b",
  UAT: "#a78bfa", "Risk Assessment": "#ef4444", "Periodic Review": "#64748b",
};

function riskBadge(r: RiskLevel) {
  const m: Record<RiskLevel, "red" | "amber" | "green"> = { HIGH: "red", MEDIUM: "amber", LOW: "green" };
  return <Badge variant={m[r]}>{r}</Badge>;
}

function actStatusBadge(s: RoadmapActivity["status"]) {
  const m: Record<string, "green" | "amber" | "blue" | "red"> = { Complete: "green", "In Progress": "amber", Planned: "blue", Overdue: "red" };
  return <Badge variant={m[s] ?? "gray"}>{s}</Badge>;
}

function ownerName(uid: string, users: UserConfig[]) {
  return users.find((u) => u.id === uid)?.name ?? uid;
}

function activityProgress(a: RoadmapActivity) {
  if (a.status === "Complete") return 100;
  if (a.status === "Planned" && dayjs.utc(a.startDate).isAfter(dayjs())) return 0;
  const total = Math.max(1, dayjs(a.endDate).diff(dayjs(a.startDate), "day"));
  const elapsed = dayjs().diff(dayjs(a.startDate), "day");
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/* ── Props ── */

export interface CSVRoadmapTabProps {
  systems: GxPSystem[];
  roadmap: RoadmapActivity[];
  roadmapGrouped: { system: GxPSystem; activities: RoadmapActivity[] }[];
  users: UserConfig[];
  isDark: boolean;
  role: string;
  rmSysFilter: string;
  rmTypeFilter: string;
  rmStatusFilter: string;
  onRmSysFilterChange: (v: string) => void;
  onRmTypeFilterChange: (v: string) => void;
  onRmStatusFilterChange: (v: string) => void;
  onClearRoadmapFilters: () => void;
  onAddActivityOpen: () => void;
  onGoToInventory: () => void;
}

export function CSVRoadmapTab({
  systems, roadmap, roadmapGrouped, users, isDark, role,
  rmSysFilter, rmTypeFilter, rmStatusFilter,
  onRmSysFilterChange, onRmTypeFilterChange, onRmStatusFilterChange,
  onClearRoadmapFilters, onAddActivityOpen, onGoToInventory,
}: CSVRoadmapTabProps) {
  return (
    <>
      {/* Summary + Add button */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="blue">{roadmap.filter((a) => a.status === "Planned").length} planned</Badge>
          <Badge variant="amber">{roadmap.filter((a) => a.status === "In Progress").length} in progress</Badge>
          <Badge variant="green">{roadmap.filter((a) => a.status === "Complete").length} complete</Badge>
          <Badge variant="red">{roadmap.filter((a) => a.status === "Overdue").length} overdue</Badge>
        </div>
        {role !== "viewer" && systems.length > 0 && (
          <Button variant="primary" size="sm" icon={Plus} onClick={onAddActivityOpen}>Add activity</Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown placeholder="All systems" value={rmSysFilter} onChange={onRmSysFilterChange} width="w-48" options={[{ value: "", label: "All systems" }, ...systems.map((s) => ({ value: s.id, label: s.name.split(" \u2014 ")[0] || s.name }))]} />
        <Dropdown placeholder="All types" value={rmTypeFilter} onChange={onRmTypeFilterChange} width="w-40" options={[{ value: "", label: "All types" }, ...["IQ", "OQ", "PQ", "PV", "UAT", "Risk Assessment", "Periodic Review"].map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All statuses" value={rmStatusFilter} onChange={onRmStatusFilterChange} width="w-36" options={[{ value: "", label: "All statuses" }, { value: "Planned", label: "Planned" }, { value: "In Progress", label: "In Progress" }, { value: "Complete", label: "Complete" }, { value: "Overdue", label: "Overdue" }]} />
      </div>

      {/* Grouped timeline */}
      {roadmapGrouped.length === 0 ? (
        <div className="card p-10 text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" />
          {systems.length === 0 ? (
            <>
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No roadmap activities yet</p>
              <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>First add your GxP systems in the System Inventory tab. Roadmap activities are created when systems have planned validation actions.</p>
              <Button variant="ghost" size="sm" onClick={onGoToInventory}>Go to System Inventory</Button>
            </>
          ) : roadmap.length === 0 ? (
            <>
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No roadmap activities planned yet</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Activities will appear here once systems have validation actions in progress.</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No activities match the current filters</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={onClearRoadmapFilters}>Clear filters</Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {roadmapGrouped.map(({ system: sys, activities }) => (
            <div key={sys.id}>
              <div className="flex items-center gap-2 mb-2 mt-4">
                <Badge variant="gray">{sys.type}</Badge>
                <span className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{sys.name}</span>
                {riskBadge(sys.riskLevel)}
              </div>
              <div className="space-y-2">
                {activities.map((a) => {
                  const pct = activityProgress(a);
                  return (
                    <div key={a.id} className={clsx("p-3 rounded-lg border", isDark ? "bg-[#0a1f38] border-[#1e3a5a]" : "bg-white border-[#e2e8f0]")}>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ACTIVITY_COLORS[a.type] ?? "#64748b" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{a.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="gray">{a.type}</Badge>
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{dayjs.utc(a.startDate).format("DD MMM")} &rarr; {dayjs.utc(a.endDate).format("DD MMM YYYY")}</span>
                          </div>
                        </div>
                        {actStatusBadge(a.status)}
                        <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{ownerName(a.owner, users)}</span>
                      </div>
                      <div className={clsx("h-1 rounded-full mt-2", isDark ? "bg-[#1e3a5a]" : "bg-[#e2e8f0]")}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: a.status === "Overdue" ? "#ef4444" : a.status === "Complete" ? "#10b981" : a.status === "In Progress" ? "#f59e0b" : "#0ea5e9" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
