/**
 * ROLE-BASED DASHBOARD — derived list builders (Phases 6, 7 and 8).
 *
 * Pure functions that turn the dataset's record arrays into the presentation-ready
 * lists the rail widgets render: alerts, pending tasks and the compliance-status
 * board.
 *
 * TWO INVARIANTS hold throughout:
 *
 *   1. RECORD ROWS COME ONLY FROM THE VISIBILITY-SCOPED ARRAYS. An alert names a
 *      real record (its requirement text, title or reference) and links to it, so
 *      it must never be built from the tenant-wide aggregate arrays. Aggregate
 *      arrays feed COUNTS only. This is the same split `app/(app)/page.tsx`
 *      already documents as decision #5.
 *
 *   2. EVERY LINK IS PERMISSION-CHECKED. `canOpen(module)` is passed in from the
 *      resolved access context; a row whose module is denied keeps its text but
 *      loses its href, so a role can never be navigated into a module its route
 *      guard would redirect away from.
 *
 * No React, no Redux, no I/O.
 */

import { isOverdue } from "@/types/capa";
import { normalizeSeverityForDisplay } from "@/lib/severity";
import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { Finding } from "@/store/findings.slice";
import type { GxPSystem } from "@/types/csv-csa";
import type { ActionPlanItem } from "../ActionPlanTable";
import type { AlertEntry, ComplianceLine, PendingTaskEntry } from "./dataset";

/** Modules a dashboard row can point at — matched to the app's real routes. */
export type LinkModule =
  | "gap" | "capa" | "deviation" | "csv" | "fda483" | "evidence"
  | "governance" | "readiness" | "audit-trail" | "settings";

/** "May this viewer open that module?" — supplied by the access context. */
export type CanOpen = (module: LinkModule) => boolean;

/** Truncate free text for a one-line row without cutting mid-word where possible. */
export function truncate(text: string, max = 64): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** A record's display handle: its human reference, else a short id slice. */
const handleOf = (reference: string | undefined, id: string) =>
  reference ?? `#${id.slice(-6)}`;

/* ══════════════════════════════════════════════════════════════════════════
 * PHASE 7/8 — Alerts, role-filtered
 * ══════════════════════════════════════════════════════════════════════════ */

export interface AlertInput {
  /** VISIBILITY-SCOPED — an alert names a record, so it must be openable. */
  findings: Finding[];
  capas: CAPA[];
  deviations: Deviation[];
  systems: GxPSystem[];
  /** Role focus area; when set, alerts narrow to records in that area. */
  focusArea?: string;
  canOpen: CanOpen;
  now: number;
  limit?: number;
}

/**
 * Records that need a decision NOW, most severe first. Every alert is one real
 * record — never an aggregate — so the row can be opened and acted on.
 */
export function buildAlerts({
  findings, capas, deviations, systems, focusArea, canOpen, now, limit = 6,
}: AlertInput): AlertEntry[] {
  const inArea = (area: string) => !focusArea || area === focusArea;
  const alerts: AlertEntry[] = [];

  for (const c of capas) {
    if (!isOverdue({ status: c.status, dueDate: c.dueDate })) continue;
    const days = Math.floor((now - new Date(c.dueDate).getTime()) / 86_400_000);
    alerts.push({
      id: `capa-overdue-${c.id}`,
      severity: c.risk === "Critical" || c.risk === "High" ? "critical" : "warning",
      title: `CAPA ${days} day${days === 1 ? "" : "s"} overdue`,
      detail: `${handleOf(c.reference, c.id)} · ${truncate(c.description, 52)}`,
      href: canOpen("capa") ? `/capa/${c.id}` : null,
      module: "capa",
    });
  }

  for (const f of findings) {
    if (f.severity !== "Critical" || f.status === "Closed" || !inArea(f.area)) continue;
    alerts.push({
      id: `finding-critical-${f.id}`,
      severity: "critical",
      title: "Critical finding open",
      detail: `${handleOf(f.reference, f.id)} · ${truncate(f.requirement, 52)}`,
      href: canOpen("gap") ? `/gap-assessment?open=${f.id}` : null,
      module: "gap",
    });
  }

  for (const d of deviations) {
    if (d.status === "closed" || d.status === "rejected" || !inArea(d.area)) continue;
    const critical = normalizeSeverityForDisplay(d.severity, "fda") === "Critical";
    const late = d.dueDate && new Date(d.dueDate).getTime() < now;
    if (!critical && !late) continue;
    alerts.push({
      id: `dev-${d.id}`,
      severity: critical ? "critical" : "warning",
      title: critical ? "Critical deviation open" : "Deviation past due",
      detail: `${handleOf(d.reference, d.id)} · ${truncate(d.title, 52)}`,
      href: canOpen("deviation") ? `/deviation?open=${d.id}` : null,
      module: "deviation",
    });
  }

  for (const s of systems) {
    const drifting =
      s.validationStatus === "Overdue" ||
      s.part11Status === "Non-Compliant" ||
      s.annex11Status === "Non-Compliant";
    const highRiskUnvalidated = s.riskLevel === "HIGH" && s.validationStatus !== "Validated";
    if (!drifting && !highRiskUnvalidated) continue;
    alerts.push({
      id: `sys-${s.id}`,
      severity: highRiskUnvalidated ? "critical" : "warning",
      title: highRiskUnvalidated ? "HIGH-risk system not validated" : "Validation drift",
      detail: `${s.reference ?? ""} ${truncate(s.name, 48)}`.trim(),
      href: canOpen("csv") && s.reference ? `/csv-csa/systems/${s.reference}` : null,
      module: "csv",
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, limit);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Pending tasks — work addressed to THIS user
 * ══════════════════════════════════════════════════════════════════════════
 * Sourced from the `Worklist` the server already builds for the signed-in user
 * (assigned CAPA action items, deviation tasks, CSV stage rework, assigned gap
 * findings). Its authorisation is the strongest in the app — every row is pinned to
 * `ownerId/assigneeId === userId` in the query — so this widget is safe for every
 * role and is empty by construction for a `viewer` (isAssignedToTask hard-stops it).
 */

export interface WorklistLike {
  assignedActions: { id: string; description: string; status: string; dueDate: string | null; capa?: { reference?: string | null } | null }[];
  deviationTasks: { id: string; message: string; status: string; dueDate: string | null; deviation?: { reference?: string | null; title?: string } | null }[];
  stageTasks: { id: string; message: string; status: string; dueDate: string | null; systemName?: string | null; stageKey?: string | null }[];
  assignedFindings: { id: string; reference: string | null; requirement: string; status: string; targetDate: string | null }[];
}

const ACTIVE_TASK_STATUSES = new Set(["pending", "in_progress", "rework", "submitted"]);

export function buildPendingTasks(
  worklist: WorklistLike | null | undefined,
  now: number,
  limit = 6,
): PendingTaskEntry[] {
  if (!worklist) return [];
  const tasks: PendingTaskEntry[] = [];
  const push = (
    id: string, title: string, context: string,
    dueDate: string | null, status: string, href: string,
  ) => {
    tasks.push({
      id, title, context, dueDate, status,
      overdue: Boolean(dueDate) && new Date(dueDate!).getTime() < now,
      href,
    });
  };

  for (const a of worklist.assignedActions) {
    if (!ACTIVE_TASK_STATUSES.has(a.status)) continue;
    push(`act-${a.id}`, truncate(a.description, 56), `CAPA action · ${a.capa?.reference ?? ""}`.trim(),
      a.dueDate, a.status, "/worklist");
  }
  for (const t of worklist.deviationTasks) {
    if (!ACTIVE_TASK_STATUSES.has(t.status)) continue;
    push(`devtask-${t.id}`, truncate(t.message || t.deviation?.title || "Deviation task", 56),
      `Deviation · ${t.deviation?.reference ?? ""}`.trim(), t.dueDate, t.status, "/worklist");
  }
  for (const t of worklist.stageTasks) {
    if (!ACTIVE_TASK_STATUSES.has(t.status)) continue;
    push(`stage-${t.id}`, truncate(t.message || "Validation rework", 56),
      `CSV ${t.stageKey ?? "stage"} · ${t.systemName ?? ""}`.trim(), t.dueDate, t.status, "/worklist");
  }
  for (const f of worklist.assignedFindings) {
    if (f.status === "Closed") continue;
    push(`find-${f.id}`, truncate(f.requirement, 56), `Gap finding · ${f.reference ?? ""}`.trim(),
      f.targetDate, f.status, "/worklist");
  }

  // Overdue first, then soonest due; undated tasks last.
  return tasks
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, limit);
}

/* ══════════════════════════════════════════════════════════════════════════
 * 90-day action plan
 * ══════════════════════════════════════════════════════════════════════════
 * Carried over from the original dashboard with three changes:
 *   • It is now a PURE function, so the page can memoise it. Previously it was an
 *     un-memoised IIFE that re-sorted on every render and did a `findings.find()`
 *     INSIDE a forEach (O(n·m)); the CAPA→finding lookup is an index here.
 *   • Rows narrow to the role's `focusArea` when it has one, so a QC Lab Director's
 *     plan is lab work rather than the whole tenant's.
 *   • CSV roadmap activities are still read (unchanged), and FDA 483 commitments are
 *     added — real dated obligations that the old plan never surfaced.
 * Every row is drawn from a VISIBILITY-SCOPED array, so a row is always a record the
 * viewer can open on its module page.
 */

/** CSV roadmap activity shape (the `useTenantData().roadmap` entity). */
export interface RoadmapLike {
  id: string;
  title: string;
  status: string;
  endDate: string;
  owner: string;
  systemId?: string | null;
}

/** 483 commitment rows, flattened from the events the viewer may see. */
export interface CommitmentLike {
  id: string;
  description: string;
  owner?: string | null;
  status: string;
  dueDate?: string | Date | null;
  eventReference?: string | null;
}

export interface ActionPlanInput {
  findings: Finding[];
  capas: CAPA[];
  systems: GxPSystem[];
  roadmap: RoadmapLike[];
  commitments: CommitmentLike[];
  /** CAPA rows appear only for a CAPA-module role (CAPA_MODULE_VIEW_ROLES). */
  includeCAPAs: boolean;
  /** Narrow to one GxP area when the role owns one. */
  focusArea?: string;
  now: number;
}

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function buildActionPlan({
  findings, capas, systems, roadmap, commitments, includeCAPAs, focusArea, now,
}: ActionPlanInput): ActionPlanItem[] {
  const items: ActionPlanItem[] = [];
  const inArea = (area: string) => !focusArea || area === focusArea;

  for (const f of findings) {
    if (f.status === "Closed") continue;
    if (f.severity !== "Critical" && f.severity !== "High") continue;
    if (!inArea(f.area)) continue;
    items.push({
      id: f.id, priority: f.severity, area: f.area, action: truncate(f.requirement, 60),
      owner: f.owner, dueDate: f.targetDate ?? "", status: f.status,
      module: "gap-assessment", refId: f.id,
      agiRisk: f.severity === "Critical" ? "High" : "Medium",
    });
  }

  if (includeCAPAs) {
    // Index the findings ONCE — the old code re-scanned the whole array per CAPA.
    const findingById = new Map(findings.map((f) => [f.id, f]));
    const overdue = capas.filter((c) => isOverdue({ status: c.status, dueDate: c.dueDate }));
    for (const c of overdue.slice(0, 5)) {
      const linked = c.findingId ? findingById.get(c.findingId) : undefined;
      const area = linked?.area
        ?? (c.source === "483" ? "Regulatory" : c.source === "Deviation" ? "Manufacturing" : "QMS");
      if (!inArea(area)) continue;
      items.push({
        id: c.id, priority: c.risk, area, action: truncate(c.description, 60),
        owner: c.owner, dueDate: c.dueDate, status: c.status,
        module: "capa", refId: c.id,
        agiRisk: c.risk === "Critical" ? "High" : "Medium",
      });
    }
  }

  // Systems have no area column — they belong to CSV/IT, so an area-scoped role only
  // sees them when that IS its area.
  if (inArea("CSV/IT")) {
    const atRisk = systems.filter((s) => s.riskLevel === "HIGH" && s.validationStatus !== "Validated");
    for (const s of atRisk.slice(0, 3)) {
      items.push({
        id: s.id, priority: "High", area: "CSV/IT",
        action: `Validate ${s.name} — ${s.validationStatus}`,
        owner: s.owner, dueDate: s.nextReview ?? "", status: s.validationStatus,
        module: "csv-csa", refId: s.id, agiRisk: "High",
      });
    }
    const systemById = new Map(systems.map((s) => [s.id, s]));
    for (const a of roadmap) {
      if (a.status === "Complete") continue;
      const end = new Date(a.endDate).getTime();
      if (Number.isNaN(end) || end - now > 90 * 86_400_000) continue;
      const sys = a.systemId ? systemById.get(a.systemId) : undefined;
      items.push({
        id: a.id, priority: "High", area: "CSV/IT",
        action: `${a.title}${sys ? ` — ${sys.name}` : ""}`,
        owner: a.owner, dueDate: a.endDate, status: a.status,
        module: "csv-csa", refId: a.systemId ?? a.id, agiRisk: "High",
      });
    }
  }

  // 483 commitments — dated obligations to the agency, always in the Regulatory area.
  if (inArea("Regulatory")) {
    for (const c of commitments) {
      if (c.status === "Complete" || c.status === "Closed") continue;
      const due = c.dueDate ? new Date(c.dueDate instanceof Date ? c.dueDate.toISOString() : c.dueDate).getTime() : NaN;
      if (Number.isNaN(due) || due - now > 90 * 86_400_000) continue;
      items.push({
        id: c.id, priority: due < now ? "Critical" : "High", area: "Regulatory",
        action: `${c.eventReference ? `${c.eventReference} — ` : ""}${truncate(c.description, 48)}`,
        owner: c.owner ?? "", dueDate: new Date(due).toISOString(), status: c.status,
        module: "fda-483", refId: c.id, agiRisk: due < now ? "High" : "Medium",
      });
    }
  }

  return items.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
      || (!a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate)),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Compliance status board
 * ══════════════════════════════════════════════════════════════════════════ */

export interface ComplianceInput {
  readinessScore: number;
  capaOverdueRate: number | null;
  trainingCompliance: number | null;
  criticalFindings: number;
  validationDrift: number;
  part11Gaps: number;
  overdueCommitments: number;
  /** Total registered systems — drives the "not measurable yet" state. */
  systemCount: number;
  /** Total 483 events — drives the "not measurable yet" state. */
  eventCount: number;
}

/** Bands a percentage where HIGHER is better. */
const upState = (p: number | null): ComplianceLine["state"] =>
  p === null ? "none" : p >= 90 ? "ok" : p >= 70 ? "watch" : "risk";
/** Bands a count where ZERO is the only clean state. */
const zeroState = (n: number): ComplianceLine["state"] => (n === 0 ? "ok" : n <= 2 ? "watch" : "risk");

/**
 * The named posture checks a compliance officer reads at a glance. Every line is
 * either a real measured value or an explicit "not measurable yet" — never a
 * default-to-green, which would misrepresent an unassessed tenant as compliant.
 */
export function buildComplianceLines(i: ComplianceInput): ComplianceLine[] {
  return [
    {
      key: "inspection-readiness",
      label: "Inspection readiness",
      value: `${i.readinessScore}%`,
      state: upState(i.readinessScore),
      detail: "Readiness-action completion across active inspections",
    },
    {
      key: "capa-timeliness",
      label: "CAPA timeliness",
      value: i.capaOverdueRate === null ? "—" : `${100 - i.capaOverdueRate}%`,
      state: i.capaOverdueRate === null ? "none" : upState(100 - i.capaOverdueRate),
      detail: i.capaOverdueRate === null ? "No open CAPAs to measure" : "Open CAPAs still within due date",
    },
    {
      key: "training",
      label: "Training compliance",
      value: i.trainingCompliance === null ? "—" : `${i.trainingCompliance}%`,
      state: upState(i.trainingCompliance),
      detail: i.trainingCompliance === null ? "No training records logged" : "Assigned training completed",
    },
    {
      key: "critical-findings",
      label: "Critical findings",
      value: String(i.criticalFindings),
      state: zeroState(i.criticalFindings),
      detail: "Open Critical-severity gap findings",
    },
    {
      key: "validation",
      label: "Validation state",
      value: i.systemCount === 0 ? "—" : String(i.validationDrift),
      state: i.systemCount === 0 ? "none" : zeroState(i.validationDrift),
      detail: i.systemCount === 0 ? "No GxP systems registered" : "Systems in validation drift",
    },
    {
      key: "part11",
      label: "Part 11 posture",
      value: i.systemCount === 0 ? "—" : String(i.part11Gaps),
      state: i.systemCount === 0 ? "none" : zeroState(i.part11Gaps),
      detail: i.systemCount === 0 ? "No GxP systems registered" : "Systems flagged non-compliant",
    },
    {
      key: "commitments",
      label: "Agency commitments",
      value: i.eventCount === 0 ? "—" : String(i.overdueCommitments),
      state: i.eventCount === 0 ? "none" : zeroState(i.overdueCommitments),
      detail: i.eventCount === 0 ? "No inspection events logged" : "Commitments past their due date",
    },
  ];
}
