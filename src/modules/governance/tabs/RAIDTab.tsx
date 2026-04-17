import { useState, useRef, useEffect } from "react";
import dayjs from "@/lib/dayjs";
import { AlertTriangle, Plus, MoreVertical, Pencil, CheckCircle2, Trash2, Eye, RotateCcw } from "lucide-react";
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
  currentUserId: string;
  timezone: string;
  dateFormat: string;
  ownerName: (id: string) => string;
  onAddRaidOpen: () => void;
  onCloseRaid: (item: RAIDItem) => void;
  onEditRaid: (item: RAIDItem) => void;
  onDeleteRaid: (item: RAIDItem) => void;
  onReopenRaid: (item: RAIDItem) => void;
}

export function RAIDTab({
  raidItems, filteredRaid, typeFilter, setTypeFilter, statusFilter,
  setStatusFilter, priorityFilter, setPriorityFilter, anyRaidFilter,
  role, currentUserId, timezone, dateFormat, ownerName, onAddRaidOpen, onCloseRaid,
  onEditRaid, onDeleteRaid, onReopenRaid,
}: RAIDTabProps) {
  // ── Role-based permissions ──
  const isAdmin = role === "customer_admin" || role === "super_admin";
  const isQAHead = role === "qa_head";
  const canAdd = role !== "viewer";
  const canDeleteAny = isAdmin || isQAHead;
  const isOwner = (r: RAIDItem) => !!currentUserId && r.owner === currentUserId;
  const canEditItem = (r: RAIDItem) => isAdmin || isQAHead || isOwner(r);
  const canCloseItem = (r: RAIDItem) => r.status !== "Closed" && (isAdmin || isQAHead || isOwner(r));
  const canReopenItem = (r: RAIDItem) => r.status === "Closed" && (isAdmin || isQAHead || isOwner(r));
  const hasAnyAction = (r: RAIDItem) => canEditItem(r) || canCloseItem(r) || canReopenItem(r) || canDeleteAny;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openMenu]);

  return (
    <>
      {role === "viewer" && (
        <div
          role="status"
          className="flex items-start gap-2 p-3 rounded-xl mb-4 border"
          style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}
        >
          <Eye className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--brand)" }}>View only</strong> &mdash; Contact QA Head to add or close RAID items.
          </p>
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Dropdown placeholder="All types" value={typeFilter} onChange={setTypeFilter} width="w-32" options={[{ value: "", label: "All types" }, ...["Risk", "Action", "Issue", "Decision"].map((t) => ({ value: t, label: t }))]} />
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-36" options={[{ value: "", label: "All statuses" }, ...["Open", "In Progress", "Closed", "Escalated"].map((s) => ({ value: s, label: s }))]} />
        <Dropdown placeholder="All priorities" value={priorityFilter} onChange={setPriorityFilter} width="w-36" options={[{ value: "", label: "All priorities" }, ...["Critical", "High", "Medium", "Low"].map((p) => ({ value: p, label: p }))]} />
        {anyRaidFilter && <Button variant="ghost" size="sm" onClick={() => { setTypeFilter(""); setStatusFilter(""); setPriorityFilter(""); }}>Clear</Button>}
        <div className="ml-auto">{canAdd && <Button variant="primary" size="sm" icon={Plus} onClick={onAddRaidOpen}>Add RAID item</Button>}</div>
      </div>
      <div className="flex items-center gap-3 flex-wrap mb-4"><Badge variant="red">{raidItems.filter((r) => r.type === "Risk").length} Risks</Badge><Badge variant="blue">{raidItems.filter((r) => r.type === "Action").length} Actions</Badge><Badge variant="amber">{raidItems.filter((r) => r.type === "Issue").length} Issues</Badge><Badge variant="green">{raidItems.filter((r) => r.type === "Decision").length} Decisions</Badge></div>
      {raidItems.length === 0 ? (
        <div className="card p-10 text-center"><AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: "#334155" }} aria-hidden="true" /><p className="text-[13px] font-medium mb-1" style={{ color: "var(--text-primary)" }}>No RAID items yet</p><p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>Log risks, actions, issues and decisions to track governance items.</p>{canAdd && <Button variant="primary" size="sm" icon={Plus} onClick={onAddRaidOpen}>Add first item</Button>}</div>
      ) : filteredRaid.length === 0 ? (
        <div className="card p-8 text-center"><p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>No items match filters</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => { setTypeFilter(""); setStatusFilter(""); setPriorityFilter(""); }}>Clear</Button></div>
      ) : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="data-table" aria-label="RAID log"><caption className="sr-only">Risks, actions, issues and decisions</caption><thead><tr><th scope="col">Type</th><th scope="col">Title</th><th scope="col">Priority</th><th scope="col">Owner</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {filteredRaid.map((r) => (<tr key={r.id} style={r.status === "Closed" ? { opacity: 0.55 } : undefined}><td>{raidTypeBadge(r.type)}</td><th scope="row"><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{r.title}</p><p className="text-[10px] line-clamp-1" style={{ color: "var(--text-muted)", maxWidth: 240 }}>{r.description}</p></th><td>{priorityBadge(r.priority)}</td><td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{ownerName(r.owner)}</td><td className="text-[12px]" style={{ color: "var(--text-primary)" }}>{dayjs.utc(r.dueDate).tz(timezone).format(dateFormat)}{r.status !== "Closed" && dayjs.utc(r.dueDate).isBefore(dayjs()) && <div className="text-[10px] text-[#ef4444]">Overdue</div>}</td><td>{raidStatusBadge(r.status)}</td>
            <td>
              {hasAnyAction(r) ? (
                <div className="relative inline-block" ref={openMenu === r.id ? menuRef : null}>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                    aria-label={`Actions for ${r.title}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenu === r.id}
                    className="p-1 rounded border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {openMenu === r.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full mt-1 z-20 min-w-35 rounded-lg py-1 shadow-lg"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
                    >
                      {canEditItem(r) && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenu(null); onEditRaid(r); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
                        </button>
                      )}
                      {canCloseItem(r) && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenu(null); onCloseRaid(r); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Close
                        </button>
                      )}
                      {canReopenItem(r) && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenu(null); onReopenRaid(r); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reopen
                        </button>
                      )}
                      {canDeleteAny && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setOpenMenu(null); onDeleteRaid(r); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </td>
          </tr>))}
        </tbody></table></div></div>
      )}
    </>
  );
}
