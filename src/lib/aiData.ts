/**
 * Client-side data-question layer for the Compliance Assistant chatbot.
 *
 * Two distinct question types reach the chatbot:
 *   - KNOWLEDGE  ("how do I close a CAPA?", "what is a deviation?") → answered by
 *     the grounded /api/ai/help endpoint, strictly from the SOP / app-guidance
 *     corpus, with citations + confidence.
 *   - LIVE DATA  ("how many open CAPAs?", "any overdue deviations?") → CANNOT be
 *     answered from the document corpus; they need the tenant's actual records.
 *
 * This module decides which is which (isDataQuestion) and turns a live
 * ComplianceSnapshot into a plain, factual answer (formatDataAnswer). It never
 * fabricates a number — every figure comes from getComplianceSnapshot(), which
 * reads the same Dashboard query the user already sees. Pure + client-safe (no
 * imports), so it stays out of the server-action bundle.
 */

/**
 * Live compliance counts the chatbot quotes. Defined here (a client-safe,
 * non-"use server" module) and imported by the getComplianceSnapshot server
 * action, so the action file exports only its async function.
 */
export interface ComplianceSnapshot {
  totalCAPAs: number;
  openCAPAs: number;
  overdueCAPAs: number;
  totalDeviations: number;
  openDeviations: number;
  criticalDeviations: number;
  totalFindings: number;
  openFindings: number;
  criticalFindings: number;
  totalEvents: number;
  overdueEvents: number;
  complianceScore: number;
  lowestReadiness: number;
}

/**
 * Procedural cues. If the question is a "how do I / what is / where / explain"
 * style ask, it is KNOWLEDGE — leave it to the grounded /help path even if it
 * also names a module ("how do I close a CAPA" contains "capa" but is a how-to).
 */
const PROCEDURAL =
  /\b(how do i|how to|how can i|how should|what is|what'?s|what are|why|where|who|which|explain|describe|steps?|guide|procedure|process for|tell me about|definition)\b/;

/** Quantity / aggregate cues that signal a data question. */
const COUNT_CUE =
  /\b(how many|how much|number of|count|counts|total|totals|do i have|are there|is there|breakdown|list|show me|score)\b/;

/** Overall-snapshot cues (no specific module needed). */
const OVERALL =
  /\b(summary|overview|overall|compliance (status|health|score|posture)|how am i doing|my (records|data|numbers)|everything|where do i stand)\b/;

const ENTITY = {
  capa: /\bcapas?\b/,
  deviation: /\bdeviations?\b|\bdevs?\b/,
  finding: /\bfindings?\b|\bgaps?\b|\bgap assessment\b/,
  event: /\b483s?\b|\bfda[ -]?483\b|\bobservations?\b/,
};

function entitiesIn(t: string): string[] {
  const out: string[] = [];
  if (ENTITY.capa.test(t)) out.push("capa");
  if (ENTITY.deviation.test(t)) out.push("deviation");
  if (ENTITY.finding.test(t)) out.push("finding");
  if (ENTITY.event.test(t)) out.push("event");
  return out;
}

/**
 * True when the message is a live-data / count question that should be answered
 * from the tenant's records rather than the SOP corpus.
 */
export function isDataQuestion(text: string): boolean {
  const t = text.toLowerCase();
  if (PROCEDURAL.test(t)) return false; // how-to / what-is → grounded /help
  const hasEntity =
    entitiesIn(t).length > 0 || /\bcompliance (score|health|status)\b|\breadiness\b/.test(t);
  if (COUNT_CUE.test(t) && hasEntity) return true;
  // "overdue" is unambiguously a data filter (never a how-to), so an entity +
  // "overdue" is a data question even without an explicit count word
  // ("any overdue deviations?").
  if (/\boverdue\b/.test(t) && hasEntity) return true;
  if (OVERALL.test(t)) return true;
  return false;
}

/**
 * Build a plain-text answer from the live snapshot. Honours qualifiers in the
 * question (open / overdue / closed / critical) and the module(s) named; with no
 * specific module it returns the overall compliance snapshot.
 */
export function formatDataAnswer(text: string, s: ComplianceSnapshot): string {
  const t = text.toLowerCase();
  const wantOpen = /\bopen\b/.test(t);
  const wantOverdue = /\boverdue\b/.test(t);
  const wantClosed = /\bclosed?\b/.test(t);
  const wantCritical = /\bcritical\b/.test(t);

  const capaLine = () => {
    if (wantOverdue) return `• CAPAs overdue: ${s.overdueCAPAs} (of ${s.totalCAPAs} total)`;
    if (wantClosed) return `• CAPAs closed: ${s.totalCAPAs - s.openCAPAs} (of ${s.totalCAPAs} total)`;
    if (wantOpen) return `• CAPAs open: ${s.openCAPAs} (of ${s.totalCAPAs} total)`;
    return `• CAPAs: ${s.totalCAPAs} total — ${s.openCAPAs} open, ${s.overdueCAPAs} overdue`;
  };
  const devLine = () => {
    if (wantCritical) return `• Deviations open & critical: ${s.criticalDeviations} (of ${s.totalDeviations} total)`;
    if (wantOpen) return `• Deviations open: ${s.openDeviations} (of ${s.totalDeviations} total)`;
    return `• Deviations: ${s.totalDeviations} total — ${s.openDeviations} open, ${s.criticalDeviations} open & critical`;
  };
  const findLine = () => {
    if (wantCritical) return `• Gap findings open & critical: ${s.criticalFindings} (of ${s.totalFindings} total)`;
    if (wantOpen) return `• Gap findings open: ${s.openFindings} (of ${s.totalFindings} total)`;
    return `• Gap findings: ${s.totalFindings} total — ${s.openFindings} open, ${s.criticalFindings} open & critical`;
  };
  const evtLine = () => {
    if (wantOverdue) return `• FDA 483 responses overdue: ${s.overdueEvents} (of ${s.totalEvents} total)`;
    return `• FDA 483 events: ${s.totalEvents} total — ${s.overdueEvents} response(s) overdue`;
  };

  const ents = entitiesIn(t);
  const lines: string[] = [];
  if (ents.includes("capa")) lines.push(capaLine());
  if (ents.includes("deviation")) lines.push(devLine());
  if (ents.includes("finding")) lines.push(findLine());
  if (ents.includes("event")) lines.push(evtLine());

  // No specific module (or an overall ask) → full snapshot.
  if (lines.length === 0) {
    lines.push(
      `• Compliance score: ${s.complianceScore}/100`,
      capaLine(),
      devLine(),
      findLine(),
      evtLine(),
    );
  }

  const header = lines.length > 1 ? "📊 Live data for your organisation:\n" : "📊 ";
  return (
    header +
    lines.join("\n") +
    "\n\nThese are live figures from your tenant's records (the same numbers as the Dashboard). " +
    "For procedure or how-to guidance, just ask — I'll cite the relevant SOP."
  );
}
