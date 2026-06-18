// Keyword-based mock — apparent intelligence in demos.
// Replaced by real LLM when MOCK_AI_RESPONSES=false.
// Pool selection deterministic; same input -> same output.

import type {
  RcaMethod,
  RcaSuggestion,
  FiveWhySuggestion,
  FishboneSuggestion,
  FreeformSuggestion,
  CAPAPrefill,
  ResponseDraftEvent,
  DocumentReviewInput,
  DocumentReviewResult,
  DocumentReviewFinding,
  DocumentReviewSeverity,
  RegulatoryGuidanceUpdate,
  RegulatoryIntelligenceResult,
  DeviationClusterInput,
  DeviationCluster,
  DeviationIntelligenceResult,
  DriftDetectionResult,
  FindingTriageResult,
  FindingTriageSeverity,
} from "./index";
import type { DriftAlert } from "@/types/agi";

/** Raw material for synthesizing method-shaped output. The 5-Why chain uses
 *  proximal/contributing/systemic; the Fishbone uses the 6 category keys. */
interface RcaFactors {
  proximal: string;
  contributing: string;
  systemic: string;
  process: string;
  people: string;
  equipment: string;
  materials: string;
  environment: string;
  management: string;
}

interface PoolEntry {
  rootCause: string;
  factors: RcaFactors;
  confidence: number;
  supportingFindings: { ref: string; similarity: number }[];
}

interface RcaPool {
  name: string;
  keywords: string[];
  suggestions: PoolEntry[];
}

const POOL_DOCUMENTATION: RcaPool = {
  name: "POOL_DOCUMENTATION",
  keywords: [
    "batch record",
    "sop",
    "procedure",
    "documentation",
    "deviation",
    "batch",
    "record-keeping",
  ],
  suggestions: [
    {
      rootCause:
        "The governing standard operating procedure lacked sufficient detail to ensure consistent execution, permitting procedural drift during routine operations.",
      factors: {
        proximal: "An operator made a judgment call on a step the SOP left ambiguous.",
        contributing: "The SOP did not specify acceptance criteria or numeric thresholds for the step.",
        systemic: "The periodic procedure-review cycle does not test SOPs against real edge cases.",
        process: "Document-control review did not catch the ambiguity before issue.",
        people: "Staff were trained to the SOP as written, so the gap propagated into practice.",
        equipment: "No system prompt or interlock enforced the intended sequence.",
        materials: "Batch paperwork templates mirrored the same ambiguous wording.",
        environment: "Shift handovers relied on verbal clarification of the ambiguous step.",
        management: "Tier-1 review treated the SOP as authoritative and did not question it.",
      },
      confidence: 78,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-027", similarity: 0.84 },
        { ref: "CAPA-BLR-2024-103", similarity: 0.71 },
      ],
    },
    {
      rootCause:
        "Affected personnel were not trained on the current revision of the SOP before performing the task, creating a procedure-vs-practice gap.",
      factors: {
        proximal: "The task was performed against a superseded revision of the SOP.",
        contributing: "The revised SOP was released without a read-and-understand gate.",
        systemic: "Training assignment is not automatically triggered by a document revision.",
        process: "Change control closed before training records were verified.",
        people: "Operators were unaware a newer revision existed.",
        equipment: "The document portal still surfaced the old revision in search.",
        materials: "Printed copies of the prior revision remained at the workstation.",
        environment: "High turnover left several operators on legacy training.",
        management: "Supervisors did not reconcile the training matrix after the revision.",
      },
      confidence: 66,
      supportingFindings: [{ ref: "CAPA-CHN-2024-112", similarity: 0.69 }],
    },
    {
      rootCause:
        "Record-keeping discipline was not enforced at the point of execution, allowing contemporaneous entries to be deferred or reconstructed.",
      factors: {
        proximal: "Entries were completed after the fact rather than contemporaneously.",
        contributing: "The procedure did not require recording at the point of execution.",
        systemic: "There is no in-line check that records are made in real time.",
        process: "Record review happened only at batch close, too late to catch deferral.",
        people: "Operators prioritized throughput over contemporaneous recording.",
        equipment: "Paper logs were located away from the point of operation.",
        materials: "Logbook design allowed retrospective completion.",
        environment: "Workstation layout discouraged on-the-spot documentation.",
        management: "Supervisory checks did not verify the timing of entries.",
      },
      confidence: 54,
      supportingFindings: [{ ref: "CAPA-BLR-2023-061", similarity: 0.58 }],
    },
  ],
};

const POOL_EQUIPMENT: RcaPool = {
  name: "POOL_EQUIPMENT",
  keywords: [
    "equipment",
    "qualification",
    "hplc",
    "instrument",
    "calibration",
    "machine",
    "gc",
    "balance",
    "autoclave",
  ],
  suggestions: [
    {
      rootCause:
        "The equipment requalification interval was not aligned with usage frequency, allowing operation beyond the validated qualification window.",
      factors: {
        proximal: "The instrument was used beyond its validated qualification window.",
        contributing: "Requalification was scheduled by calendar rather than by usage.",
        systemic: "Qualification intervals are not risk- or usage-based.",
        process: "The qualification schedule was not reconciled with utilization data.",
        people: "Operators were not aware of the qualification expiry status.",
        equipment: "The instrument had no usage counter tied to requalification.",
        materials: "Reference standards used in qualification were near expiry.",
        environment: "The instrument was relocated without re-verifying qualification.",
        management: "Engineering review did not flag the overdue requalification.",
      },
      confidence: 81,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-044", similarity: 0.86 },
        { ref: "CAPA-CHN-2024-077", similarity: 0.72 },
      ],
    },
    {
      rootCause:
        "The instrument calibration program did not define adequate acceptance criteria for the operating range actually in use.",
      factors: {
        proximal: "A reading near the range edge passed loose acceptance criteria.",
        contributing: "Calibration criteria did not cover the actual operating range.",
        systemic: "Calibration program design is not tied to method operating ranges.",
        process: "Calibration procedure review did not include method requirements.",
        people: "Metrology staff applied generic criteria, not method-specific ones.",
        equipment: "The instrument's precision at range edges was not characterized.",
        materials: "Calibration standards did not bracket the operating range.",
        environment: "Ambient conditions during calibration differed from use.",
        management: "Calibration program ownership did not include method input.",
      },
      confidence: 69,
      supportingFindings: [{ ref: "CAPA-BLR-2024-031", similarity: 0.74 }],
    },
    {
      rootCause:
        "Preventive maintenance scheduling gaps allowed wear-related drift to go undetected between service intervals.",
      factors: {
        proximal: "Wear-related drift went undetected between service visits.",
        contributing: "Preventive maintenance intervals were too long for the duty cycle.",
        systemic: "PM frequency is not derived from reliability or failure data.",
        process: "PM completion was tracked but effectiveness was not trended.",
        people: "Technicians lacked guidance on early wear indicators.",
        equipment: "No condition monitoring was fitted to the asset.",
        materials: "Service kits used did not include all wear parts.",
        environment: "The duty environment accelerated wear beyond assumptions.",
        management: "Maintenance planning did not review PM adequacy.",
      },
      confidence: 52,
      supportingFindings: [{ ref: "CAPA-CHN-2023-090", similarity: 0.61 }],
    },
  ],
};

const POOL_TRAINING: RcaPool = {
  name: "POOL_TRAINING",
  keywords: [
    "training",
    "operator",
    "personnel",
    "staff",
    "awareness",
    "qualification of personnel",
  ],
  suggestions: [
    {
      rootCause:
        "The training program did not cover the specific task under the current procedure revision, leaving a competency gap for assigned operators.",
      factors: {
        proximal: "The operator performed a task they were not trained on for the current revision.",
        contributing: "Training content lagged the latest procedure revision.",
        systemic: "Curriculum updates are not linked to procedure changes.",
        process: "A training-needs analysis was not repeated after the revision.",
        people: "Assigned operators lacked the specific competency.",
        equipment: "The training LMS did not flag the curriculum gap.",
        materials: "Training materials referenced an older workflow.",
        environment: "On-the-job coaching filled the gap inconsistently.",
        management: "The training matrix was not reviewed against the revision.",
      },
      confidence: 77,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-019", similarity: 0.82 },
        { ref: "CAPA-BLR-2024-058", similarity: 0.7 },
      ],
    },
    {
      rootCause:
        "Refresher training cadence was insufficient to maintain proficiency for an infrequently performed activity.",
      factors: {
        proximal: "Proficiency had decayed since the task was last performed.",
        contributing: "No refresher was scheduled for the low-frequency activity.",
        systemic: "Refresher cadence is uniform and ignores task frequency.",
        process: "Competency decay is not modeled in the training plan.",
        people: "The operator had not performed the task in many months.",
        equipment: "No simulation or practice rig maintained the skill.",
        materials: "Job aids for the rare task were outdated.",
        environment: "The task occurred under time pressure without support.",
        management: "Supervisors did not require re-verification before the rare task.",
      },
      confidence: 63,
      supportingFindings: [{ ref: "CAPA-CHN-2024-101", similarity: 0.67 }],
    },
    {
      rootCause:
        "Role-specific competency assessment was not completed before independent execution of the task was authorized.",
      factors: {
        proximal: "The operator worked independently before sign-off.",
        contributing: "Competency assessment was skipped under staffing pressure.",
        systemic: "Independent-work authorization is not gated on assessment.",
        process: "The qualification workflow lacked a hard stop.",
        people: "The trainee was deemed ready informally.",
        equipment: "The LMS allowed task assignment without an assessment status.",
        materials: "Assessment checklists were not used.",
        environment: "Short-staffing pushed the trainee onto the line early.",
        management: "Supervisory sign-off was treated as a formality.",
      },
      confidence: 49,
      supportingFindings: [{ ref: "CAPA-BLR-2023-077", similarity: 0.55 }],
    },
  ],
};

const POOL_ENVIRONMENTAL: RcaPool = {
  name: "POOL_ENVIRONMENTAL",
  keywords: [
    "environmental",
    "humidity",
    "temperature",
    "monitoring",
    "em",
    "hvac",
    "room classification",
  ],
  suggestions: [
    {
      rootCause:
        "Environmental monitoring alert and action limits were not set conservatively enough to trigger timely investigation of adverse trends.",
      factors: {
        proximal: "An adverse trend crossed limits before an investigation triggered.",
        contributing: "Alert/action limits were set too loosely to give early warning.",
        systemic: "Limit-setting is not based on historical capability data.",
        process: "Trend review did not act on near-limit excursions.",
        people: "Monitoring staff treated single excursions as noise.",
        equipment: "Sensor placement missed the worst-case location.",
        materials: "Monitoring media/consumables varied in sensitivity.",
        environment: "Seasonal variation was not reflected in the limits.",
        management: "Periodic limit review was overdue.",
      },
      confidence: 79,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-033", similarity: 0.85 },
        { ref: "CAPA-CHN-2024-066", similarity: 0.73 },
      ],
    },
    {
      rootCause:
        "Monitoring frequency for the classified area did not reflect the actual risk profile of the operations performed within it.",
      factors: {
        proximal: "An event occurred between scheduled monitoring points.",
        contributing: "Monitoring frequency did not match the area's risk profile.",
        systemic: "Frequency is set uniformly rather than by risk assessment.",
        process: "The risk assessment was not revisited after process changes.",
        people: "Staff followed the schedule without questioning adequacy.",
        equipment: "Continuous monitoring was not deployed where warranted.",
        materials: "Sampling supplies limited how often monitoring could occur.",
        environment: "Higher-activity operations were under-sampled.",
        management: "QA did not reassess the monitoring plan.",
      },
      confidence: 64,
      supportingFindings: [{ ref: "CAPA-BLR-2024-040", similarity: 0.68 }],
    },
    {
      rootCause:
        "The HVAC requalification interval lapsed relative to the validated state of the room classification.",
      factors: {
        proximal: "The room operated past its HVAC requalification due date.",
        contributing: "Requalification scheduling did not track the classification's validated state.",
        systemic: "HVAC qualification intervals are not centrally tracked.",
        process: "The requalification trigger was manual and was missed.",
        people: "Facilities staff were unaware of the lapse.",
        equipment: "No alarm flagged the overdue HVAC qualification.",
        materials: "Filter change records were incomplete.",
        environment: "Room pressure cascade drifted unverified.",
        management: "Engineering review did not surface the overdue status.",
      },
      confidence: 51,
      supportingFindings: [{ ref: "CAPA-CHN-2023-052", similarity: 0.59 }],
    },
  ],
};

const POOL_DATA_INTEGRITY: RcaPool = {
  name: "POOL_DATA_INTEGRITY",
  keywords: [
    "data",
    "electronic",
    "signature",
    "audit trail",
    "computer",
    "software",
    "system",
    "csv",
    "alcoa",
    "electronic record",
  ],
  suggestions: [
    {
      rootCause:
        "Computerized system controls did not fully satisfy 21 CFR Part 11 requirements for the electronic records generated by the workflow.",
      factors: {
        proximal: "Electronic records were produced without full Part 11 controls.",
        contributing: "The system was deployed without complete 21 CFR Part 11 configuration.",
        systemic: "CSV scope did not enforce Part 11 control verification.",
        process: "Validation did not test audit-trail and e-signature controls.",
        people: "Users were not trained on the data-integrity expectations.",
        equipment: "The system lacked enforced audit-trail settings.",
        materials: "Configuration baselines did not include Part 11 settings.",
        environment: "Shared workstations enabled attributable-record gaps.",
        management: "Periodic review of system controls was not performed.",
      },
      confidence: 83,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-027", similarity: 0.88 },
        { ref: "CAPA-BLR-2024-115", similarity: 0.75 },
      ],
    },
    {
      rootCause:
        "A defined audit-trail review process was not in place to detect unauthorized or unexpected changes to critical data.",
      factors: {
        proximal: "An unexpected data change went unreviewed.",
        contributing: "No procedure defined routine audit-trail review.",
        systemic: "Audit-trail review is not built into the data lifecycle.",
        process: "Batch review did not include audit-trail examination.",
        people: "Reviewers were not trained to interrogate audit trails.",
        equipment: "Audit-trail reports were difficult to generate.",
        materials: "No risk-based review criteria existed.",
        environment: "High data volume discouraged routine review.",
        management: "QA did not mandate an audit-trail review frequency.",
      },
      confidence: 70,
      supportingFindings: [{ ref: "CAPA-CHN-2024-088", similarity: 0.72 }],
    },
    {
      rootCause:
        "User role and permission scoping allowed segregation-of-duties conflicts within the application.",
      factors: {
        proximal: "A single user could both create and approve a record.",
        contributing: "Role permissions were over-scoped at provisioning.",
        systemic: "Access management does not enforce segregation of duties.",
        process: "Periodic access review did not detect the conflict.",
        people: "Admins granted convenience access without an SoD review.",
        equipment: "The application lacked granular permission roles.",
        materials: "Role definitions were not documented per SoD requirements.",
        environment: "Small team size encouraged shared or elevated accounts.",
        management: "Access approvals did not require SoD confirmation.",
      },
      confidence: 55,
      supportingFindings: [{ ref: "CAPA-BLR-2023-099", similarity: 0.6 }],
    },
  ],
};

const POOL_CONTAMINATION: RcaPool = {
  name: "POOL_CONTAMINATION",
  keywords: [
    "cleaning",
    "contamination",
    "sterile",
    "bioburden",
    "particulate",
    "environmental control",
    "microbial",
  ],
  suggestions: [
    {
      rootCause:
        "Cleaning validation did not establish a defensible interval for the equipment train under the current product mix.",
      factors: {
        proximal: "Equipment was reused past a non-validated cleaning hold.",
        contributing: "Cleaning validation did not define a defensible hold for the product mix.",
        systemic: "Cleaning validation is not refreshed when the product mix changes.",
        process: "Campaign planning did not reference cleaning-validation limits.",
        people: "Operators followed cleaning SOPs not tied to validated intervals.",
        equipment: "Equipment design left hard-to-clean areas.",
        materials: "Worst-case product residues were not bracketed.",
        environment: "Hold times in the area exceeded validated conditions.",
        management: "Validation review did not keep pace with the product mix.",
      },
      confidence: 80,
      supportingFindings: [
        { ref: "CAPA-CHN-2025-051", similarity: 0.87 },
        { ref: "CAPA-CHN-2024-070", similarity: 0.74 },
      ],
    },
    {
      rootCause:
        "Gowning practice and qualification did not adequately mitigate the personnel-borne contamination risk for the area grade.",
      factors: {
        proximal: "Personnel-borne contamination was introduced into the graded area.",
        contributing: "Gowning qualification did not match the area grade's risk.",
        systemic: "Gowning requirements are not tied to area classification.",
        process: "Gowning re-qualification cadence was insufficient.",
        people: "Operators' aseptic technique varied.",
        equipment: "Gowning materials did not meet the required barrier level.",
        materials: "Sterile garments were stored or handled inconsistently.",
        environment: "Airlock flows did not reinforce correct gowning.",
        management: "Aseptic-behavior monitoring was infrequent.",
      },
      confidence: 67,
      supportingFindings: [{ ref: "CAPA-BLR-2024-045", similarity: 0.69 }],
    },
    {
      rootCause:
        "Area classification controls were insufficient to maintain the required microbial state during dynamic operations.",
      factors: {
        proximal: "The microbial state degraded during dynamic operations.",
        contributing: "Classification controls were sized for static, not dynamic, conditions.",
        systemic: "Area classification is not validated against dynamic operations.",
        process: "Operational monitoring did not reflect peak activity.",
        people: "Personnel movement disrupted unidirectional flow.",
        equipment: "Air-handling capacity was marginal at peak load.",
        materials: "Material transfer practices breached the classified boundary.",
        environment: "Room recovery time was longer than assumed.",
        management: "Classification review did not consider dynamic load.",
      },
      confidence: 53,
      supportingFindings: [{ ref: "CAPA-CHN-2023-063", similarity: 0.57 }],
    },
  ],
};

const POOL_GENERIC: RcaPool = {
  name: "POOL_GENERIC",
  keywords: [],
  suggestions: [
    {
      rootCause:
        "A governing procedure did not adequately specify the controls needed to prevent the observed condition.",
      factors: {
        proximal: "The condition arose at a step the procedure left uncontrolled.",
        contributing: "The procedure did not specify a needed control.",
        systemic: "Procedure design does not consistently include control points.",
        process: "Procedure review did not assess control adequacy.",
        people: "Staff followed the procedure as written.",
        equipment: "No engineering control backstopped the gap.",
        materials: "Inputs varied without a defined control.",
        environment: "Operating conditions were not constrained.",
        management: "Review did not challenge control completeness.",
      },
      confidence: 60,
      supportingFindings: [{ ref: "CAPA-CHN-2024-100", similarity: 0.66 }],
    },
    {
      rootCause:
        "Personnel awareness and training did not fully address the requirements relevant to the observed task.",
      factors: {
        proximal: "The requirement was not applied at the point of work.",
        contributing: "Training did not cover the relevant requirement.",
        systemic: "Awareness of the requirement is not systematically reinforced.",
        process: "Onboarding did not include the requirement.",
        people: "Staff were unaware of the expectation.",
        equipment: "No reminder or prompt reinforced the requirement.",
        materials: "Job aids omitted the requirement.",
        environment: "Communication of the requirement was inconsistent.",
        management: "Supervisors did not reinforce the requirement.",
      },
      confidence: 52,
      supportingFindings: [{ ref: "CAPA-BLR-2024-072", similarity: 0.61 }],
    },
    {
      rootCause:
        "Independent verification was not performed at a step where an error could propagate undetected.",
      factors: {
        proximal: "An error propagated past a step with no second check.",
        contributing: "Independent verification was not built into the step.",
        systemic: "Verification controls are not applied to error-prone steps.",
        process: "Process design omitted a verification gate.",
        people: "A single operator executed without a checker.",
        equipment: "No system check validated the result.",
        materials: "No reconciliation step caught the discrepancy.",
        environment: "Time pressure discouraged double-checks.",
        management: "Review did not require independent verification.",
      },
      confidence: 45,
      supportingFindings: [{ ref: "CAPA-CHN-2023-085", similarity: 0.54 }],
    },
  ],
};

// Order matters: ties in keyword-match count resolve to the FIRST defined.
const POOLS: RcaPool[] = [
  POOL_DOCUMENTATION,
  POOL_EQUIPMENT,
  POOL_TRAINING,
  POOL_ENVIRONMENTAL,
  POOL_DATA_INTEGRITY,
  POOL_CONTAMINATION,
];

/** Deterministic keyword scoring → pick the best-matching pool. */
function selectRcaPool(observationText: string): RcaPool {
  const text = observationText.toLowerCase();
  let best: RcaPool | null = null;
  let bestCount = 0;
  for (const pool of POOLS) {
    const count = pool.keywords.reduce(
      (n, kw) => (text.includes(kw) ? n + 1 : n),
      0,
    );
    // Strict `>` means an earlier-defined pool wins ties.
    if (count > bestCount) {
      bestCount = count;
      best = pool;
    }
  }
  return bestCount > 0 && best ? best : POOL_GENERIC;
}

/* ── Method-shaping: one pool entry → one method-specific suggestion ── */

function shape5Why(
  entry: PoolEntry,
  observationText: string,
): FiveWhySuggestion {
  return {
    method: "5 Why",
    whys: [
      `${observationText.length > 60 ? observationText.slice(0, 60) + "…" : observationText} — why did it occur?`,
      entry.factors.proximal,
      entry.factors.contributing,
      entry.factors.systemic,
      entry.rootCause,
    ],
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

function shapeFishbone(entry: PoolEntry): FishboneSuggestion {
  return {
    method: "Fishbone",
    categories: {
      people: entry.factors.people,
      process: entry.factors.process,
      equipment: entry.factors.equipment,
      materials: entry.factors.materials,
      environment: entry.factors.environment,
      management: entry.factors.management,
    },
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

function shapeFreeform(
  entry: PoolEntry,
  method: "Fault Tree" | "Barrier Analysis",
): FreeformSuggestion {
  return {
    method,
    rootCause: entry.rootCause,
    confidence: entry.confidence,
    supportingFindings: entry.supportingFindings,
  };
}

export function mockRcaSuggestions(
  method: RcaMethod,
  observationText: string,
): RcaSuggestion[] {
  const pool = selectRcaPool(observationText);
  const shaped: RcaSuggestion[] = pool.suggestions.map((entry) => {
    switch (method) {
      case "5 Why":
        return shape5Why(entry, observationText);
      case "Fishbone":
        return shapeFishbone(entry);
      case "Fault Tree":
        return shapeFreeform(entry, "Fault Tree");
      case "Barrier Analysis":
        return shapeFreeform(entry, "Barrier Analysis");
    }
  });
  // Sorted by confidence descending; copy already produced by map().
  return shaped.sort((a, b) => b.confidence - a.confidence);
}

export function mockCapaPrefill(
  observationText: string,
  rcaRootCause: string,
  observationSeverity: string,
): CAPAPrefill {
  // observationText / severity are accepted for signature parity with the
  // real backend; the mock derives wording from the RCA the user wrote.
  void [observationText, observationSeverity];

  const truncatedTitle =
    rcaRootCause.length > 60 ? rcaRootCause.slice(0, 57) + "..." : rcaRootCause;

  const dueDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    title: "Address: " + truncatedTitle,
    description:
      "Root cause identified: " +
      rcaRootCause +
      ". Corrective action plan: revise relevant SOPs, retrain affected " +
      "personnel, and verify effectiveness within 90 days.",
    suggestedOwnerHint: "Quality Assurance Manager or equivalent",
    suggestedDueDate: dueDate,
    reasoning:
      "Based on observation severity, RCA findings, and historical CAPA " +
      "resolution patterns at this site.",
  };
}

export function mockResponseDraft(event: ResponseDraftEvent): {
  draft: string;
  characterCount: number;
} {
  const obsBlocks = event.observations
    .map((o) => {
      const truncatedText =
        o.text.length > 200 ? o.text.slice(0, 200) + "..." : o.text;
      const rootCauseLine = o.rootCause
        ? `Root Cause: ${o.rootCause}`
        : `Root Cause Analysis: in progress`;
      const correctiveLine = o.capaRef
        ? `Corrective Action: ${o.capaRef} has been raised and assigned to the ` +
          `responsible Quality function. The corrective action plan includes ` +
          `SOP revision, targeted training, and effectiveness verification ` +
          `within 90 days of implementation.`
        : `Corrective Action: CAPA assignment pending.`;
      return (
        `Observation #${o.number}: ${truncatedText}\n\n` +
        `Severity: ${o.severity}\n` +
        `${rootCauseLine}\n` +
        `${correctiveLine}`
      );
    })
    .join("\n\n");

  const draft =
    `Dear [FDA District Office],\n\n` +
    `Pharma Glimmora International received Form FDA-483 issued at the ` +
    `conclusion of the inspection of our ${event.site} facility on ` +
    `${event.inspectionDate}. We appreciate the opportunity to respond to ` +
    `the observations cited in the form.\n\n` +
    `We have completed thorough root cause analysis and initiated corrective ` +
    `and preventive actions (CAPAs) for each observation, as summarized ` +
    `below.\n\n` +
    `${obsBlocks}\n\n` +
    `We are committed to continuous improvement of our quality systems and ` +
    `will provide periodic updates on the effectiveness of these corrective ` +
    `actions. Should the Agency require any additional information or ` +
    `clarification, please contact our Quality Assurance Head.\n\n` +
    `Sincerely,\n\n` +
    `[Signatory name and title will be added at signature time]\n\n` +
    `Pharma Glimmora International`;

  return { draft, characterCount: draft.length };
}

/* ── Feature D — CSV validation Document Review ──────────────────── */

/** FNV-1a 32-bit. Deterministic seed from filename+stage so the same upload
 *  always yields the same findings (no Math.random — demos must be stable). */
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface RubricCheck {
  id: string;
  /** Stages this check applies to. "all" = every stage. */
  stages: "all" | string[];
  severity: DocumentReviewSeverity;
  sectionRef?: string;
  title: string;
  detail: string;
  rubricItem: string;
}

/**
 * The validation rubric. Each entry is a single completeness / signoff /
 * required-section check that can flag a finding. Ordered so the most
 * universally important checks (signatures, retired SOP refs, blank
 * results) sort first for a given document.
 */
const REVIEW_RUBRIC: RubricCheck[] = [
  {
    id: "deleted-sop",
    stages: ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"],
    severity: "high",
    sectionRef: "Section 4.2",
    title: "Section 4.2 references a deleted SOP version (SOP-LIMS-007 v1.0 retired)",
    detail:
      "SOP-LIMS-007 v1.0 was retired and superseded by v2.0. A validation document " +
      "must cite the current effective version. Update the citation in Section 4.2 " +
      "before submitting for QA review.",
    rubricItem: "SOP references cite current effective versions",
  },
  {
    id: "no-signature",
    stages: "all",
    severity: "high",
    sectionRef: "Document footer",
    title: "No signature block found at end of document",
    detail:
      "The executed protocol has no reviewer/approver signature block. 21 CFR Part 11 " +
      "requires an attributable signature carrying name, role and date. Add the " +
      "signature block before submission.",
    rubricItem: "Approval signature block present",
  },
  {
    id: "missing-units",
    stages: ["OQ", "PQ", "IQ"],
    severity: "medium",
    sectionRef: "Section 6 — Test results",
    title: "Test result table in Section 6 missing measurement units",
    detail:
      "Recorded values in the Section 6 results table omit units (e.g. °C, mL, rpm). " +
      "Add units to every measured parameter so results are unambiguous and reviewable.",
    rubricItem: "Quantitative results carry measurement units",
  },
  {
    id: "blank-results",
    stages: ["OQ", "PQ"],
    severity: "high",
    sectionRef: "Section 6 — Test results",
    title: "Executed test steps left blank in Section 6",
    detail:
      "Test steps 6.3, 6.5 and 6.9 have empty Actual Result fields. Every executed " +
      "step must record an observed result or a justified N/A — blanks read as " +
      "incomplete execution to an inspector.",
    rubricItem: "No blank executed-result fields",
  },
  {
    id: "missing-acceptance",
    stages: ["FS", "OQ", "PQ"],
    severity: "medium",
    sectionRef: "Section 5",
    title: "Acceptance criteria not stated for 2 test cases",
    detail:
      "Test cases TC-04 and TC-07 describe a procedure but state no pass/fail " +
      "acceptance criteria. Define measurable acceptance criteria for each test case.",
    rubricItem: "Each test case states acceptance criteria",
  },
  {
    id: "no-traceability",
    stages: ["URS", "FS", "DS"],
    severity: "medium",
    sectionRef: "Section 3",
    title: "Requirements traceability matrix not attached",
    detail:
      "Section 3 references a requirements traceability matrix but none is attached. " +
      "Attach the RTM linking each requirement to its verifying test case.",
    rubricItem: "Traceability matrix present",
  },
  {
    id: "iq-checklist",
    stages: ["IQ"],
    severity: "high",
    sectionRef: "Section 4 — Installation checklist",
    title: "Installation verification checklist incomplete (4 items unchecked)",
    detail:
      "Four installation verification items in Section 4 are neither checked nor marked " +
      "N/A. Complete every line of the installation checklist before submitting IQ.",
    rubricItem: "Installation checklist complete",
  },
  {
    id: "pq-runs",
    stages: ["PQ"],
    severity: "high",
    sectionRef: "Section 7",
    title: "Only 2 of 3 required performance runs documented",
    detail:
      "PQ requires three consecutive successful runs; only runs 1 and 2 are present. " +
      "Document the third run or provide a justified rationale for reduced sampling.",
    rubricItem: "Required performance runs documented",
  },
  {
    id: "undated-signoff",
    stages: "all",
    severity: "medium",
    sectionRef: "Approval page",
    title: "Reviewer sign-off present but undated",
    detail:
      "An approver signed the document but did not record the signature date. Part 11 " +
      "electronic and handwritten signatures must both be dated.",
    rubricItem: "Signatures are dated",
  },
  {
    id: "no-prerequisites",
    stages: ["IQ", "OQ"],
    severity: "low",
    sectionRef: "Section 2",
    title: "Prerequisites / environment conditions not recorded",
    detail:
      "Section 2 leaves the as-found environment and prerequisite conditions " +
      "(calibration status, utilities, software build) blank. Record them at execution.",
    rubricItem: "Execution prerequisites recorded",
  },
  {
    id: "stale-revision",
    stages: "all",
    severity: "low",
    sectionRef: "Revision history",
    title: "Revision history table not updated for this version",
    detail:
      "The revision history still lists the previous revision as latest. Add a row for " +
      "the current version with author, date and a one-line change summary.",
    rubricItem: "Revision history current",
  },
];

/** Filenames that signal an already-clean, fully-executed document. These
 *  pass with zero findings so the demo can show the "looks complete" path. */
function looksClean(fileName: string): boolean {
  return /(final|approved|signed|executed|clean|gold)([_\-. ]|$)/i.test(fileName);
}

export function mockDocumentReview(input: DocumentReviewInput): DocumentReviewResult {
  const { stageKey, fileName } = input;
  const seedStr = `${fileName.toLowerCase()}|${stageKey}`;
  const seed = fnv1a(seedStr);

  const scannedAt = new Date().toISOString();
  // Reported (display) scan time: a stable 6–12s, independent of the ~1.1s
  // actual shim in getDocumentReview. Mirrors the PDF mock's "Scanned in 8s".
  const scanDurationSeconds = 6 + (seed % 7);

  const baseResult: Omit<DocumentReviewResult, "findings"> = {
    stageKey,
    fileName,
    scannedAt,
    scanDurationSeconds,
    rubricVersion: "csv-val-rubric-2026.1",
    source: "mock",
  };

  if (looksClean(fileName)) {
    return { ...baseResult, findings: [] };
  }

  const toFindings = (ids: string[]): DocumentReviewFinding[] =>
    ids
      .map((id) => REVIEW_RUBRIC.find((r) => r.id === id))
      .filter((r): r is RubricCheck => Boolean(r))
      .map((r) => ({
        id: `${stageKey}-${r.id}`,
        severity: r.severity,
        title: r.title,
        detail: r.detail,
        sectionRef: r.sectionRef,
        rubricItem: r.rubricItem,
      }));

  // Showcase path: an OQ validation document reproduces the spec's canonical
  // three findings (retired SOP ref, missing signature block, missing units)
  // so the demo matches the reference mock exactly.
  if (stageKey === "OQ" && /validation/i.test(fileName)) {
    return { ...baseResult, findings: toFindings(["deleted-sop", "no-signature", "missing-units"]) };
  }

  const applicable = REVIEW_RUBRIC.filter(
    (r) => r.stages === "all" || r.stages.includes(stageKey),
  );

  // Deterministic selection: score each applicable check by hashing its id
  // with the seed, sort ascending, then take k of them. Draft/early-version
  // filenames surface more issues; everything else surfaces 1–3.
  const isDraft = /(draft|wip|rev-?0|_v0|-v0|v1\b)/i.test(fileName);
  const ranked = [...applicable].sort(
    (a, b) => fnv1a(a.id + seedStr) - fnv1a(b.id + seedStr),
  );
  const k = isDraft
    ? Math.min(4, applicable.length)
    : 1 + (seed % Math.min(3, applicable.length));

  const order: Record<DocumentReviewSeverity, number> = { high: 0, medium: 1, low: 2 };
  const findings: DocumentReviewFinding[] = ranked
    .slice(0, k)
    .map((r) => ({
      id: `${stageKey}-${r.id}`,
      severity: r.severity,
      title: r.title,
      detail: r.detail,
      sectionRef: r.sectionRef,
      rubricItem: r.rubricItem,
    }))
    // Surface highest severity first so the inline list leads with what matters.
    .sort((a, b) => order[a.severity] - order[b.severity]);

  return { ...baseResult, findings };
}

/* ── Feature E — Regulatory Intelligence ─────────────────────────────
 * A deterministic, curated set of FDA/EMA/ICH/MHRA guidance updates. Real
 * agency feeds would be fetched + LLM-summarised when MOCK_AI_RESPONSES is
 * off; the mock keeps the demo stable (same list, same order, every scan).
 *
 * Dates are FIXED (not relative to "now") so the dashboard alert count and
 * the e2e tests stay deterministic across runs. */
const REGULATORY_UPDATES: RegulatoryGuidanceUpdate[] = [
  {
    id: "reg-fda-csa-2026",
    source: "FDA",
    docRef: "FDA-2025-D-1402",
    title:
      "Computer Software Assurance for Production and Quality System Software",
    publishedDate: "2026-05-18",
    category: "Computer System Validation",
    changeType: "New guidance",
    impact: "high",
    isNewRequirement: true,
    summary:
      "Finalises the risk-based Computer Software Assurance (CSA) approach, shifting CSV effort from exhaustive documentation toward critical-thinking and risk-proportionate testing for production and quality-system software.",
    suggestedAlignment:
      "Transition the CSV/CSA validation SOP to a CSA risk model; rebuild the test-rigor matrix so high-risk functions get scripted testing and low-risk ones use unscripted/ad-hoc evidence.",
    affectedAreas: ["CSV/IT", "QMS"],
  },
  {
    id: "reg-ema-annex1-ccs",
    source: "EMA",
    docRef: "EMA/INS/GMP/Annex1",
    title:
      "EU GMP Annex 1 — Manufacture of Sterile Medicinal Products (Contamination Control Strategy update)",
    publishedDate: "2026-04-30",
    category: "Aseptic Processing",
    changeType: "Revised guidance",
    impact: "high",
    isNewRequirement: true,
    summary:
      "Reinforces a holistic, site-wide Contamination Control Strategy (CCS) and tightens expectations on aseptic process simulation, gowning qualification, and environmental monitoring rationale.",
    suggestedAlignment:
      "Update the site Contamination Control Strategy document and confirm gowning re-qualification cadence and APS coverage map to the revised expectations.",
    affectedAreas: ["Manufacturing", "QC Lab"],
  },
  {
    id: "reg-fda-di-qa",
    source: "FDA",
    docRef: "FDA-2025-D-3210",
    title:
      "Data Integrity and Compliance With Drug CGMP — Questions and Answers (Revision 2)",
    publishedDate: "2026-03-22",
    category: "Data Integrity",
    changeType: "Revised guidance",
    impact: "high",
    isNewRequirement: false,
    summary:
      "Expanded Q&A clarifying ALCOA+ expectations for audit-trail review, shared logins, and dynamic electronic records under 21 CFR Part 11.",
    suggestedAlignment:
      "Cross-check the LIMS/CDS audit-trail review SOP and Part 11 e-signature configuration against the clarified expectations; close any shared-login gaps.",
    affectedAreas: ["CSV/IT", "QC Lab"],
  },
  {
    id: "reg-ich-q9r1",
    source: "ICH",
    docRef: "ICH Q9(R1)",
    title: "ICH Q9(R1) — Quality Risk Management",
    publishedDate: "2026-02-11",
    category: "Quality Risk Management",
    changeType: "Revised guidance",
    impact: "medium",
    isNewRequirement: false,
    summary:
      "Adds guidance on managing subjectivity in risk assessments, formality of QRM, and risk-based decision-making — clarifying rather than introducing new obligations.",
    suggestedAlignment:
      "Refresh risk-assessment templates to record formality level and address subjectivity; brief QRM facilitators on the revised principles.",
    affectedAreas: ["QMS"],
  },
  {
    id: "reg-mhra-nitrosamines",
    source: "MHRA",
    docRef: "MHRA-2026-NDSRI",
    title:
      "Nitrosamine impurities — recommended acceptable intakes for NDSRIs (draft)",
    publishedDate: "2026-01-26",
    category: "Nitrosamines",
    changeType: "Draft for comment",
    impact: "medium",
    isNewRequirement: false,
    summary:
      "Draft update to recommended acceptable intake limits for nitrosamine drug-substance-related impurities (NDSRIs), open for industry comment.",
    suggestedAlignment:
      "Re-run the nitrosamine risk assessment for at-risk products against the draft limits and verify supplier change-control notifications are current.",
    affectedAreas: ["QC Lab", "Manufacturing"],
  },
  {
    id: "reg-ema-gvp-signal",
    source: "EMA",
    docRef: "EMA/GVP/ModuleIX",
    title: "Good Pharmacovigilance Practices (GVP) Module IX — Signal Management (Rev. 1 addendum)",
    publishedDate: "2025-12-09",
    category: "Pharmacovigilance",
    changeType: "Revised guidance",
    impact: "low",
    isNewRequirement: false,
    summary:
      "Minor addendum aligning signal-management terminology and timelines with the latest EU pharmacovigilance legislation.",
    suggestedAlignment:
      "Update PSMF references and confirm the signal-management SOP reflects the revised timelines.",
    affectedAreas: ["QMS"],
  },
];

/** Deterministic ordering — highest impact first, then most recent. Returns a
 *  fresh sorted copy so callers can't mutate the source array. */
export function buildRegulatoryUpdates(): RegulatoryGuidanceUpdate[] {
  const order: Record<RegulatoryGuidanceUpdate["impact"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return [...REGULATORY_UPDATES].sort(
    (a, b) =>
      order[a.impact] - order[b.impact] ||
      b.publishedDate.localeCompare(a.publishedDate),
  );
}

export function mockRegulatoryIntelligence(): RegulatoryIntelligenceResult {
  return {
    updates: buildRegulatoryUpdates(),
    scannedAt: new Date().toISOString(),
    source: "mock",
  };
}

/* ── Feature F — Deviation Intelligence ──────────────────────────────
 * Deterministic clustering of the tenant's deviations by AREA (recurrence
 * in the same area is the strongest signal in this data — categories are
 * free-text and rarely repeat). A real backend would use embeddings; the
 * mock is keyword + grouping so demos + e2e stay stable. */

/** Lower = more severe. Accepts both casings. */
function devSeverityRank(s: string): number {
  const v = s.toLowerCase();
  return v === "critical" ? 0 : v === "major" ? 1 : 2;
}
function devSeverityKey(s: string): "critical" | "major" | "minor" {
  const v = s.toLowerCase();
  return v === "critical" ? "critical" : v === "major" ? "major" : "minor";
}

/** Ordered keyword → candidate-root-cause map. First match wins, so place
 *  the most specific signals first. */
const DEV_ROOT_CAUSE_HINTS: { kw: string[]; hint: string }[] = [
  {
    kw: ["out of specification", "oos", "specification"],
    hint: "Process or analytical-method controls are insufficient to prevent or contain out-of-specification results in this area.",
  },
  {
    kw: ["em", "environmental", "excursion", "humidity", "temperature", "monitoring", "particulate"],
    hint: "Environmental monitoring limits or controls are not conservative enough for the operations performed in this area.",
  },
  {
    kw: ["qualification", "calibration", "overdue", "requalification", "maintenance"],
    hint: "Equipment qualification/calibration scheduling is not aligned to usage, so intervals lapse undetected.",
  },
  {
    kw: ["documentation", "record", "signature", "logbook", "entry"],
    hint: "Procedures lack the detail or contemporaneous-record discipline needed for consistent execution.",
  },
  {
    kw: ["sterile", "aseptic", "contamination", "gowning", "bioburden"],
    hint: "Aseptic controls or contamination-control strategy are insufficient for the area's classification under dynamic operations.",
  },
  {
    kw: ["process", "procedure", "batch", "yield"],
    hint: "Process steps lack defined controls or acceptance criteria, allowing variation under routine operation.",
  },
  {
    kw: ["training", "personnel", "operator", "competency"],
    hint: "Training or competency assessment does not cover the task under the current procedure revision.",
  },
  {
    kw: ["system", "software", "computer", "data", "audit trail"],
    hint: "Computerised-system controls/validation do not fully cover the workflow generating these records.",
  },
];
const DEV_DEFAULT_HINT =
  "Multiple recurring events in this area point to a shared systemic gap — investigate a common root cause across these deviations.";

function suggestDeviationRootCause(text: string): string {
  const t = text.toLowerCase();
  for (const r of DEV_ROOT_CAUSE_HINTS) {
    if (r.kw.some((k) => t.includes(k))) return r.hint;
  }
  return DEV_DEFAULT_HINT;
}

export function mockDeviationIntelligence(
  deviations: DeviationClusterInput[],
): DeviationIntelligenceResult {
  // Group by area. An area with >= 2 deviations is a "recurring pattern";
  // >= 3 is "high frequency".
  const byArea = new Map<string, DeviationClusterInput[]>();
  for (const d of deviations) {
    const key = d.area?.trim() || "Unspecified";
    const arr = byArea.get(key) ?? [];
    arr.push(d);
    byArea.set(key, arr);
  }

  const clusters: DeviationCluster[] = [];
  for (const [area, members] of byArea) {
    if (members.length < 2) continue; // recurrence needs 2+
    const count = members.length;

    // Driver = worst-severity member (tie-break by reference) — drives the
    // suggested-root-cause keyword match.
    const driver = [...members].sort(
      (a, b) =>
        devSeverityRank(a.severity) - devSeverityRank(b.severity) ||
        a.reference.localeCompare(b.reference),
    )[0];

    // Category breakdown.
    const catMap = new Map<string, number>();
    for (const m of members) catMap.set(m.category, (catMap.get(m.category) ?? 0) + 1);
    const categoryChips = [...catMap.entries()]
      .map(([label, c]) => ({ label, count: c }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    // Severity mix.
    const severityMix = { critical: 0, major: 0, minor: 0 };
    for (const m of members) severityMix[devSeverityKey(m.severity)]++;

    const isHighFrequency = count >= 3;
    clusters.push({
      id: `cluster-${area.toLowerCase().replace(/\s+/g, "-")}`,
      theme: isHighFrequency
        ? `High-frequency deviations in ${area}`
        : `Recurring deviations in ${area}`,
      area,
      category: driver.category,
      count,
      isHighFrequency,
      categoryChips,
      severityMix,
      members: [...members]
        .sort((a, b) => a.reference.localeCompare(b.reference))
        .map((m) => ({ id: m.id, reference: m.reference })),
      suggestedRootCause: suggestDeviationRootCause(`${driver.category} ${driver.title}`),
      confidence: Math.min(95, 50 + count * 12),
    });
  }

  // High-frequency first, then by size, then area name — deterministic.
  clusters.sort(
    (a, b) =>
      Number(b.isHighFrequency) - Number(a.isHighFrequency) ||
      b.count - a.count ||
      a.area.localeCompare(b.area),
  );

  return {
    clusters,
    analyzedCount: deviations.length,
    patternCount: clusters.length,
    scannedAt: new Date().toISOString(),
    source: "mock",
  };
}

/* ── Feature H — Drift Detection ─────────────────────────────────────
 * Deterministic drift alerts across validated systems (config changes,
 * access creep, audit-trail anomalies). A real backend would diff validated
 * baselines + watch IAM/audit flags; the mock keeps the demo stable. Dates
 * are fixed so the dashboard count and e2e tests stay deterministic. */
const DRIFT_ALERTS: DriftAlert[] = [
  {
    id: "drift-audit-cds-07",
    tenantId: "",
    type: "Audit Trail Anomaly",
    severity: "Critical",
    description:
      "Audit trail disabled on Empower CDS (instrument QC-HPLC-07) for 6 days — electronic records created without an attributable change log.",
    agent: "Drift Detection",
    detectedAt: "2026-06-08",
    owner: "IT/CDO",
    action: "Re-enable audit trail and investigate records created while it was off.",
    status: "Open",
  },
  {
    id: "drift-access-lims-admin",
    tenantId: "",
    type: "Access Creep",
    severity: "Major",
    description:
      "LIMS: 3 analyst accounts hold the Administrator role — segregation-of-duties conflict (a user can run and approve their own results).",
    agent: "Drift Detection",
    detectedAt: "2026-06-06",
    owner: "QA Head",
    action: "Review entitlements and revoke over-scoped admin rights.",
    status: "Investigating",
  },
  {
    id: "drift-config-scada-r200",
    tenantId: "",
    type: "Configuration Change",
    severity: "Major",
    description:
      "SCADA high-temperature alarm limit for Reactor R-200 changed from 78°C to 85°C outside change control on 03 Jun 2026.",
    agent: "Drift Detection",
    detectedAt: "2026-06-04",
    owner: "Operations Head",
    action: "Confirm change control / revert to the validated set-point.",
    status: "Open",
  },
  {
    id: "drift-config-mes-template",
    tenantId: "",
    type: "Configuration Change",
    severity: "Minor",
    description:
      "MES batch-report template (v4) differs from the validated baseline (v3) — an uncontrolled layout change was detected.",
    agent: "Drift Detection",
    detectedAt: "2026-06-02",
    owner: "CSV/Val Lead",
    action: "Assess change impact and update validation documentation.",
    status: "Open",
  },
  {
    id: "drift-access-dormant-bms",
    tenantId: "",
    type: "Access Creep",
    severity: "Minor",
    description:
      "Dormant vendor account on the Building Management System has been active and unused for 180+ days.",
    agent: "Drift Detection",
    detectedAt: "2026-05-30",
    owner: "IT/CDO",
    action: "Disable or recertify the dormant account.",
    status: "Open",
  },
];

/** Deterministic ordering — most severe first, then most recent. Returns a
 *  fresh sorted copy so callers can't mutate the source array. */
export function buildDriftAlerts(): DriftAlert[] {
  const order: Record<DriftAlert["severity"], number> = {
    Critical: 0,
    Major: 1,
    Minor: 2,
  };
  return [...DRIFT_ALERTS].sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      b.detectedAt.localeCompare(a.detectedAt),
  );
}

export function mockDriftDetection(): DriftDetectionResult {
  return {
    alerts: buildDriftAlerts(),
    scannedAt: new Date().toISOString(),
    source: "mock",
  };
}

/* ── Feature I — Finding Triage ──────────────────────────────────────
 * Deterministic keyword classifier: same requirement -> same result, so the
 * demo (and the backend's fallback path) is stable. Mirrors the backend's
 * coercion: the framework is constrained to the tenant's active frameworks and
 * severity is always Critical/High/Low. */

const TRIAGE_FRAMEWORK_LABELS: Record<string, string> = {
  p210: "21 CFR 210/211", p11: "Part 11", annex11: "Annex 11",
  annex15: "Annex 15", ichq9: "ICH Q9", ichq10: "ICH Q10",
  gamp5: "GAMP 5", who: "WHO GMP", mhra: "MHRA",
};

interface TriageRule {
  /** Lowercased keywords that trigger this rule. */
  match: string[];
  framework: string;
  clause: string;
  severity: FindingTriageSeverity;
  evidenceGaps: string[];
}

// First matching rule wins; order = most specific/severe first.
const TRIAGE_RULES: TriageRule[] = [
  {
    match: ["audit trail", "electronic record", "electronic signature", "part 11", "access control", "user access", "overwrite", "data integrity", "alcoa"],
    framework: "p11", clause: "21 CFR Part 11 §11.10(e)", severity: "Critical",
    evidenceGaps: ["System audit-trail export", "User access / privilege matrix", "Audit-trail review SOP"],
  },
  {
    match: ["oos", "out of specification", "out-of-specification", "oot", "result", "integration", "reprocess"],
    framework: "p210", clause: "21 CFR 211.192", severity: "Critical",
    evidenceGaps: ["OOS investigation record", "Analyst worksheet + raw data", "QA disposition record"],
  },
  {
    match: ["sterile", "aseptic", "smoke study", "airflow", "contamination", "media fill"],
    framework: "p210", clause: "21 CFR 211.42(c)", severity: "Critical",
    evidenceGaps: ["Smoke-study video / report", "Environmental monitoring trends", "Aseptic qualification records"],
  },
  {
    match: ["validation", "qualification", "iq", "oq", "pq", "csv", "computer system", "requalification"],
    framework: "annex15", clause: "Annex 15 §2 (Qualification)", severity: "High",
    evidenceGaps: ["Validation Master Plan reference", "IQ/OQ/PQ protocols + reports", "Traceability matrix"],
  },
  {
    match: ["risk assessment", "risk management", "quality risk"],
    framework: "ichq9", clause: "ICH Q9 §4 (Risk Assessment)", severity: "High",
    evidenceGaps: ["Documented risk assessment (FMEA/HACCP)", "Risk-control / mitigation plan"],
  },
  {
    match: ["training", "competency", "retrain", "qualification of personnel"],
    framework: "ichq10", clause: "ICH Q10 §2.4 (Training)", severity: "Low",
    evidenceGaps: ["Training matrix", "Completion records / certificates", "Training-effectiveness evidence"],
  },
  {
    match: ["calibration", "maintenance", "preventive maintenance", "equipment"],
    framework: "p210", clause: "21 CFR 211.68", severity: "High",
    evidenceGaps: ["Calibration certificates", "Preventive-maintenance schedule + logs"],
  },
];

const TRIAGE_DEFAULT: Omit<TriageRule, "match"> = {
  framework: "p210", clause: "21 CFR 211.22 (Quality unit responsibilities)", severity: "High",
  evidenceGaps: ["Governing SOP", "Objective evidence of compliant practice", "Most recent review/approval record"],
};

export function mockFindingTriage(
  requirement: string,
  area: string,
  purpose: string,
  activeFrameworks: string[],
): FindingTriageResult {
  void purpose; // accepted for signature parity; mock derives from requirement + area.
  const haystack = `${requirement} ${area}`.toLowerCase();
  const rule = TRIAGE_RULES.find((r) => r.match.some((m) => haystack.includes(m)));
  const picked = rule ?? TRIAGE_DEFAULT;

  // Constrain to the tenant's active frameworks, exactly like the backend.
  const allowed = activeFrameworks.filter((f) => f in TRIAGE_FRAMEWORK_LABELS);
  const framework =
    allowed.length === 0 || allowed.includes(picked.framework)
      ? picked.framework
      : allowed[0];

  const sevReason: Record<FindingTriageSeverity, string> = {
    Critical: "Direct patient-safety or data-integrity exposure — likely 483 observation if uncorrected.",
    High: "Significant GMP compliance gap requiring prompt corrective action.",
    Low: "Administrative / lower-risk gap; address within the standard cycle.",
  };

  const focus = requirement.trim().replace(/\.$/, "");
  return {
    framework,
    frameworkLabel: TRIAGE_FRAMEWORK_LABELS[framework] ?? framework,
    clause: picked.clause,
    severity: picked.severity,
    severityRationale: sevReason[picked.severity],
    agiSummary:
      `This gap maps to ${TRIAGE_FRAMEWORK_LABELS[framework] ?? framework} (${picked.clause}). ` +
      `"${focus}" presents a ${picked.severity.toLowerCase()} compliance risk` +
      `${area ? ` in ${area}` : ""}; ensure the evidence below is assembled before inspection.`,
    evidenceGaps: picked.evidenceGaps,
    suggestedCapaTitle: `Remediate: ${focus.slice(0, 64)}`,
    confidence: rule ? 88 : 70,
    source: "mock",
  };
}
