# CAPA (Corrective and Preventive Action) Workflow

> Pharmaceutical Industry Standard CAPA Process for GxP Compliance

---

## Table of Contents

1. [Overview](#overview)
2. [CAPA Sources](#capa-sources)
3. [CAPA Lifecycle](#capa-lifecycle)
4. [Linking Structure](#linking-structure)
5. [AI-Powered Features](#ai-powered-features)
6. [Detailed Workflow](#detailed-workflow)
7. [Data Model](#data-model)
8. [Regulatory Requirements](#regulatory-requirements)
9. [User Interface Flow](#user-interface-flow)

---

## Overview

CAPA is a systematic approach to investigating, correcting, and preventing quality issues in pharmaceutical manufacturing. It is mandated by FDA regulations (21 CFR 211, 21 CFR 820) and international standards (ICH Q10, EU GMP).

### Key Principles

- **Corrective Action**: Eliminates the cause of an existing nonconformity
- **Preventive Action**: Eliminates the cause of a potential nonconformity
- **Root Cause Analysis**: Systematic investigation to identify true cause
- **Effectiveness Verification**: Confirms actions prevent recurrence

---

## CAPA Sources

CAPAs are **never created in isolation** - they always originate from another quality event:

| Source | Trigger Criteria | Auto-Link |
|--------|------------------|-----------|
| **Gap Assessment Finding** | Critical/Major severity findings | `findingId` |
| **Deviation** | Major/Critical deviations requiring systemic fix | `deviationId` |
| **OOS Investigation** | Confirmed Out-of-Specification results | `oosId` |
| **FDA 483 Observation** | Each observation requires CAPA | `observationId` |
| **Internal Audit** | Critical audit findings | `auditFindingId` |
| **Customer Complaint** | Valid quality complaints | `complaintId` |
| **Management Review** | Identified improvement areas | `reviewId` |
| **Supplier Issue** | Supplier quality failures | `supplierIssueId` |

### Source-to-CAPA Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Quality Event  │ ──► │   Assessment    │ ──► │  CAPA Required? │
│   Identified    │     │   & Triage      │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                    ┌────────────────────┼────────────────────┐
                                    │ YES                │                NO  │
                                    ▼                    │                    ▼
                           ┌─────────────────┐           │           ┌─────────────────┐
                           │  Create CAPA    │           │           │ Close with      │
                           │  (Auto-linked)  │           │           │ Immediate Action│
                           └─────────────────┘           │           └─────────────────┘
```

---

## CAPA Lifecycle

### Status Flow

```
┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌──────────┐
│   OPEN   │ → │ INVESTIGATION│ → │ IMPLEMENTATION│ → │ PENDING REVIEW  │ → │  CLOSED  │
│          │   │              │   │               │   │                 │   │          │
└──────────┘   └──────────────┘   └───────────────┘   └─────────────────┘   └──────────┘
     │               │                   │                    │                  │
     ▼               ▼                   ▼                    ▼                  ▼
 • Created       • RCA in           • Actions           • QA Review         • E-signed
 • Assigned        progress           being             • Effectiveness     • Audit trail
 • Risk set      • Evidence           executed            verified            complete
                   gathering        • Due dates         • Approval          • Metrics
                                      tracked             pending             updated
```

### Detailed Stages

#### Stage 1: Initiation
- CAPA created from source record
- Automatic linking to source
- Risk level inherited or assessed
- Owner assigned
- Target completion date set
- DI Gate flag set (if data integrity related)

#### Stage 2: Investigation (Root Cause Analysis)
- RCA method selected (5 Why, Fishbone, Fault Tree, etc.)
- Investigation conducted
- Root cause identified and documented
- Contributing factors noted
- AI assistance available:
  - Find similar historical CAPAs
  - Suggest potential root causes
  - Detect recurrence patterns

#### Stage 3: Action Planning
- Corrective actions defined (fix immediate issue)
- Preventive actions defined (prevent recurrence)
- Each action has:
  - Description
  - Owner
  - Due date
  - Expected outcome
- Horizontal deployment considered (other sites/products)

#### Stage 4: Implementation
- Actions executed per plan
- Evidence collected and attached
- Progress tracked
- Delays escalated
- Interim measures documented

#### Stage 5: Effectiveness Verification
- Effectiveness check date set
- Verification criteria defined
- Check performed after implementation
- Results documented
- If ineffective: CAPA reopened or new CAPA created

#### Stage 6: Closure
- All actions completed with evidence
- Effectiveness verified
- QA Head review
- Electronic signature (21 CFR Part 11 compliant)
- Source record status updated
- Metrics and trending updated

---

## Linking Structure

### Primary Links (1:1)

```
Source Record                         CAPA
─────────────                         ────
Finding FND-2026-001    ◄────────►    CAPA-2026-001
  └── linkedCAPAId ─────────────────► id
      status: "CAPA Initiated"        sourceType: "Finding"
                                      sourceRecordId: "FND-2026-001"
```

### Secondary Links (AI-Suggested)

```
                    CAPA-2026-001
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    CAPA-2025-018   CAPA-2025-042   CAPA-2024-089
    (Same area)     (Similar RCA)   (Same site)

    relatedCAPAs: ["CAPA-2025-018", "CAPA-2025-042", "CAPA-2024-089"]
    relationshipType: "AI_SUGGESTED"
```

### Evidence Links (1:Many)

```
CAPA-2026-001
     │
     ├── Document: RCA_Report.pdf
     ├── Document: Training_Records.pdf
     ├── Document: Action_Evidence_1.pdf
     ├── Document: Effectiveness_Check.pdf
     └── Document: Closure_Summary.pdf
```

---

## AI-Powered Features

### 1. Similar CAPA Detection

**Trigger**: User clicks "Find Similar CAPAs" during investigation

**Algorithm**:
```
1. Extract keywords from current CAPA description and area
2. Search historical CAPAs (last 3 years) by:
   - Text similarity (description, root cause)
   - Same area (Laboratory, Production, QA, etc.)
   - Same site or cross-site
   - Same source type
   - Similar severity
3. Rank by relevance score
4. Return top 5-10 matches with similarity %
```

**Use Cases**:
- Identify if issue occurred before
- Learn from past investigations
- Prevent duplicate efforts
- Detect systemic issues

### 2. Root Cause Suggestion

**Trigger**: User clicks "Suggest Root Cause" during RCA

**Algorithm**:
```
1. Analyze current CAPA description
2. Find similar closed CAPAs with confirmed root causes
3. Cluster root causes by category
4. AI generates suggestions based on:
   - Historical patterns
   - Industry knowledge base
   - Regulatory guidance
5. Present ranked suggestions with confidence %
```

**Output Example**:
```
Suggested Root Causes:
├── 85% - Inadequate procedure/SOP
├── 72% - Training deficiency
├── 68% - Equipment malfunction
└── 45% - Environmental factors
```

### 3. Recurrence Detection

**Trigger**: Automatic on CAPA creation

**Algorithm**:
```
1. Search for similar closed CAPAs (last 18 months)
2. Check if:
   - Same area + same site
   - Similar description keywords
   - Same root cause category
3. If match found:
   - Generate RECURRENCE ALERT
   - Link to previous CAPA
   - Flag for management attention
```

**Alert Example**:
```
⚠️ RECURRENCE WARNING

Similar CAPA (CAPA-2025-018) was closed 8 months ago.
Root Cause: "Inadequate temperature monitoring"
Status: Closed on 2025-08-15

Action Required:
- Review effectiveness of previous CAPA
- Consider horizontal deployment
- Escalate to management if systemic
```

### 4. Action Recommendations

**Trigger**: User clicks "Suggest Actions" after RCA

**Algorithm**:
```
1. Identify root cause category
2. Find successful CAPAs with same root cause
3. Extract corrective/preventive actions that:
   - Led to successful closure
   - Had verified effectiveness
   - Were completed on time
4. Present as recommendations
```

### 5. Risk Auto-Classification

**Trigger**: On CAPA creation

**Algorithm**:
```
1. Analyze source record severity
2. Check keywords for risk indicators:
   - Patient safety impact
   - Product quality impact
   - Regulatory impact
   - Data integrity concerns
3. Apply risk matrix
4. Suggest risk level (HIGH/MEDIUM/LOW)
```

---

## Detailed Workflow

### Scenario: Temperature Excursion → Deviation → CAPA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: DEVIATION CREATED                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID: DEV-2026-042                                                            │
│ Title: Temperature excursion in Cold Room #3                                │
│ Type: Environmental                                                         │
│ Severity: Major (auto-calculated based on impact)                           │
│ Immediate Action: Products transferred to Cold Room #2                      │
│ Investigation: Reveals door seal degradation + no automated alerts          │
│                                                                             │
│ Assessment: Systemic issue identified → CAPA Required                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: CAPA INITIATED FROM DEVIATION                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID: CAPA-2026-015                                                           │
│ Source: Deviation (DEV-2026-042) ◄── Auto-linked                            │
│ Description: Implement robust temperature monitoring with automated alerts  │
│ Risk: HIGH (inherited from source severity)                                 │
│ Owner: QA Head                                                              │
│ Due Date: 2026-05-30                                                        │
│ DI Gate: Yes (electronic records involved)                                  │
│                                                                             │
│ [Deviation status changes to "CAPA Initiated"]                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: AI ANALYSIS                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ [User clicks "Find Similar CAPAs"]                                          │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Results:                                                                │ │
│ │ • CAPA-2025-018 (87% match) - Same cold room, 8 months ago              │ │
│ │   Root Cause: Manual monitoring prone to gaps                           │ │
│ │   Status: Closed                                                        │ │
│ │                                                                         │ │
│ │ • CAPA-2024-033 (72% match) - Temperature issue, Mumbai site            │ │
│ │   Root Cause: No redundant sensors                                      │ │
│ │   Status: Closed                                                        │ │
│ │                                                                         │ │
│ │ ⚠️ RECURRENCE ALERT: CAPA-2025-018 addressed similar issue.             │ │
│ │    Verify effectiveness of previous corrective actions.                 │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [User clicks "Suggest Root Cause"]                                          │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ AI Suggestions:                                                         │ │
│ │ • 89% - Lack of automated temperature monitoring system                 │ │
│ │ • 76% - Inadequate preventive maintenance for door seals                │ │
│ │ • 65% - No real-time alerting mechanism                                 │ │
│ │ • 52% - Training gap on manual monitoring procedures                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: ROOT CAUSE ANALYSIS                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ RCA Method: 5 Why Analysis                                                  │
│                                                                             │
│ Why 1: Why did temperature excursion occur?                                 │
│         → Door was left open for extended period                            │
│                                                                             │
│ Why 2: Why was the door left open?                                          │
│         → Personnel unaware of proper closure procedures                    │
│                                                                             │
│ Why 3: Why were they unaware?                                               │
│         → No automated alerts when door open > 2 minutes                    │
│                                                                             │
│ Why 4: Why no automated alerts?                                             │
│         → System relies on manual temperature checks only                   │
│                                                                             │
│ Why 5: Why manual checks only?                                              │
│         → Automated monitoring system never implemented                     │
│                                                                             │
│ ROOT CAUSE: Lack of automated temperature monitoring and alerting system   │
│                                                                             │
│ DI Gate Review: ✓ Reviewed by QA Head                                       │
│ DI Gate Notes: Electronic records from SCADA reviewed, no integrity issues  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: CORRECTIVE & PREVENTIVE ACTIONS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ CORRECTIVE ACTIONS (Fix immediate issue):                                   │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ CA-1: Replace degraded door seals on Cold Room #3                       │ │
│ │       Owner: Facilities    Due: 2026-04-20    Status: Completed ✓       │ │
│ │                                                                         │ │
│ │ CA-2: Conduct impact assessment on affected products                    │ │
│ │       Owner: QA            Due: 2026-04-15    Status: Completed ✓       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ PREVENTIVE ACTIONS (Prevent recurrence):                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ PA-1: Install IoT temperature sensors with continuous monitoring        │ │
│ │       Owner: IT/Eng        Due: 2026-05-15    Status: In Progress       │ │
│ │                                                                         │ │
│ │ PA-2: Configure real-time alerts (email, SMS, dashboard)                │ │
│ │       Owner: IT            Due: 2026-05-20    Status: Not Started       │ │
│ │                                                                         │ │
│ │ PA-3: Implement door open alerts (>2 min threshold)                     │ │
│ │       Owner: Facilities    Due: 2026-05-20    Status: Not Started       │ │
│ │                                                                         │ │
│ │ PA-4: Update SOP for cold room monitoring                               │ │
│ │       Owner: QA            Due: 2026-05-25    Status: Not Started       │ │
│ │                                                                         │ │
│ │ PA-5: Train all personnel on new monitoring system                      │ │
│ │       Owner: Training      Due: 2026-05-30    Status: Not Started       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ HORIZONTAL DEPLOYMENT:                                                      │
│ • Extend to Cold Rooms #1, #2, #4 at Chennai site                          │
│ • Evaluate implementation at Mumbai and Hyderabad sites                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: IMPLEMENTATION & EVIDENCE                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Evidence Attached:                                                          │
│ ├── Door_Seal_Replacement_Record.pdf                                        │
│ ├── Product_Impact_Assessment.pdf                                           │
│ ├── IoT_Sensor_Installation_Report.pdf                                      │
│ ├── Alert_Configuration_Screenshots.pdf                                     │
│ ├── Updated_SOP_QA_042_v3.pdf                                              │
│ └── Training_Completion_Records.pdf                                         │
│                                                                             │
│ All actions completed: ✓                                                    │
│ Status changed to: Pending QA Review                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: EFFECTIVENESS VERIFICATION                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Effectiveness Check Date: 2026-06-30 (30 days post-implementation)         │
│                                                                             │
│ Verification Criteria:                                                      │
│ ✓ No temperature excursions in Cold Room #3 for 30 days                    │
│ ✓ Alert system triggered appropriately during test scenarios                │
│ ✓ All personnel completed training (100% compliance)                        │
│ ✓ SOP implemented and followed per observations                             │
│                                                                             │
│ Result: EFFECTIVE                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: CLOSURE                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ QA Review: ✓ Complete                                                       │
│ Reviewer: Dr. Priya Sharma (QA Head)                                        │
│                                                                             │
│ Electronic Signature:                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Signed by: Dr. Priya Sharma                                             │ │
│ │ Meaning: "I have reviewed this CAPA and approve its closure"            │ │
│ │ Timestamp: 2026-07-02 14:32:15 IST                                      │ │
│ │ Signature Hash: SHA-256:a3f2b8c9...                                     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ CAPA Status: CLOSED                                                         │
│ Deviation Status: CLOSED (auto-updated)                                     │
│                                                                             │
│ Audit Trail: Complete (21 CFR Part 11 compliant)                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### CAPA Entity

```typescript
interface CAPA {
  // Identity
  id: string;                    // CAPA-2026-001
  tenantId: string;
  siteId: string;

  // Source Linking
  source: CAPASource;            // "Deviation" | "Finding" | "FDA483" | ...
  sourceRecordId: string;        // DEV-2026-042

  // Classification
  description: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  priority: "Critical" | "High" | "Medium" | "Low";

  // Assignment
  owner: string;                 // User ID
  dueDate: Date;

  // Investigation
  rcaMethod: "5Why" | "Fishbone" | "FaultTree" | "FMEA" | null;
  rootCause: string | null;
  contributingFactors: string | null;

  // DI Gate (Data Integrity)
  diGate: boolean;
  diGateStatus: "Pending" | "Reviewed" | "Approved" | null;
  diGateReviewedBy: string | null;
  diGateReviewDate: Date | null;
  diGateNotes: string | null;

  // Actions
  correctiveActions: CAPAAction[];
  preventiveActions: CAPAAction[];

  // Effectiveness
  effectivenessCheck: boolean;
  effectivenessDate: Date | null;
  effectivenessResult: "Effective" | "Ineffective" | null;
  effectivenessNotes: string | null;

  // AI Links
  relatedCAPAs: string[];        // AI-suggested similar CAPAs
  recurrenceAlert: boolean;

  // Status & Closure
  status: CAPAStatus;
  closedBy: string | null;
  closedAt: Date | null;

  // Audit
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

type CAPASource =
  | "Deviation"
  | "Finding"
  | "FDA483"
  | "InternalAudit"
  | "CustomerComplaint"
  | "SupplierIssue"
  | "ManagementReview"
  | "Other";

type CAPAStatus =
  | "Open"
  | "Investigation"
  | "Implementation"
  | "Pending QA Review"
  | "Closed";

interface CAPAAction {
  id: string;
  type: "Corrective" | "Preventive";
  description: string;
  owner: string;
  dueDate: Date;
  status: "Not Started" | "In Progress" | "Completed" | "Overdue";
  completedDate: Date | null;
  evidence: string[];            // Document IDs
}
```

---

## Regulatory Requirements

### FDA 21 CFR 211.192
- Investigation of unexplained discrepancies
- Extension of investigation to other batches

### FDA 21 CFR 820.100 (Medical Devices)
- Procedures for implementing CAPA
- Verification of effectiveness

### ICH Q10
- CAPA as part of Pharmaceutical Quality System
- Knowledge management from CAPAs

### EU GMP Chapter 1
- Quality Risk Management integration
- Continuous improvement through CAPA

### 21 CFR Part 11 Compliance
- Electronic signatures for closure
- Complete audit trail
- Data integrity throughout lifecycle

---

## User Interface Flow

### CAPA List View
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CAPA Management                                          [+ New CAPA]       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Filters: [Status ▼] [Risk ▼] [Site ▼] [Owner ▼]    Search: [____________]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ID          │ Description           │ Source    │ Risk │ Status    │ Due    │
├─────────────┼───────────────────────┼───────────┼──────┼───────────┼────────┤
│ CAPA-2026-015│ Temperature monitoring│ Deviation │ HIGH │ In Progress│ May 30 │
│ CAPA-2026-014│ Audit trail config   │ Finding   │ HIGH │ Open      │ May 15 │
│ CAPA-2026-013│ Batch review workflow│ Audit     │ MED  │ Pending   │ Jun 01 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CAPA Detail View
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CAPA-2026-015                                    [Edit] [AI Analysis ▼]     │
│ Implement temperature monitoring system                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Source: Deviation DEV-2026-042 (linked)          Risk: HIGH                  │
│ Owner: Dr. Priya Sharma                          Due: 2026-05-30            │
│ Status: In Progress ●●●○○                        DI Gate: Pending           │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Overview] [Investigation] [Actions] [Evidence] [Timeline] [AI Insights]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AI Insights Panel                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ⚠️ Recurrence Alert: Similar CAPA closed 8 months ago                   ││
│  │ 📊 3 similar CAPAs found (click to view)                                ││
│  │ 💡 AI-suggested root cause available                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### Incoming Integrations
- **Deviation Module**: Create CAPA from deviation
- **Gap Assessment**: Create CAPA from finding
- **FDA 483 Module**: Create CAPA from observation
- **Audit Module**: Create CAPA from audit finding
- **Complaint Module**: Create CAPA from complaint

### Outgoing Integrations
- **Document Management**: Evidence attachment
- **Training Module**: Training records for effectiveness
- **Audit Trail**: All CAPA actions logged
- **Dashboard**: KPIs and metrics
- **AGI Console**: AI analysis results

---

## Metrics & KPIs

| Metric | Target | Calculation |
|--------|--------|-------------|
| CAPA Closure Rate | >90% | Closed on time / Total due |
| Average Days to Close | <45 days | Sum(closure days) / Count |
| Effectiveness Rate | >95% | Effective / Total verified |
| Recurrence Rate | <5% | Recurred / Total closed |
| Overdue CAPAs | 0 | Count where due < today |

---

## Appendix: RCA Methods

### 5 Why Analysis
Simple iterative questioning to find root cause.

### Fishbone (Ishikawa) Diagram
Categories: Man, Machine, Method, Material, Measurement, Environment

### Fault Tree Analysis
Top-down deductive failure analysis.

### FMEA
Failure Mode and Effects Analysis with risk prioritization.

---

*Document Version: 1.0*
*Last Updated: April 2026*
*Author: Quality Systems Team*
