/**
 * Frontend catalog of the demo SOP / policy documents that the GxP Compliance
 * Help Assistant cites. The chatbot's answers come back with source links like
 * `/docs/sop-capa-002`; this is the data those links resolve against so the
 * deep-link opens the actual document instead of a 404.
 *
 * Source of truth for the *content* is the backend RAG corpus
 * (`pharma_glimmora_ai_backend/app/rag/dummy_docs.py`). These entries mirror
 * that corpus so the citation deep-links work even when the backend is down.
 * If you add/rename a doc there, mirror it here (slug = doc_id lower-cased).
 */

export interface SopDoc {
  /** Stable citation id / SOP number, e.g. "SOP-CAPA-002". */
  id: string;
  /** URL slug — the id lower-cased. The citation url is `/docs/<slug>`. */
  slug: string;
  /** Clause shown next to the id in the assistant's Sources list. */
  section: string;
  /** Document title. */
  title: string;
  /** Body, one entry per paragraph / step. Rendered in order. */
  body: string[];
}

const DOCS: SopDoc[] = [
  {
    id: "SOP-CAPA-001",
    slug: "sop-capa-001",
    section: "§1",
    title: "CAPA Overview",
    body: [
      "CAPA stands for Corrective and Preventive Action. It is a process used in quality management systems to identify, investigate, and eliminate the root causes of non-conformances.",
      "A Corrective Action addresses an existing problem to prevent recurrence. A Preventive Action addresses a potential problem before it occurs.",
      "CAPA is required by ISO 9001, FDA 21 CFR Part 820, and other quality standards.",
      "Every CAPA must have a problem statement, root cause analysis, action plan, and effectiveness check before it can be closed.",
    ],
  },
  {
    id: "SOP-CAPA-002",
    slug: "sop-capa-002",
    section: "§2 Creation",
    title: "How to Create a CAPA",
    body: [
      "Step 1: Identify the problem — write a clear problem statement describing what happened, where, when, and how many times.",
      "Step 2: Set the severity — classify as Critical, Major, or Minor based on its impact on product quality or patient safety.",
      "Step 3: Assign a source — choose from Customer Complaint, Internal Audit, Supplier Issue, Process Deviation, or Management Review.",
      "Step 4: Identify the area affected — select the department or process area.",
      "Step 5: Submit the CAPA — the system assigns a unique CAPA ID and sets status to Open automatically.",
    ],
  },
  {
    id: "SOP-CAPA-003",
    slug: "sop-capa-003",
    section: "§2.1 Severity",
    title: "CAPA Severity Levels",
    body: [
      "Critical: Directly impacts patient safety or regulatory compliance. Must be addressed within 30 days.",
      "Major: Significantly affects product quality but no immediate safety risk. Must be addressed within 60 days.",
      "Minor: Low-impact issues unlikely to affect product quality. Must be addressed within 90 days.",
    ],
  },
  {
    id: "SOP-RCA-005",
    slug: "sop-rca-005",
    section: "§3 Methods",
    title: "RCA Process — Root Cause Analysis",
    body: [
      "Root Cause Analysis (RCA) identifies the fundamental cause of a problem.",
      "Supported RCA methods in Glimmora:",
      "• 5 Why Analysis: Ask Why five times to drill down to the root cause.",
      "• Fishbone Diagram: Categorize causes into Man, Machine, Material, Method, Environment.",
      "• Fault Tree Analysis: Top-down logic diagram to trace failure paths.",
      "A good RCA must include root cause statement, contributing factors, supporting evidence, and recurrence risk assessment.",
      "RCA quality is scored by AI on a scale of 0 to 10. Score above 7 is acceptable.",
    ],
  },
  {
    id: "SOP-RCA-006",
    slug: "sop-rca-006",
    section: "§3.5 Recurrence",
    title: "Recurrence Risk",
    body: [
      "Recurrence risk is assessed during RCA and indicates likelihood of the problem repeating.",
      "High: Problem will almost certainly recur — requires immediate comprehensive actions.",
      "Medium: Problem may recur under certain conditions — requires targeted actions.",
      "Low: Problem unlikely to recur — preventive actions and documentation sufficient.",
      "is_recurring is set True if the same problem occurred before, increasing the risk score.",
    ],
  },
  {
    id: "SOP-CAPA-008",
    slug: "sop-capa-008",
    section: "§4 Action Plan",
    title: "Action Plan Guidelines",
    body: [
      "An Action Plan defines specific steps to address the root cause from RCA.",
      "Each action must include action description, responsible person, due date, and action type.",
      "Action types: Corrective, Preventive, or Containment.",
      "AI evaluates the plan and gives a rating: Excellent, Good, or Needs Improvement.",
      "Cosmetic CAPAs are low-risk issues that only require documentation updates.",
    ],
  },
  {
    id: "SOP-CAPA-010",
    slug: "sop-capa-010",
    section: "§5 Monitoring",
    title: "Implementation Monitoring",
    body: [
      "Monitoring tracks progress of each action in the Action Plan.",
      "Action statuses: On Track, Completed, Overdue, or At Risk.",
      "The system counts overdue, on-track, and completed actions automatically.",
      "Escalation alerts trigger when actions become overdue.",
      "Overall CAPA status: In Progress, Completed, or Escalated.",
    ],
  },
  {
    id: "SOP-CAPA-012",
    slug: "sop-capa-012",
    section: "§6 Effectiveness",
    title: "Effectiveness Check Process",
    body: [
      "Effectiveness Check verifies that actions taken have solved the problem.",
      "Should be performed 30 to 90 days after all actions are completed.",
      "You must provide evidence items, trend data, and a new-issues report.",
      "AI calculates an effectiveness score from 0 to 100:",
      "• Above 80: Effective — CAPA can proceed to closure.",
      "• 50 to 80: Partially effective — additional actions may be needed.",
      "• Below 50: Ineffective — CAPA must be re-opened with new RCA.",
      "capa_can_be_closed is set True only when the score is above 80 and no new issues are reported.",
    ],
  },
  {
    id: "SOP-CAPA-014",
    slug: "sop-capa-014",
    section: "§6.4 Closure",
    title: "CAPA Closure Process",
    body: [
      "CAPA Closure is the final step. Conditions that must all be met:",
      "1. All actions in the Action Plan are completed.",
      "2. Effectiveness check performed and passed.",
      "3. No recurrence of the original problem detected.",
      "4. Training records updated and verified.",
      "5. Document changes (SOPs, work instructions) approved.",
      "A CAPA may not be closed while a linked Change Control is still open.",
      "Closure requires electronic signature from an authorized approver.",
      "If ai_closure_approved is True, capa_final_status is set to Approved. If any condition is not met, closure is rejected and the CAPA remains open.",
    ],
  },
  {
    id: "POL-AI-001",
    slug: "pol-ai-001",
    section: "§1 Scope",
    title: "Glimmora AI Assistant Capabilities",
    body: [
      "The AI Assistant can help with:",
      "Data queries: count CAPAs by status, severity, source; RCA quality scores; action plan ratings; effectiveness scores; closure approval status.",
      "Guidance: how to create a CAPA, which RCA method to use, what evidence to collect, when a CAPA is ready to be closed.",
      "The AI is read-only — it cannot modify or create records. All data entry must be done through the proper forms in the system.",
    ],
  },
];

/** Lookup map keyed by slug for O(1) resolution from the route param. */
const BY_SLUG: Record<string, SopDoc> = Object.fromEntries(DOCS.map((d) => [d.slug, d]));

/** Resolve a citation slug (e.g. "sop-capa-002") to its document, or null. */
export function getSopDoc(slug: string): SopDoc | null {
  return BY_SLUG[slug.toLowerCase()] ?? null;
}

/** All known SOP slugs — used to prebuild the static doc routes. */
export function allSopSlugs(): string[] {
  return DOCS.map((d) => d.slug);
}
