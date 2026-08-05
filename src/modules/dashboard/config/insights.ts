/**
 * ROLE-BASED DASHBOARD — contextual AI insights (Phase 6).
 *
 * The old dashboard built ONE insight list for every role and every AGI agent, then
 * linked all of it into /capa and /csv-csa regardless of permission. This module
 * replaces that with STREAMS: each role's config names the streams its AGI panel
 * draws from ("quality", "regulatory", "validation", …), and each stream is a pure
 * generator over the metrics that role actually owns.
 *
 * THREE RULES, all preserved from the original panel:
 *
 *   1. THIS IS NOT AN AI SURFACE. Every line is a deterministic threshold over
 *      the tenant's own records — no model, no backend AI call, nothing
 *      generated. It was previously branded and gated as if it were an AGI
 *      agent panel; that branding has been removed (see ComplianceSignalsWidget),
 *      with it the AGI-policy gate, which had no meaning for computed counts:
 *      switching AI agents to manual should not hide a count of overdue CAPAs.
 *
 *   2. EVERY INSIGHT IS EVIDENCED. Each line reports a count the tenant's own
 *      records produce, via the shared `src/lib/kpi` formulas. There is no
 *      generated prose, no sampled example, no placeholder.
 *
 *   3. LINKS ARE PERMISSION-CHECKED. An insight's action link is dropped (the text
 *      stays) when the viewer cannot open the target module, so an insight can
 *      never route a role into a redirect.
 *
 * `id` is a stable semantic slug, never derived from the text — a count moving from
 * 3 to 5 keeps the same React key so the card does not unmount/remount.
 */

import type { DashboardDataset } from "./dataset";
import type { CanOpen, LinkModule } from "./derive";
import type { AIInsightStream } from "./types";

export interface DashboardInsight {
  id: string;
  type: "warning" | "info" | "success";
  text: string;
  action?: string;
  href?: string;
  /** Module owning `href` — stripped by `permitInsights` when denied. */
  module?: LinkModule;
}

/** The AGI-policy shape the settings slice exposes (mode + per-agent toggles).
 *  Re-exported for consumers that still model it; this module no longer reads
 *  it — compliance signals are computed counts and are not gated on AI policy. */
export interface AgiPolicy {
  mode: string;
  agents: Record<string, boolean>;
}

const s = (n: number) => (n === 1 ? "" : "s");

/* ══════════════════════════════════════════════════════════════════════════
 * Stream generators — one per role concern
 * ══════════════════════════════════════════════════════════════════════════ */

type StreamFn = (d: DashboardDataset) => DashboardInsight[];

/** Organisation roll-up + licence/seat risk — Customer Admin. */
const organisationStream: StreamFn = (d) => {
  const out: DashboardInsight[] = [];
  const t = d.tenant;

  if (t.licenceExpired) {
    out.push({
      id: "licence-expired", type: "warning",
      text: t.planName
        ? `Subscription "${t.planName}" has expired — renew to keep tenant access uninterrupted.`
        : "No active subscription plan is assigned to this tenant.",
      action: "Review plan", href: "/settings", module: "settings",
    });
  } else if (t.licenceDaysRemaining !== null && t.licenceDaysRemaining <= 14) {
    out.push({
      id: "licence-expiring", type: "warning",
      text: `Subscription expires in ${t.licenceDaysRemaining} day${s(t.licenceDaysRemaining)}.`,
      action: "Review plan", href: "/settings", module: "settings",
    });
  }

  if (t.seatUtilisation !== null && t.seatUtilisation >= 90) {
    out.push({
      id: "seat-capacity", type: "warning",
      text: `${t.seatsUsed} of ${t.seatsTotal} licensed seats are in use (${t.seatUtilisation}%) — new users will be blocked at the cap.`,
      action: "Manage users", href: "/settings", module: "settings",
    });
  }

  if (t.activeSites === 0) {
    out.push({
      id: "no-sites", type: "warning",
      text: "No active sites are configured — site-scoped records and readiness cannot be attributed.",
      action: "Add sites", href: "/settings", module: "settings",
    });
  }

  if (t.modulesInUse === 0) {
    out.push({
      id: "no-adoption", type: "info",
      text: "No compliance records have been logged yet. Start with a gap assessment to establish a baseline.",
      action: "Open Gap Assessment", href: "/gap-assessment", module: "gap",
    });
  } else {
    const idle = t.moduleAdoption.filter((m) => m.records === 0);
    if (idle.length > 0) {
      out.push({
        id: "module-adoption-gap", type: "info",
        text: `${idle.length} module${s(idle.length)} has no records yet (${idle.slice(0, 2).map((m) => m.label).join(", ")}${idle.length > 2 ? "…" : ""}).`,
      });
    }
  }

  if (t.inactiveUsers > 0) {
    out.push({
      id: "inactive-users", type: "info",
      text: `${t.inactiveUsers} user account${s(t.inactiveUsers)} ${t.inactiveUsers === 1 ? "is" : "are"} inactive but still consuming licensed seats.`,
      action: "Manage users", href: "/settings", module: "settings",
    });
  }

  return out;
};

/** Deviation / CAPA / finding signals — QA Head, QA, and as a secondary elsewhere. */
const qualityStream: StreamFn = (d) => {
  const out: DashboardInsight[] = [];
  const q = d.quality;

  if (q.criticalFindings > 0) {
    out.push({
      id: "critical-findings", type: "warning",
      text: `${q.criticalFindings} critical finding${s(q.criticalFindings)} open — immediate attention required.`,
      action: "View findings", href: "/gap-assessment", module: "gap",
    });
  }
  if (q.overdueCAPAs > 0) {
    out.push({
      id: "overdue-capas", type: "warning",
      text: `${q.overdueCAPAs} CAPA${s(q.overdueCAPAs)} past due. Risk of an inspection finding.`,
      action: "View CAPAs", href: "/capa", module: "capa",
    });
  }
  if (q.criticalDeviations > 0) {
    out.push({
      id: "critical-deviations", type: "warning",
      text: `${q.criticalDeviations} critical deviation${s(q.criticalDeviations)} open — escalate for immediate investigation.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  if (q.awaitingInvestigation > 0) {
    out.push({
      id: "investigations-outstanding", type: "warning",
      text: `${q.awaitingInvestigation} deviation${s(q.awaitingInvestigation)} awaiting root-cause investigation.`,
      action: "Start investigation", href: "/deviation", module: "deviation",
    });
  }
  if (q.awaitingCapaDecision > 0) {
    out.push({
      id: "capa-decision-pending", type: "info",
      text: `${q.awaitingCapaDecision} investigated deviation${s(q.awaitingCapaDecision)} awaiting the QA CAPA decision.`,
      action: "Record decision", href: "/deviation", module: "deviation",
    });
  }
  if (q.recurrences > 0) {
    out.push({
      id: "recurrence-risk", type: "warning",
      text: `${q.recurrences} deviation${s(q.recurrences)} reported as a recurrence of a previously closed CAPA — effectiveness is in question.`,
      action: "Review CAPAs", href: "/capa", module: "capa",
    });
  }
  if (q.diExceptions > 0) {
    out.push({
      id: "di-gate-open", type: "warning",
      text: `${q.diExceptions} open DI gate CAPA${s(q.diExceptions)}. Data integrity unresolved.`,
      action: "View DI issues", href: "/capa", module: "capa",
    });
  }
  if (q.capaAwaitingQA > 0) {
    out.push({
      id: "capa-pending-qa", type: "info",
      text: `${q.capaAwaitingQA} CAPA${s(q.capaAwaitingQA)} awaiting QA sign-off.`,
      action: "Review", href: "/capa", module: "capa",
    });
  }
  if (q.training.compliance !== null && q.training.compliance < 90) {
    out.push({
      id: "training-shortfall", type: "warning",
      text: `Training compliance is ${q.training.compliance}% (${q.training.total - q.training.completed} record${s(q.training.total - q.training.completed)} outstanding).`,
      action: "Open training", href: "/readiness", module: "readiness",
    });
  }
  if (q.criticalFindings === 0 && q.overdueCAPAs === 0 && q.criticalDeviations === 0) {
    out.push({
      id: "all-clear", type: "success",
      text: "No critical findings, critical deviations or overdue CAPAs. Maintain current trajectory.",
    });
  }
  return out;
};

/** 483 deadlines, commitments and external guidance — Regulatory Affairs. */
const regulatoryStream: StreamFn = (d) => {
  const out: DashboardInsight[] = [];
  const r = d.regulatory;

  /* REMOVED — the "N new FDA/EMA regulatory requirements flagged" insight.
   *
   * It called regulatoryAlertSummary(), which counted a hardcoded six-item
   * guidance list in the browser bundle. Every tenant saw the same numbers,
   * forever, phrased as the result of a live agency scan.
   *
   * The drift equivalent (driftAlertSummary) was removed earlier for exactly
   * this reason. A real regulatory scan is asynchronous — it reads agency
   * guidance through an LLM — so it cannot be served from this synchronous
   * generator. The Regulatory Intelligence page (/regulatory-intelligence)
   * shows the live scan, badged with its own provenance.
   *
   * To restore a dashboard card here, thread a real scan result through
   * DashboardDataset — do not reintroduce a fixture.
   */

  if (r.overdueResponses > 0) {
    out.push({
      id: "483-response-overdue", type: "warning",
      text: `${r.overdueResponses} inspection response${s(r.overdueResponses)} past the agency deadline.`,
      action: "Open 483 events", href: "/fda-483", module: "fda483",
    });
  }
  if (r.responsesDueSoon > 0) {
    out.push({
      id: "483-response-due", type: "warning",
      text: `${r.responsesDueSoon} inspection response${s(r.responsesDueSoon)} due within 30 days.`,
      action: "Draft response", href: "/fda-483", module: "fda483",
    });
  }
  if (r.overdueCommitments > 0) {
    out.push({
      id: "commitments-overdue", type: "warning",
      text: `${r.overdueCommitments} commitment${s(r.overdueCommitments)} to the agency ${r.overdueCommitments === 1 ? "is" : "are"} past due.`,
      action: "Review commitments", href: "/fda-483", module: "fda483",
    });
  }
  if (r.openObservations > 0) {
    out.push({
      id: "observations-open", type: "info",
      text: `${r.openObservations} inspection observation${s(r.openObservations)} not yet closed out.`,
      action: "View observations", href: "/fda-483", module: "fda483",
    });
  }
  if (r.overdueReadinessActions > 0) {
    out.push({
      id: "readiness-actions-overdue", type: "warning",
      text: `${r.overdueReadinessActions} inspection-readiness action${s(r.overdueReadinessActions)} overdue.`,
      action: "Open readiness", href: "/readiness", module: "readiness",
    });
  }
  if (r.inspectionReadiness !== null && r.inspectionReadiness < 80) {
    out.push({
      id: "inspection-readiness-low", type: "warning",
      text: `Lowest active inspection readiness is ${r.inspectionReadiness}% — below the 80% ready threshold.`,
      action: "Open readiness", href: "/readiness", module: "readiness",
    });
  }
  if (r.regulatoryImpactDeviations > 0) {
    out.push({
      id: "regulatory-impact-deviations", type: "info",
      text: `${r.regulatoryImpactDeviations} open deviation${s(r.regulatoryImpactDeviations)} recorded a regulatory impact — assess reportability.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "regulatory-clear", type: "success",
      text: "No overdue agency responses or commitments. Regulatory position is current.",
    });
  }
  return out;
};

/** CSV drift, qualification gaps and periodic review — CSV Lead / IT-CDO. */
const validationStream: StreamFn = (d) => {
  const out: DashboardInsight[] = [];
  const v = d.validation;

  if (v.total === 0) {
    out.push({
      id: "no-systems", type: "info",
      text: "No GxP systems are registered — validation posture cannot be assessed.",
      action: "Register a system", href: "/csv-csa", module: "csv",
    });
    return out;
  }

  if (v.highRisk > 0) {
    out.push({
      id: "csv-high-risk-unvalidated", type: "warning",
      text: `${v.highRisk} HIGH-risk system${s(v.highRisk)} not yet validated — FDA inspection exposure.`,
      action: "View systems", href: "/csv-csa", module: "csv",
    });
  }
  // Validation drift, computed from the tenant's own system records via
  // isValidationDrift (@/lib/kpi). Unrelated to the Drift Detection AI agent
  // (/csv-csa), which reads the audit trail through an LLM — this used to be
  // gated on that agent's toggle, which conflated the two.
  if (v.drift > 0) {
    out.push({
      id: "drift-open", type: "warning",
      text: `${v.drift} system${s(v.drift)} showing validation drift — overdue revalidation or Part 11 / Annex 11 non-compliance.`,
      action: "Review drift", href: "/csv-csa", module: "csv",
    });
  }
  if (v.overdue > 0) {
    out.push({
      id: "validation-overdue", type: "warning",
      text: `${v.overdue} system${s(v.overdue)} with overdue validation.`,
      action: "View systems", href: "/csv-csa", module: "csv",
    });
  }
  if (v.periodicReviewOverdue > 0) {
    out.push({
      id: "periodic-review-overdue", type: "warning",
      text: `${v.periodicReviewOverdue} system${s(v.periodicReviewOverdue)} with periodic review overdue.`,
      action: "View systems", href: "/csv-csa", module: "csv",
    });
  }
  if (v.periodicReviewDueSoon > 0) {
    out.push({
      id: "periodic-review-due", type: "info",
      text: `${v.periodicReviewDueSoon} periodic review${s(v.periodicReviewDueSoon)} due within 30 days.`,
      action: "Plan reviews", href: "/csv-csa", module: "csv",
    });
  }
  if (v.part11NonCompliant > 0 || v.annex11NonCompliant > 0) {
    out.push({
      id: "part11-gaps", type: "warning",
      text: `${v.part11NonCompliant} Part 11 and ${v.annex11NonCompliant} Annex 11 non-compliance${v.annex11NonCompliant === 1 ? "" : "s"} recorded.`,
      action: "Review compliance", href: "/csv-csa", module: "csv",
    });
  }
  if (v.qualificationProgress !== null && v.qualificationProgress < 80 && v.stagesTotal > 0) {
    out.push({
      id: "qualification-behind", type: "info",
      text: `Qualification is ${v.qualificationProgress}% complete (${v.stagesTotal - v.stagesApproved} stage${s(v.stagesTotal - v.stagesApproved)} not yet approved).`,
      action: "Open lifecycle", href: "/csv-csa", module: "csv",
    });
  }
  if (out.length === 0) {
    out.push({
      id: "validation-clear", type: "success",
      text: `All ${v.total} registered system${s(v.total)} ${v.total === 1 ? "is" : "are"} validated with no drift detected.`,
    });
  }
  return out;
};

/** Area-scoped generator shared by the laboratory and operations streams. */
function areaInsights(d: DashboardDataset, prefix: string): DashboardInsight[] {
  const out: DashboardInsight[] = [];
  const a = d.area;
  if (!a) return out;

  if (a.criticalDeviations > 0) {
    out.push({
      id: `${prefix}-critical-deviations`, type: "warning",
      text: `${a.criticalDeviations} critical ${a.area} deviation${s(a.criticalDeviations)} open.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  if (a.awaitingInvestigation > 0) {
    out.push({
      id: `${prefix}-investigations`, type: "warning",
      text: `${a.awaitingInvestigation} ${a.area} deviation${s(a.awaitingInvestigation)} awaiting root-cause investigation.`,
      action: "Start investigation", href: "/deviation", module: "deviation",
    });
  }
  if (a.criticalFindings > 0) {
    out.push({
      id: `${prefix}-critical-findings`, type: "warning",
      text: `${a.criticalFindings} critical ${a.area} finding${s(a.criticalFindings)} open.`,
      action: "View findings", href: "/gap-assessment", module: "gap",
    });
  }
  if (a.overdueCAPAs > 0) {
    out.push({
      id: `${prefix}-overdue-capas`, type: "warning",
      text: `${a.overdueCAPAs} ${a.area} CAPA${s(a.overdueCAPAs)} past due.`,
      action: "View CAPAs", href: "/capa", module: "capa",
    });
  }
  if (a.byCategory.length > 1) {
    const top = a.byCategory[0];
    out.push({
      id: `${prefix}-category-cluster`, type: "info",
      text: `"${top.category}" is the largest ${a.area} deviation cluster (${top.count} of ${a.openDeviations} open) — a shared root cause is likely.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  if (a.readiness.score !== null && a.readiness.score < 80) {
    out.push({
      id: `${prefix}-readiness`, type: "warning",
      text: `${a.area} readiness is ${a.readiness.percentage} — ${a.readiness.status.toLowerCase()}.`,
    });
  }
  if (out.length === 0) {
    out.push({
      id: `${prefix}-clear`, type: "success",
      text: `No critical ${a.area} deviations, findings or overdue CAPAs.`,
    });
  }
  return out;
}

/** QC Lab area signals — QC Lab Director. */
const laboratoryStream: StreamFn = (d) => {
  const out = areaInsights(d, "lab");
  const a = d.area;
  if (a && a.batchImpacting > 0) {
    out.push({
      id: "lab-batch-impact", type: "warning",
      text: `${a.batchImpacting} open ${a.area} deviation${s(a.batchImpacting)} record${a.batchImpacting === 1 ? "s" : ""} an affected batch — confirm disposition.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  return out;
};

/** Manufacturing area + change-control signals — Operations Head. */
const operationsStream: StreamFn = (d) => {
  const out = areaInsights(d, "ops");
  const a = d.area;
  const o = d.operations;

  if (a && a.batchImpacting > 0) {
    out.push({
      id: "ops-batch-impact", type: "warning",
      text: `${a.batchImpacting} open ${a.area} deviation${s(a.batchImpacting)} affect${a.batchImpacting === 1 ? "s" : ""} released or in-process batches.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  if (a && a.equipmentRelated > 0) {
    out.push({
      id: "ops-equipment", type: "info",
      text: `${a.equipmentRelated} open ${a.area} deviation${s(a.equipmentRelated)} attributed to equipment — check the maintenance programme.`,
      action: "View deviations", href: "/deviation", module: "deviation",
    });
  }
  if (o.changeControlsOverdue > 0) {
    out.push({
      id: "ops-cc-overdue", type: "warning",
      text: `${o.changeControlsOverdue} change control${s(o.changeControlsOverdue)} past the target implementation date.`,
    });
  }
  if (o.changeControlsHighRisk > 0) {
    out.push({
      id: "ops-cc-high-risk", type: "info",
      text: `${o.changeControlsHighRisk} high-risk change${s(o.changeControlsHighRisk)} in flight.`,
    });
  }
  return out;
};

const STREAMS: Record<AIInsightStream, StreamFn> = {
  organisation: organisationStream,
  quality: qualityStream,
  regulatory: regulatoryStream,
  validation: validationStream,
  laboratory: laboratoryStream,
  operations: operationsStream,
};

/* ══════════════════════════════════════════════════════════════════════════
 * Public builder
 * ══════════════════════════════════════════════════════════════════════════ */

export interface InsightInput {
  streams: readonly AIInsightStream[];
  data: DashboardDataset;
  canOpen: CanOpen;
  limit?: number;
}

/**
 * Build the role's compliance-signal list.
 *
 * SELECTION IS ROUND-ROBIN ACROSS STREAMS, and that is the important part.
 *
 * Concatenating streams and then slicing to `limit` lets a noisy primary stream bury
 * every secondary one: a QA Head on a busy tenant emits eight quality warnings, so a
 * 5-item rail would show ZERO regulatory or validation insight — including the
 * external FDA/EMA guidance alert, which is independent of tenant volume and must not
 * be crowded out (the original rail protected it with a hand-placed `push` first).
 *
 * Round-robin gives every configured stream its first slot before any stream gets a
 * second, so a role always sees each of its concerns represented. Slicing happens
 * BEFORE the type sort, so ordering the rail by severity cannot undo that
 * representation.
 *
 * Then: duplicates by `id` are collapsed, warnings float above info and success, and
 * a link the viewer cannot follow is stripped rather than rendered dead.
 */
export function buildInsights({
  streams, data, canOpen, limit = 5,
}: InsightInput): DashboardInsight[] {
  const perStream = streams.map((stream) => STREAMS[stream](data));
  const deepest = Math.max(0, ...perStream.map((s) => s.length));

  const collected: DashboardInsight[] = [];
  const seen = new Set<string>();
  for (let depth = 0; depth < deepest && collected.length < limit; depth++) {
    for (const stream of perStream) {
      if (collected.length >= limit) break;
      const insight = stream[depth];
      if (!insight || seen.has(insight.id)) continue;
      seen.add(insight.id);
      collected.push(insight);
    }
  }

  const rank = { warning: 0, info: 1, success: 2 } as const;
  return collected
    // Stable sort by type only — within a type, the round-robin order is preserved,
    // which keeps a role's primary concern at the top of its rail.
    .sort((a, b) => rank[a.type] - rank[b.type])
    .map((i) => (i.module && !canOpen(i.module) ? { ...i, action: undefined, href: undefined } : i));
}
