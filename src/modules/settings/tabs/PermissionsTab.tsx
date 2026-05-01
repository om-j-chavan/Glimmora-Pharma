"use client";

import { useState } from "react";
import clsx from "clsx";
import { Info, ShieldCheck, RotateCw } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { setPermission, resetPermissions, resetRolePermissions, type RoleKey, type ModuleKey, type AccessLevel } from "@/store/permissions.slice";
import { auditLog } from "@/lib/audit";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Popup } from "@/components/ui/Popup";

const ROLES: RoleKey[] = ["super_admin", "customer_admin", "qa_head", "qc_lab_director", "regulatory_affairs", "csv_val_lead", "it_cdo", "operations_head", "viewer"];
const ROLE_LABELS: Record<string, string> = { super_admin: "Super Admin", customer_admin: "Customer Admin", qa_head: "QA Head", qc_lab_director: "QC / Lab Director", regulatory_affairs: "Regulatory Affairs", csv_val_lead: "CSV / Val Lead", it_cdo: "IT / CDO", operations_head: "Operations Head", viewer: "Viewer" };
const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" }, { key: "gap", label: "Gap Assessment" }, { key: "capa", label: "CAPA" },
  { key: "csv", label: "CSV/CSA" }, { key: "fda483", label: "FDA 483" }, { key: "evidence", label: "Evidence" },
  { key: "agi", label: "AGI" }, { key: "governance", label: "Governance" }, { key: "settings", label: "Settings" },
];

const LEVEL_CYCLE: AccessLevel[] = ["none", "readonly", "limited", "full"];
const LEVEL_LABELS: Record<AccessLevel, string> = { full: "Full", limited: "Limited", readonly: "Read", none: "\u2014" };
const LEVEL_COLORS: Record<AccessLevel, string> = { full: "#10b981", limited: "#f59e0b", readonly: "#0ea5e9", none: "#334155" };

function cycleLevel(current: AccessLevel): AccessLevel {
  return LEVEL_CYCLE[(LEVEL_CYCLE.indexOf(current) + 1) % LEVEL_CYCLE.length];
}

export function PermissionsTab() {
  const dispatch = useAppDispatch();
  const matrix = useAppSelector((s) => s.permissions?.matrix);  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();
  const isSuperAdmin = role === "super_admin" || role === "customer_admin";

  const [savedPopup, setSavedPopup] = useState(false);
  const [resetConfirm, setResetConfirm] = useState<RoleKey | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div><h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Role Permissions</h2><p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>{isSuperAdmin ? "Click any cell to cycle access level. Changes take effect immediately." : "Read-only view \u2014 only Super Admin can edit permissions."}</p></div>
        {isSuperAdmin && <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => { dispatch(resetPermissions()); setSavedPopup(true); }}>Reset all to defaults</Button>}
      </div>

      {/* Read-only banner */}
      {!isSuperAdmin && (
        <div className={clsx("flex items-start gap-2 p-3 rounded-xl border", "bg-(--warning-bg) border-(--warning)")}>
          <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Only Super Admin can edit permissions. You are viewing read-only.</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 flex-wrap">
        {([["full", "#10b981", "Full access"], ["limited", "#f59e0b", "Limited"], ["readonly", "#0ea5e9", "Read only"], ["none", "#334155", "No access"]] as const).map(([, c, l]) => (
          <div key={l} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded" style={{ background: c }} aria-hidden="true" /><span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{l}</span></div>
        ))}
        <span className="text-[10px] italic ml-auto" style={{ color: "var(--text-muted)" }}>{isSuperAdmin ? "Click cell to change \u00b7 Cycle: None \u2192 Read only \u2192 Limited \u2192 Full" : "Read only view"}</span>
      </div>

      {/* Matrix */}
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full" aria-label="Role permissions matrix"><caption className="sr-only">Role-based access levels \u2014 click to edit</caption>
          <thead><tr className="border-b border-(--bg-border)">
            <th scope="col" className="text-left py-3 px-4 w-44 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Role</th>
            {MODULES.map((m) => <th key={m.key} scope="col" className="text-center py-3 px-2 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{m.label}</th>)}
            {isSuperAdmin && <th scope="col" className="text-center py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Reset</th>}
          </tr></thead>
          <tbody>
            {ROLES.map((rk) => (
              <tr key={rk} className="border-b last:border-0 border-(--bg-border) hover:bg-(--bg-hover)">
                <th scope="row" className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{ROLE_LABELS[rk]}</span>
                    {rk === user?.role && <Badge variant="blue">you</Badge>}
                    {(rk === "super_admin" || rk === "customer_admin") && <Badge variant="green">platform</Badge>}
                  </div>
                </th>
                {MODULES.map((mod) => {
                  const level = (matrix?.[rk]?.[mod.key] ?? "none") as AccessLevel;
                  const isLocked = rk === "super_admin" || rk === "customer_admin";
                  const canToggle = isSuperAdmin && !isLocked;
                  const col = LEVEL_COLORS[level];
                  return (
                    <td key={mod.key} className="py-2 px-2 text-center">
                      <button type="button" disabled={!canToggle}
                        onClick={() => { if (!canToggle) return; const next = cycleLevel(level); dispatch(setPermission({ role: rk, module: mod.key, level: next })); auditLog({ action: "PERMISSION_CHANGED", module: "settings", recordId: `${rk}.${mod.key}`, oldValue: level, newValue: next }); }}
                        aria-label={`${ROLE_LABELS[rk]} \u2014 ${mod.label}: ${level}${canToggle ? ". Click to change." : ""}`}
                        className={clsx("w-full py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all", canToggle ? "cursor-pointer hover:opacity-80" : "cursor-default", isLocked && "opacity-60")}
                        style={{ background: col + "18", color: col, border: `1px solid ${col}33` }}>
                        {LEVEL_LABELS[level]}
                      </button>
                    </td>
                  );
                })}
                {isSuperAdmin && <td className="py-2 px-2 text-center">{rk !== "super_admin" && rk !== "customer_admin" && <Button variant="ghost" size="xs" icon={RotateCw} aria-label={`Reset ${ROLE_LABELS[rk]}`} onClick={() => setResetConfirm(rk)} />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      {/* Definitions */}
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Info className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">Access level definitions</span></div></div><div className="card-body">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {([
            { color: "#10b981", title: "Full access", desc: "Can view, create, edit and delete. Can sign and submit (if GxP Signatory enabled)." },
            { color: "#f59e0b", title: "Limited access", desc: "Can view and edit own records. Cannot sign, close or approve records created by others." },
            { color: "#0ea5e9", title: "Read only", desc: "Can view all data in this module. Cannot create, edit or delete any record." },
            { color: "#334155", title: "No access", desc: "Module is hidden from sidebar. User cannot navigate to this screen." },
          ]).map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-(--bg-elevated)">
              <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: item.color }} />
              <div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{item.title}</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>{item.desc}</p></div>
            </div>
          ))}
        </div>
      </div></div>

      {/* GxP note */}
      <div className={clsx("flex items-start gap-2 p-4 rounded-xl border", "bg-(--info-bg) border-(--info)")}>
        <ShieldCheck className="w-4 h-4 text-[#6366f1] flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div><p className="text-[12px] font-medium text-[#6366f1]">GxP Signatory &mdash; separate from module access</p><p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Even with Full access to CAPA or FDA 483, users must have GxP Signatory toggle ON (Settings &rarr; Users) to electronically sign under 21 CFR Part 11.</p></div>
      </div>

      {/* Popups */}
      <Popup isOpen={resetConfirm !== null} variant="confirmation" title={`Reset ${ROLE_LABELS[resetConfirm ?? "viewer"]} permissions?`} description="This will restore default access levels for this role." onDismiss={() => setResetConfirm(null)} actions={[{ label: "Cancel", style: "ghost", onClick: () => setResetConfirm(null) }, { label: "Yes, reset", style: "primary", onClick: () => { if (resetConfirm) { dispatch(resetRolePermissions(resetConfirm)); auditLog({ action: "ROLE_PERMISSIONS_RESET", module: "settings", recordId: resetConfirm }); } setResetConfirm(null); setSavedPopup(true); } }]} />
      <Popup isOpen={savedPopup} variant="success" title="Permissions updated" description="Changes are live immediately." onDismiss={() => setSavedPopup(false)} />
    </div>
  );
}