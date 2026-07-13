"use client";

import { AlertTriangle } from "lucide-react";
import { Stepper } from "@/components/ui/Stepper";
import { roleLabel } from "@/lib/labels/roles";
import type { RoleMatrixRow } from "@/lib/roleLimits";

/**
 * Shared per-role caps editor body — used by BOTH the Configure modal (plan
 * defaults / existing tenants) and the Create Tenant modal (Tailored caps at
 * provisioning). Every role has a CONCRETE cap now (no ∞), edited with a – / +
 * Stepper clamped to [0, maxUsers].
 *
 * Controlled: the parent owns the number `draft` (role → cap) and reads
 * `deriveRoleCapsState(draft, rows, total)` for validity + the payload. Guards
 * (sum ≤ total; cap ≥ usage; cap ≤ maxUsers) are UX-only — the SERVER
 * (setTenantRoleLimits / setPlanRoleLimits) stays authoritative.
 */

export type RoleCapsDraft = Record<string, number>;
export type RoleCapsMap = Record<string, number | null>;

export interface RoleCapsDerived {
  /** role → cap number (concrete). */
  parsed: RoleCapsMap;
  /** Sum of the caps. */
  allocated: number;
  /** allocated !== total — caps must sum EXACTLY to the plan total. */
  notEqualTotal: boolean;
  /** Roles whose cap is below current usage (never fires at create — usage 0). */
  belowUsage: string[];
  /** Roles whose cap exceeds the plan total (defensive — the stepper clamps). */
  overMax: string[];
  /** Any guard tripped → the caller should block Save/Create. */
  blocked: boolean;
}

/** Pure derivation of the caps + the guards — used by the editor AND callers. */
export function deriveRoleCapsState(draft: RoleCapsDraft, rows: RoleMatrixRow[], total: number): RoleCapsDerived {
  const parsed: RoleCapsMap = {};
  const usedByRole = Object.fromEntries(rows.map((r) => [r.role, r.used]));
  const belowUsage: string[] = [];
  const overMax: string[] = [];
  let allocated = 0;
  for (const r of rows) {
    const cap = Math.max(0, Math.floor(draft[r.role] ?? 0));
    parsed[r.role] = cap;
    allocated += cap;
    if (cap < (usedByRole[r.role] ?? 0)) belowUsage.push(r.role);
    if (cap > total) overMax.push(r.role);
  }
  const notEqualTotal = allocated !== total;
  return { parsed, allocated, notEqualTotal, belowUsage, overMax, blocked: notEqualTotal || belowUsage.length > 0 || overMax.length > 0 };
}

/** Seed a numeric draft from matrix rows (unlimited → 0, a defensive fallback —
 *  post-seed every cap-eligible role carries a concrete cap). */
export function draftFromRows(rows: RoleMatrixRow[]): RoleCapsDraft {
  return Object.fromEntries(rows.map((r) => [r.role, r.cap === "unlimited" ? 0 : r.cap]));
}

/** Build rows from a caps map (create flow: prefill from plan-tier defaults). */
export function rowsFromCaps(caps: Record<string, number>): RoleMatrixRow[] {
  return Object.entries(caps).map(([role, cap]) => ({ role, cap, used: 0, remaining: cap }));
}

export interface RoleCapsEditorProps {
  rows: RoleMatrixRow[];
  /** Plan total (maxUsers) — the sum ceiling used by the sum==total guard. */
  total: number;
  draft: RoleCapsDraft;
  onDraftChange: (next: RoleCapsDraft) => void;
  /** Show the per-row "N of M used · K left" (off at create — no usage yet). */
  showUsage?: boolean;
  /** Show the "Allocated X / total" line inside the editor. */
  showAllocated?: boolean;
  /** Each stepper's max. Defaults to `total`; the TAILORED create flow passes a
   *  per-role ceiling instead (its total is COMPUTED as Σ caps, not a bound). */
  perRoleMax?: number;
  disabled?: boolean;
}

export function RoleCapsEditor({ rows, total, draft, onDraftChange, showUsage = true, showAllocated = false, perRoleMax, disabled = false }: RoleCapsEditorProps) {
  const stepMax = perRoleMax ?? total;
  const st = deriveRoleCapsState(draft, rows, total);
  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--bg-border)" }}>
        {rows.map((r) => {
          const cap = Math.max(0, Math.floor(draft[r.role] ?? 0));
          const isBelow = st.belowUsage.includes(r.role);
          const remaining = Math.max(0, cap - r.used);
          return (
            <div key={r.role} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--bg-border)" }}>
              <span className="text-[12px] font-medium flex-1 min-w-0 text-(--text-primary)">{roleLabel(r.role)}</span>
              {showUsage && (
                <span className="text-[11px] tabular-nums text-right whitespace-nowrap" style={{ color: isBelow ? "var(--danger)" : "var(--text-muted)" }}>
                  {r.used} of {cap} used · {remaining} left
                </span>
              )}
              <Stepper
                value={cap}
                min={0}
                max={stepMax}
                disabled={disabled}
                invalid={isBelow}
                ariaLabel={`${roleLabel(r.role)} cap`}
                onChange={(v) => onDraftChange({ ...draft, [r.role]: v })}
              />
            </div>
          );
        })}
      </div>

      {showAllocated && (
        <p className="text-[11px]" style={{ color: st.notEqualTotal ? "var(--danger)" : "var(--success)" }}>
          Allocated <span className="font-semibold tabular-nums">{st.allocated}</span> / {total}
          {st.notEqualTotal
            ? ` — must equal Max Users (${st.allocated > total ? "over" : "under"} by ${Math.abs(total - st.allocated)})`
            : " — fully allocated ✓"}
        </p>
      )}
      {st.belowUsage.length > 0 && (
        <p role="alert" className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--danger)" }}>
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          {st.belowUsage.map((role) => `${roleLabel(role)} is below its current usage`).join("; ")} — a cap can&apos;t be below users already in the role.
        </p>
      )}
    </div>
  );
}
