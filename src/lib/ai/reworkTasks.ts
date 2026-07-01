/**
 * AI auto-task suggestion (improvement #1) — turns a QA rejection (and any
 * Document Review findings already on the stage) into discrete, assignable
 * rework tasks the Validation Lead can confirm + delegate in one pass.
 *
 * Deterministic and OFFLINE-SAFE: this is pure text analysis (no network, no
 * backend, no Date.now/Math.random), so it can never fail or block the reject→
 * rework flow. It mirrors the rubric the Document Review agent scores against
 * (src/lib/ai/mockData.ts → REVIEW_RUBRIC), so a suggestion's findingRef lines
 * up with the same rubric vocabulary an inspector would recognise. The backend
 * LLM can replace this later behind the same return shape — UI is unaffected.
 */

export interface ReworkTaskSuggestion {
  /** The instruction shown to (and editable by) the Lead before assigning. */
  message: string;
  /** Rubric item / rejection point this task traces back to (improvement #3). */
  findingRef?: string;
}

/** One Document Review finding the suggester can lift directly into a task. */
export interface ReviewFindingLike {
  title: string;
  rubricItem?: string;
}

export interface SuggestReworkInput {
  rejectionReason?: string | null;
  /** Findings from a Document Review run on the stage's latest doc, if any. */
  findings?: ReviewFindingLike[];
}

// Keyword → (clean instruction, rubric label). Ordered by how universally the
// issue matters so the strongest signals win when several keywords co-occur.
const KEYWORD_MAP: { re: RegExp; instruction: string; ref: string }[] = [
  { re: /signature|sign[- ]?off|signed|approval block/i, instruction: "Add the missing reviewer/approver signature block (name, role, date) per 21 CFR Part 11.", ref: "Approval signature block present" },
  { re: /\bsop\b|retired|superseded|effective version|reference 4\.2/i, instruction: "Update the SOP/document references to the current effective version.", ref: "SOP references cite current effective versions" },
  { re: /\bunit|units|measurement|°c|rpm|\bml\b/i, instruction: "Add measurement units to every recorded value in the results table.", ref: "Quantitative results carry measurement units" },
  { re: /blank|empty|missing result|not recorded|unfilled/i, instruction: "Record an observed result (or justified N/A) for every blank executed-test field.", ref: "No blank executed-result fields" },
  { re: /acceptance criteria|pass\/fail|criteria/i, instruction: "State measurable acceptance criteria for each test case that is missing them.", ref: "Each test case states acceptance criteria" },
  { re: /traceability|rtm|trace matrix/i, instruction: "Attach the requirements traceability matrix linking each requirement to its test.", ref: "Traceability matrix present" },
  { re: /checklist|installation|unchecked/i, instruction: "Complete every line of the installation verification checklist (check or mark N/A).", ref: "Installation checklist complete" },
  { re: /\brun\b|runs|performance run|consecutive/i, instruction: "Document the remaining required performance run(s) or justify reduced sampling.", ref: "Required performance runs documented" },
  { re: /revision history|version history|change summary/i, instruction: "Bring the revision history up to date with the latest change and date.", ref: "Revision history is current" },
  { re: /date|undated/i, instruction: "Date every signature on the approval page.", ref: "Signatures are dated" },
];

/** Split a free-text rejection reason into candidate rework items. Splits on
 *  bullet/line/semicolon boundaries first, then sentences; trims and dedupes. */
function splitReason(reason: string): string[] {
  const parts = reason
    .split(/[\n;•·]|(?:^|\s)[-*]\s+|(?<=[.!?])\s+/g)
    .map((s) => s.replace(/^[\s\-*•·]+/, "").trim())
    .filter((s) => s.length >= 4);
  // Dedupe (case-insensitive) preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out;
}

function mapKeyword(text: string): { instruction: string; ref: string } | null {
  for (const m of KEYWORD_MAP) if (m.re.test(text)) return { instruction: m.instruction, ref: m.ref };
  return null;
}

/**
 * Suggest rework tasks. Preference order:
 *   1. Live Document Review findings (most precise — one task per finding).
 *   2. The QA rejection reason, split into items and keyword-enriched.
 *   3. A single fallback task echoing the rejection reason.
 * Always returns at least one suggestion when given any input.
 */
export function suggestReworkTasks(input: SuggestReworkInput): ReworkTaskSuggestion[] {
  const out: ReworkTaskSuggestion[] = [];
  const seen = new Set<string>();
  const push = (message: string, findingRef?: string) => {
    const key = message.toLowerCase();
    if (key.length < 4 || seen.has(key)) return;
    seen.add(key);
    out.push({ message, findingRef });
  };

  // 1. Document Review findings → one task each (most precise).
  for (const f of input.findings ?? []) {
    const mapped = mapKeyword(`${f.title} ${f.rubricItem ?? ""}`);
    push(mapped ? mapped.instruction : `Resolve: ${f.title}`, f.rubricItem ?? mapped?.ref);
  }

  // 2. Rejection reason → split + keyword-enrich.
  const reason = (input.rejectionReason ?? "").trim();
  if (reason) {
    for (const item of splitReason(reason)) {
      const mapped = mapKeyword(item);
      if (mapped) push(mapped.instruction, mapped.ref);
      else push(item);
    }
  }

  // 3. Fallback — never return empty when there was input.
  if (out.length === 0 && reason) push(reason);
  return out;
}
