/**
 * Regulatory AI assistant — the answer engine behind the "Ask Regulatory AI"
 * button on Settings → Frameworks.
 *
 * LIVE-first: {@link askRegulatoryAI} sends the question (plus the tenant's
 * region, the asker's role, and the active frameworks) to the real AI backend
 * — the same GPT model the rest of the app uses, reached through the
 * /api/ai-proxy passthrough. The model answers from real regulatory knowledge,
 * not a canned script. If the backend is unreachable (offline dev, cold start,
 * network error), we fall back to the deterministic local knowledge base below
 * so the assistant still responds — exactly the robustness contract the rest of
 * the AI gateway uses (see ./index.ts). The `source` field tells the UI which
 * one answered ("live" vs "mock").
 *
 * Scope guardrail (matches RegulatoryIntelligencePage's advisory contract):
 * the assistant SUMMARISES and POINTS to clauses. It never interprets a
 * requirement or makes a compliance determination — that stays with
 * Regulatory Affairs. Every answer carries the advisory disclaimer.
 */

import { getRegulatoryIntelligence } from "./index";
import { aiChatSend, type ChatMessage } from "@/lib/aiChat";

/** Context the overlay passes on every ask — drives the grounding. */
export interface RegulatoryAIContext {
  /** Org regulatory region code, e.g. "FDA" | "EMA" | "CDSCO" | "WHO". */
  region: string;
  /** Display label for the asker's role, e.g. "QA Head". */
  roleLabel: string;
  /** Frameworks currently enabled in Settings → Frameworks. */
  activeFrameworks: { key: string; label: string }[];
  /** AI backend access token (user's aiAccessToken; backend is permissive). */
  token?: string | null;
  /** Prior turns, so the live model has conversational context. */
  history?: ChatMessage[];
}

export type RegulatoryAIConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface RegulatoryAISource {
  /** Clause / document reference, e.g. "21 CFR 211.194" or "FDA-2025-D-3210". */
  ref: string;
  /** Short human label for the source. */
  label: string;
}

export interface RegulatoryAIAnswer {
  /** Lead paragraph — plain language, scoped to the active context. */
  answer: string;
  /** Optional supporting points (clauses, steps, things to verify). */
  bullets: string[];
  /** Cited clauses / guidance refs. */
  sources: RegulatoryAISource[];
  confidence: RegulatoryAIConfidence;
  /** Framework labels this answer draws on (powers the chips under the answer). */
  relatedFrameworks: string[];
  /** Advisory disclaimer — always shown; RA interprets and decides. */
  disclaimer: string;
  /** Which engine produced this: the live model or the local fallback. */
  source: "live" | "mock";
}

const DISCLAIMER =
  "Advisory only. This is an AI summary that points to the relevant clauses — " +
  "it does not interpret requirements or make a compliance determination. " +
  "Regulatory Affairs must review and decide.";

/** Per-framework grounding: focus + the clauses the assistant can cite. */
interface FrameworkKnowledge {
  /** Lower-cased terms that map a question to this framework. */
  terms: string[];
  /** One-line description of what the framework governs. */
  focus: string;
  sources: RegulatoryAISource[];
  /** Talking points surfaced as answer bullets. */
  points: string[];
}

const KNOWLEDGE: Record<string, FrameworkKnowledge> = {
  p210: {
    terms: ["210", "211", "cgmp", "manufacturing", "production", "finished"],
    focus: "cGMP manufacturing controls for finished pharmaceuticals",
    sources: [
      { ref: "21 CFR 211.22", label: "Responsibilities of the quality control unit" },
      { ref: "21 CFR 211.100", label: "Written production & process controls" },
      { ref: "21 CFR 211.192", label: "Production record review & investigations" },
    ],
    points: [
      "The quality control unit must have written, approved procedures (211.22).",
      "Every deviation from a production procedure must be recorded and justified (211.100).",
      "Unexplained discrepancies trigger a documented investigation (211.192).",
    ],
  },
  p11: {
    terms: ["part 11", "11", "electronic record", "e-record", "signature", "e-sign", "esign", "audit trail"],
    focus: "electronic records & electronic signatures",
    sources: [
      { ref: "21 CFR 11.10", label: "Controls for closed systems" },
      { ref: "21 CFR 11.50", label: "Signature manifestations" },
      { ref: "21 CFR 11.70", label: "Signature/record linking" },
    ],
    points: [
      "Closed systems need validation, secure audit trails, and access controls (11.10).",
      "Each e-signature must show the signer's name, date/time, and meaning (11.50).",
      "Signatures must be permanently linked to their records — no copy/move (11.70).",
    ],
  },
  annex11: {
    terms: ["annex 11", "annex11", "computerised", "computerized", "computer system", "csv", "audit trail"],
    focus: "computerised systems used in GxP-regulated activities",
    sources: [
      { ref: "EU GMP Annex 11 §4", label: "Validation of computerised systems" },
      { ref: "EU GMP Annex 11 §9", label: "Audit trails" },
      { ref: "EU GMP Annex 11 §12", label: "Security & access control" },
    ],
    points: [
      "Systems must be validated for their intended use, risk-based (§4).",
      "A reviewable audit trail of GMP-relevant changes is required (§9).",
      "Access must be restricted by role and physically/logically controlled (§12).",
    ],
  },
  annex15: {
    terms: ["annex 15", "annex15", "qualification", "validation", "iq", "oq", "pq", "vmp", "commissioning"],
    focus: "qualification & validation (DQ/IQ/OQ/PQ, validation master plan)",
    sources: [
      { ref: "EU GMP Annex 15 §2", label: "Qualification stages (DQ/IQ/OQ/PQ)" },
      { ref: "EU GMP Annex 15 §3", label: "Re-qualification" },
    ],
    points: [
      "Qualification flows DQ → IQ → OQ → PQ, each with approved protocols (§2).",
      "A Validation Master Plan should define scope, responsibilities, and approach.",
      "Periodic re-qualification keeps validated state current (§3).",
    ],
  },
  ichq9: {
    terms: ["q9", "risk", "qrm", "risk management", "fmea", "hazard"],
    focus: "quality risk management (ICH Q9)",
    sources: [{ ref: "ICH Q9 (R1)", label: "Quality Risk Management principles" }],
    points: [
      "Risk evaluation should be based on scientific knowledge and patient protection.",
      "Document risk identification, analysis, evaluation, control, and review.",
      "Tool choice (FMEA, HACCP, risk ranking) should match the decision's complexity.",
    ],
  },
  ichq10: {
    terms: ["q10", "pqs", "quality system", "management review", "cape", "continual improvement"],
    focus: "the pharmaceutical quality system (ICH Q10)",
    sources: [{ ref: "ICH Q10", label: "Pharmaceutical Quality System" }],
    points: [
      "Management review must monitor process performance and product quality.",
      "CAPA, change management, and knowledge management are core PQS elements.",
      "Senior management is accountable for the effectiveness of the PQS.",
    ],
  },
  gamp5: {
    terms: ["gamp", "gamp 5", "gamp5", "category", "software validation", "supplier assessment"],
    focus: "risk-based computerised system validation (GAMP 5, 2nd Ed.)",
    sources: [{ ref: "GAMP 5 (2nd Ed.)", label: "Risk-based approach to GxP computerised systems" }],
    points: [
      "Validation depth scales with the software category (1/3/4/5) and risk.",
      "Leverage supplier documentation where a supplier assessment supports it.",
      "Critical thinking replaces one-size-fits-all testing of every requirement.",
    ],
  },
  who: {
    terms: ["who", "world health", "prequalification", "who gmp"],
    focus: "WHO GMP guidance for medicines",
    sources: [{ ref: "WHO TRS GMP", label: "WHO Good Manufacturing Practices" }],
    points: [
      "WHO GMP aligns broadly with PIC/S — useful where no single national authority governs.",
      "Common reference for prequalification and emerging-market supply.",
    ],
  },
  mhra: {
    terms: ["mhra", "data integrity", "alcoa", "di", "uk"],
    focus: "MHRA data-integrity expectations (ALCOA+)",
    sources: [{ ref: "MHRA GxP Data Integrity Guidance", label: "Data integrity definitions & expectations" }],
    points: [
      "Records must be Attributable, Legible, Contemporaneous, Original, Accurate (ALCOA), plus Complete, Consistent, Enduring, Available.",
      "Design systems so the right thing is the easy thing — review audit trails routinely.",
    ],
  },
};

/** Topic → framework keys, so questions that name a concept still ground out. */
const TOPIC_MAP: { terms: string[]; keys: string[] }[] = [
  { terms: ["audit trail"], keys: ["p11", "annex11", "mhra"] },
  { terms: ["signature", "e-sign", "esign", "sign-off"], keys: ["p11"] },
  { terms: ["validation", "qualification", "iq", "oq", "pq"], keys: ["annex15", "gamp5"] },
  { terms: ["computer", "computerised", "computerized", "software", "csv"], keys: ["annex11", "gamp5"] },
  { terms: ["risk"], keys: ["ichq9"] },
  { terms: ["data integrity", "alcoa"], keys: ["mhra", "p11"] },
  { terms: ["quality system", "management review", "pqs"], keys: ["ichq10"] },
  { terms: ["manufacturing", "cgmp", "production"], keys: ["p210", "who"] },
];

/** Words that signal the user wants the latest guidance feed, not a clause. */
const SCAN_TERMS = ["new", "latest", "recent", "update", "change", "what's new", "whats new", "alert"];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** Resolve which framework keys a question touches (deduped, order-stable). */
function matchFrameworkKeys(q: string): string[] {
  const hits: string[] = [];
  for (const [key, k] of Object.entries(KNOWLEDGE)) {
    if (includesAny(q, k.terms)) hits.push(key);
  }
  for (const topic of TOPIC_MAP) {
    if (includesAny(q, topic.terms)) {
      for (const key of topic.keys) if (!hits.includes(key)) hits.push(key);
    }
  }
  return hits;
}

/**
 * Build the message sent to the live backend. The backend classifies this and,
 * for regulatory questions, uses it as the WEB SEARCH query and adds its own
 * regulatory system prompt — so we keep the user's actual question FIRST
 * (clean for both classification and search) and append only a compact context
 * note (region + frameworks), which also sharpens the web search.
 */
function buildLivePrompt(question: string, ctx: RegulatoryAIContext): string {
  const parts = [question.trim()];
  const bits: string[] = [];
  if (ctx.region && ctx.region.toLowerCase() !== "your region") {
    bits.push(`regulatory region: ${ctx.region}`);
  }
  const fw = ctx.activeFrameworks.map((f) => f.label).join(", ");
  if (fw) bits.push(`applicable frameworks: ${fw}`);
  if (bits.length) parts.push(`(Context — ${bits.join("; ")}.)`);
  return parts.join("\n");
}

/**
 * Answer a regulatory question. Tries the LIVE AI backend first (real model
 * knowledge, grounded with the tenant context); on any failure it degrades to
 * the local knowledge base so the assistant never goes dark.
 */
export async function askRegulatoryAI(
  question: string,
  context: RegulatoryAIContext,
): Promise<RegulatoryAIAnswer> {
  const q0 = question.trim();
  if (!q0) return mockRegulatoryAnswer(question, context);

  // ── Live model first ──
  try {
    const res = await aiChatSend(
      buildLivePrompt(q0, context),
      context.history ?? [],
      context.token ?? "anonymous",
    );
    const text = (res.reply ?? "").trim();
    if (text) {
      return {
        answer: text,
        bullets: [],
        sources: [],
        // Confidence is a mock-only signal; the live pill is shown instead.
        confidence: "HIGH",
        relatedFrameworks: context.activeFrameworks.map((f) => f.label),
        disclaimer: DISCLAIMER,
        source: "live",
      };
    }
    // Empty reply — fall through to the local knowledge base.
  } catch (e) {
    console.warn(
      "[regulatory-ai] live backend unavailable — answering from the local knowledge base.",
      e,
    );
  }

  return mockRegulatoryAnswer(question, context);
}

/**
 * Local, deterministic fallback. Context-aware — grounded in the tenant's
 * active frameworks, region, and the asker's role. Used only when the live
 * backend can't be reached.
 */
async function mockRegulatoryAnswer(
  question: string,
  context: RegulatoryAIContext,
): Promise<RegulatoryAIAnswer> {
  const q = question.trim().toLowerCase();
  const activeKeys = new Set(context.activeFrameworks.map((f) => f.key));
  const labelFor = (key: string) =>
    context.activeFrameworks.find((f) => f.key === key)?.label ??
    DEFAULT_LABELS[key] ??
    key;

  // ── Intent: "what's new?" → run the guidance scan and summarise. ──
  if (includesAny(q, SCAN_TERMS)) {
    // Visible loading shim handled by the caller; the scan adds its own.
    const scan = await getRegulatoryIntelligence();
    const total = scan.updates.length;
    const newReqs = scan.updates.filter((u) => u.isNewRequirement).length;
    const high = scan.updates.filter((u) => u.impact === "high").length;
    const top = scan.updates.slice(0, 3);
    return {
      answer:
        total === 0
          ? `No new guidance is flagged for ${context.region} right now. The agent monitors FDA, EMA, ICH, and MHRA feeds; re-scan later or ask about a specific framework.`
          : `I scanned the agency feeds for your ${context.region} region and found ${total} guidance update${total > 1 ? "s" : ""} — ${newReqs} flagged as new requirement${newReqs === 1 ? "" : "s"} and ${high} high-impact. The most relevant are below; open Review guidance for the full list and suggested alignment.`,
      bullets: top.map(
        (u) => `${u.source} · ${u.docRef} — ${u.title} (${u.impact} impact)`,
      ),
      sources: top.map((u) => ({ ref: u.docRef, label: u.title })),
      confidence: total > 0 ? "MEDIUM" : "LOW",
      relatedFrameworks: [],
      disclaimer: DISCLAIMER,
      source: "mock",
    };
  }

  // ── Intent: clause / framework question. ──
  const matched = matchFrameworkKeys(q);

  if (matched.length === 0) {
    // No framework keyword — answer generally, anchored to active context.
    const activeLabels = context.activeFrameworks.map((f) => f.label);
    return {
      answer:
        activeLabels.length > 0
          ? `For your ${context.region} region you currently have ${activeLabels.length} framework${activeLabels.length > 1 ? "s" : ""} enabled: ${activeLabels.join(", ")}. Ask me about any of them — for example, audit-trail expectations, e-signature rules, validation stages, or what guidance is new this period.`
          : `No frameworks are enabled yet for your ${context.region} region. Turn on the frameworks that apply (e.g. FDA 21 CFR Part 11, EU GMP Annex 11) and I can give clause-level guidance grounded in them.`,
      bullets: [
        "Try: \"What are the audit-trail requirements?\"",
        "Try: \"How do e-signatures need to work under Part 11?\"",
        "Try: \"What's new in FDA/EMA guidance?\"",
      ],
      sources: [],
      confidence: "LOW",
      relatedFrameworks: activeLabels,
      disclaimer: DISCLAIMER,
      source: "mock",
    };
  }

  // Prefer frameworks that are actually enabled; note inactive ones.
  const active = matched.filter((k) => activeKeys.has(k));
  const inactive = matched.filter((k) => !activeKeys.has(k));
  const primary = (active.length > 0 ? active : matched).slice(0, 2);

  const bullets: string[] = [];
  const sources: RegulatoryAISource[] = [];
  for (const key of primary) {
    const k = KNOWLEDGE[key];
    bullets.push(...k.points);
    sources.push(...k.sources);
  }

  const focusList = primary.map((k) => `${labelFor(k)} (${KNOWLEDGE[k].focus})`);
  const roleNote = roleHint(context.roleLabel);

  let answer =
    `Here's what applies under ${focusList.join(" and ")} for your ${context.region} region. ` +
    roleNote;

  if (active.length === 0 && inactive.length > 0) {
    answer +=
      ` Note: ${primary.map(labelFor).join(", ")} ${primary.length > 1 ? "are" : "is"} not enabled in Settings → Frameworks yet, so this is general guidance — enable ${primary.length > 1 ? "them" : "it"} to activate gap tags and AGI rules.`;
  }

  return {
    answer,
    bullets: dedupe(bullets).slice(0, 6),
    sources: dedupeSources(sources).slice(0, 5),
    confidence: active.length > 0 ? "HIGH" : "MEDIUM",
    relatedFrameworks: primary.map(labelFor),
    disclaimer: DISCLAIMER,
    source: "mock",
  };
}

/** Role-aware closing sentence so the answer feels addressed to the asker. */
function roleHint(roleLabel: string): string {
  const r = roleLabel.toLowerCase();
  if (r.includes("regulatory")) return "As Regulatory Affairs, you'd own the interpretation and the formal determination.";
  if (r.includes("qa")) return "From a QA standpoint, focus on the procedure, evidence, and review trail.";
  if (r.includes("csv") || r.includes("val")) return "For CSV/validation work, tie each point back to your validation protocols and traceability.";
  if (r.includes("it") || r.includes("cdo")) return "On the IT side, the access-control and audit-trail points are the ones to wire up.";
  return "Use the cited clauses as your starting point and confirm against your SOPs.";
}

const DEFAULT_LABELS: Record<string, string> = {
  p210: "FDA 21 CFR 210/211",
  p11: "FDA 21 CFR Part 11",
  annex11: "EU GMP Annex 11",
  annex15: "EU GMP Annex 15",
  ichq9: "ICH Q9",
  ichq10: "ICH Q10",
  gamp5: "GAMP 5",
  who: "WHO GMP",
  mhra: "MHRA Guidelines",
};

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function dedupeSources(arr: RegulatoryAISource[]): RegulatoryAISource[] {
  const seen = new Set<string>();
  return arr.filter((s) => (seen.has(s.ref) ? false : (seen.add(s.ref), true)));
}
