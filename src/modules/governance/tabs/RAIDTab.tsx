import dayjs from "@/lib/dayjs";
import { AlertTriangle, Plus } from "lucide-react";
import type { RAIDItem, RAIDType, RAIDStatus, RAIDPriority } from "@/store/raid.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

function raidTypeBadge(t: RAIDType) { const m: Record<RAIDType, "red" | "blue" | "amber" | "green"> = { Risk: "red", Action: "blue", Issue: "amber", Decision: "green" }; return <Badge variant={m[t]}>{t}</Badge>; }
function raidStatusBadge(s: RAIDStatus) { const m: Record<RAIDStatus, "blue" | "amber" | "green" | "red"> = { Open: "blue", "In Progress": "amber", Closed: "green", Escalated: "red" }; return <Badge variant={m[s]}>{s}</Badge>; }
function priorityBadge(p: RAIDPriority) { const m: Record<RAIDPriority, "red" | "amber" | "blue" | "gray"> = { Critical: "red", High: "amber", Medium: "blue", Low: "gray" }; return <Badge variant={m[p]}>{p}</Badge>; }

export interface RAIDTabProps {
  raidItems: RAIDItem[];
  filteredRaid: RAIDItem[];
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  priorityFilter: string;
  setPriorityFilter: (v: string) => void;
  anyRaidFilter: boolean;
  role: string;
  timezone: string;
  dateFormat: string;
  ownerName: (id: string) => string;
  onAddRaidOpen: () => void;
  onCloseRaid: (item: RAIDItem) => void;
}

export function RAIDTab({
  raidItems, filteredRaid, typeFilter, setTypeFilter, statusFilter,
  setStatusFilter, priorityFilter, setPriorityFilter, anyRaidFilter,
  role, timezone, dateFormat, ownerName, onAddRaidOpen, onCloseRaid,
}: RAIDTabProps) {
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown placeholder="All types" value={typeFilter} onChange={setTypeFilter} width="w-32" options={[{ value: "", label: "All types" }, ...["Risk", "Action", "Issue", "Decision"].map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-36" options={[{ value: "", label: "All statuses" }, ...["Open", "In Progress", "Closed", "Escalated"].map((s) => ({ value: s, label: s }))]} />
        <Dropdown placeholder="All priorities" value={priorityFilter} onChange={setPriorityFilter} width="w-36" options={[{ value: "", label: "All priorities" }, ...["Critical", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }))]} />
        {anyRaidFilter && <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(""); setStatusFilter(""); setPriorityFilter(""); }}>Clear</Button>}
        <div className="ml-auto">{role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} onClick={onAddRaidOpen}>Add RAID item</Button>}</div>
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-4"><Badge variant="red">{raidItems.filter((r) => r.type === "Risk").length} Risks</Badge><Badge variant="blue">{raidItems.filter((r) => r.type === "Action").length} Actions</Badge><Badge variant="amber">{raidItems.filter((r) => r.type === "Issue").length} Issues</Badge><Badge variant="green">{raidItems.filter((r) => r.type === "Decision").length} Decisions</Badge></div>
      {raidItems.length === 0 ? (
        <div className="card p-10 text-center"><AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" /><p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No RAID items yet</p><p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>Log risks, actions, issues and decisions to track governance items.</p>{role !== "viewer" && <Button variant="primary" size="sm" icon={Plus} onClick={onAddRaidOpen}>Add first item</Button>}</div>
      ) : filteredRaid.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No items match filters</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => { setTypeFilter(""); setStatusFilter(""); setPriorityFilter(""); }}>Clear</Button></div>
      ) : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="data-table" aria-label="RAID log"><caption className="sr-only">Risks, actions, issues and decisions</caption><thead><tr><th scope="col">Type</th><th scope="col">Title</th><th scope="col">Priority</th><th scope="col">Owner</th><th scope="col">Due date</th><th scope="col">Status</th>{role !== "viewer" && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead><tbody>
          {filteredRaid.map((r) => (<tr key={r.id}><td>{raidTypeBadge(r.type)}</td><th scope="row"><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.title}</p><p className="text-[10px] line-clamp-1" style={{ color: "var(--text-muted)", maxWidth: 240 }}>{r.description}</p></th><td>{priorityBadge(r.priority)}</td><td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(r.owner)}</td><td className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(r.dueDate).tz(timezone).format(dateFormat)}{r.status !== "Closed" && dayjs.utc(r.dueDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}</td><td>{raidStatusBadge(r.status)}</td>{role !== "viewer" && <td>{r.status !== "Closed" && <Button variant="ghost" size="xs" onClick={() => onCloseRaid(r)}>Close</Button>}</td>}</tr>))}
        </tbody></table></div></div>
      )}
    </>
  );
}
