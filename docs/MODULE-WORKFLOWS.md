# Pharma Glimmora - Module Workflows & Feature Documentation

> GxP/GMP Compliance Platform - Complete Module Reference

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Module Summary](#module-summary)
3. [Detailed Module Features](#detailed-module-features)
4. [Inter-Module Connections](#inter-module-connections)
5. [Critical Workflow Flows](#critical-workflow-flows)
6. [Training & Awareness Program Flow](#training--awareness-program-flow)
7. [Data Flow Diagram](#data-flow-diagram)

---

## Platform Overview

Pharma Glimmora is a GxP/GMP inspection readiness and compliance management platform. It helps pharmaceutical, biotech, and medical device companies:

- Track regulatory gaps and findings
- Manage corrective and preventive actions (CAPAs)
- Handle FDA 483 observations and responses
- Validate computer systems (CSV/CSA)
- Prepare for regulatory inspections
- Maintain 21 CFR Part 11 compliant audit trails

---

## Module Summary

| Module | Purpose | Key Data |
|--------|---------|----------|
| **Dashboard** | Executive overview of compliance status | KPIs, heatmap, trends |
| **Gap Assessment** | Identify and track regulatory gaps | Findings with severity, framework, evidence |
| **Deviation Management** | Track unplanned/planned deviations | Deviations with impact assessment, RCA |
| **CAPA Tracker** | Corrective & Preventive Actions | CAPAs linked to sources, DI gate |
| **CSV/CSA Validation** | Computer system validation | Systems, validation stages, RTM |
| **FDA 483 & Regulatory** | Inspection observations & responses | Events, observations, commitments |
| **Evidence & Documents** | Document library with compliance tags | SOPs, records, certificates |
| **Training & Awareness** | Inspection prep, training, simulations | Cards, playbooks, training records |
| **Governance & KPIs** | KPI scorecard, RAID log | Metrics, risks, actions, issues |
| **Audit Trail** | Immutable compliance log | All system actions (21 CFR 11) |

---

## Detailed Module Features

### 1. Dashboard

**Purpose:** Real-time executive overview of compliance status across all sites.

**Features:**
- 5 KPI cards (Readiness Score, Critical Findings, CAPA Overdue %, CSV High Risk, Training Compliance)
- Multi-site compliance heatmap (color-coded by area)
- 6-month finding trend chart (by severity)
- 90-day action plan table
- AGI insights panel (if enabled)
- Site and date range filters

**Data Sources:** Aggregates from all other modules

---

### 2. Gap Assessment

**Purpose:** Identify, document, and track regulatory compliance gaps.

**Features:**
- Create/edit findings with:
  - Regulatory framework (21 CFR 210/211, Part 11, EU GMP Annex 11, ICH Q9, GAMP 5)
  - Area (Manufacturing, QC Lab, Warehouse, Utilities, QMS, CSV/IT)
  - Severity (Critical, High, Low)
  - Owner assignment and target date
- Evidence linking (URL to documents)
- Raise CAPA directly from finding
- Summary view by area
- Evidence index tab

**Workflow:**
```
Create Finding → Assign Owner → Link Evidence → Raise CAPA (optional) → Close
```

**Status Progression:**
```
Open → In Progress → Pending Verification → Closed (or Risk Accepted)
```

**Connections:**
- Creates CAPAs (source: "Gap Assessment")
- Links to Evidence documents
- Feeds Dashboard KPIs

---

### 3. Deviation Management

**Purpose:** Document and investigate unplanned/planned deviations from procedures.

**Features:**
- Deviation types: Planned, Unplanned
- Categories: Equipment, Process, Material, Documentation, Environmental, Other
- 3-level impact assessment:
  - Patient Safety Impact
  - Product Quality Impact
  - Regulatory Impact
- Root Cause Analysis (5-Why, Fishbone, Fault Tree)
- Immediate action logging
- Batch tracking (affected batches)
- Document upload
- CAPA linkage

**Workflow:**
```
Report Deviation → Immediate Action → RCA Investigation → Link CAPA → QA Review → Close
```

**Status Progression:**
```
Draft → Open → Under Investigation → Pending QA Review → Closed (or Rejected)
```

**Connections:**
- Creates/links to CAPAs (source: "Deviation")
- Feeds Governance KPIs

---

### 4. CAPA Tracker

**Purpose:** Manage Corrective and Preventive Actions from multiple sources.

**Features:**
- Multi-source CAPA creation:
  - Gap Assessment findings
  - Deviations
  - FDA 483 observations
  - Internal audits
  - Complaints
  - OOS (Out of Specification)
  - Change Control
- Root Cause Analysis with method selection
- Corrective action planning
- Effectiveness check tracking
- Data Integrity (DI) Gate for high-risk CAPAs
- Document management
- GxP signatory Sign & Close workflow
- CAPA detail page with nested tabs

**Workflow:**
```
Create CAPA → RCA → Corrective Actions → Evidence → QA Review → Sign & Close
```

**Status Progression:**
```
Open → In Progress → Pending QA Review → Closed
```

**DI Gate Flow (for high-risk systems):**
```
CAPA In Progress → DI Gate Review Required → DI Gate Cleared → QA Review → Sign & Close
```

**Connections:**
- Linked FROM: Gap Assessment, Deviation, FDA 483
- Links TO: CSV/CSA systems (linkedSystemId)
- Feeds Dashboard and Governance KPIs

---

### 5. CSV/CSA Validation

**Purpose:** Manage computer system validation lifecycle.

**Features:**
- System inventory (LIMS, ERP, CDS, SCADA, MES, CMMS, Custom)
- GAMP 5 categorization (Cat 1-5)
- Risk assessment (HIGH, MEDIUM, LOW)
- 7-stage validation lifecycle:
  1. URS (User Requirements Specification)
  2. FS (Functional Specification)
  3. DS (Design Specification)
  4. IQ (Installation Qualification)
  5. OQ (Operational Qualification)
  6. PQ (Performance Qualification)
  7. RTR (Requirements Traceability Review)
- Compliance status per framework (Part 11, Annex 11, GAMP 5)
- Validation roadmap (timeline view)
- RTM (Requirements Traceability Matrix)

**Workflow:**
```
Add System → Risk Assessment → URS → FS → DS → IQ → OQ → PQ → RTR → Validated
```

**Connections:**
- Linked FROM: CAPAs (for system changes)
- Feeds Dashboard (CSV High Risk KPI)
- Feeds Governance (CSV Drift KPI)

---

### 6. FDA 483 & Regulatory

**Purpose:** Manage regulatory inspection observations and responses.

**Features:**
- Event types: FDA 483, Warning Letter, EMA/MHRA/WHO Inspections
- Observation tracking with:
  - Severity and area assignment
  - RCA per observation
  - CAPA linkage (multiple CAPAs per observation)
- Response drafting (manual or AGI-assisted)
- Commitment tracking with due dates
- Response document management
- QA sign-off workflow

**Workflow:**
```
Create Event → Add Observations → RCA per Obs → Link CAPAs → Draft Response → QA Sign-off → Submit
```

**Status Progression (Event):**
```
Open → Under Investigation → Response Due → Response Drafted → Pending QA Sign-off → Response Submitted → Closed
```

**Status Progression (Observation):**
```
Open → RCA In Progress → CAPA Linked → Response Ready → Response Drafted → Closed
```

**Connections:**
- Creates/links CAPAs per observation
- Links to Inspections in Training & Awareness
- Feeds Governance (Overdue Commitments, Repeat Observations)

---

### 7. Evidence & Documents

**Purpose:** Central document library with compliance tagging.

**Features:**
- Document types: SOP, Record, Audit Trail, Validation, Report, Protocol, Certificate, Policy
- Area categorization (Manufacturing, QC Lab, etc.)
- Status tracking (Current, Draft, Superseded, Missing, Under Review)
- Compliance tagging (Part 11, Annex 11, etc.)
- Version control with effective/expiry dates
- Document packs for inspection readiness
- Grid and list view options

**Workflow:**
```
Add Document → Tag Compliance → Set Status → Create Pack (optional) → Export
```

**Connections:**
- Referenced FROM: Gap Assessment (evidenceLink), CAPA, Deviation, FDA 483
- Linked to specific findings, CAPAs, systems, events

---

### 8. Training & Awareness Program

**Purpose:** Prepare organization for regulatory inspections through training and simulations.

**Features:**
- **Roadmap Tab:** Kanban-style action cards
  - 5 Lanes: People, Process, Data, Systems, Documentation
  - 3 Buckets: Immediate, 31-60 days, 61-90 days
  - Action status tracking with due dates

- **Training Tab:**
  - Training modules: GxP Fundamentals, Inspection Readiness, Front Room Protocol, Back Room Protocol, DIL Handling, Part 11 Compliance, CAPA Management, Data Integrity
  - User completion tracking with scores

- **Simulations Tab:**
  - Mock inspection scheduling
  - Types: Front Room Q&A, Back Room Document Review, SME Q&A, DIL Handling
  - Score tracking per simulation

- **Playbooks Tab:**
  - Front Room playbook (steps for inspector interactions)
  - Back Room playbook (document retrieval procedures)
  - SME playbook (subject matter expert guidance)
  - DIL Handling playbook (document/information list management)

- **Governance Tab:**
  - Inspection scoring
  - RACI matrix

**Detailed Flow (see next section)**

**Connections:**
- Links to FDA 483 events (when actual inspection occurs)
- Feeds Dashboard (Readiness Score)
- Feeds Governance KPIs

---

### 9. Governance & KPIs

**Purpose:** Executive compliance metrics and risk management.

**Features:**
- **KPI Scorecard:**
  - CAPA Timeliness (% closed on time)
  - DI Gate Exceptions (high-risk CAPAs pending)
  - CSV Drift (systems with validation issues)
  - Overdue Commitments (FDA 483)
  - Repeat Observations
  - Audit Trail Coverage

- **RAID Log:**
  - Risks, Actions, Issues, Decisions
  - Priority levels (Critical, High, Medium, Low)
  - Owner assignment and due dates
  - Resolution tracking

- **Reports Tab:**
  - Monthly Quality KPI Report
  - RAID Log Export
  - Training & Awareness Pack

**Connections:**
- Reads from ALL modules to calculate KPIs
- RAID items can be escalated from any module

---

### 10. Audit Trail

**Purpose:** Immutable log of all compliance-related actions (21 CFR Part 11).

**Features:**
- Records every create, update, delete action
- Captures: timestamp (server-side), user, role, module, action, old/new values
- Filter by module, action type, user, date range
- Export to CSV
- Color-coded by action type (Critical, Status Change, Create)

**Immutability:** No edit or delete capability (compliance requirement)

**Connections:**
- Receives logs from ALL modules via `auditLog()` utility

---

## Inter-Module Connections

### Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DASHBOARD                                    │
│            (Aggregates KPIs from all modules)                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Gap Assessment│      │     CAPA      │      │   FDA 483     │
│   (Findings)  │─────▶│   (Actions)   │◀─────│(Observations) │
└───────────────┘      └───────────────┘      └───────────────┘
        │                       │                       │
        │               ┌───────┴───────┐               │
        │               │               │               │
        ▼               ▼               ▼               ▼
┌───────────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────┐
│   Deviation   │ │  CSV/CSA  │ │ Evidence  │ │   Training    │
│    (RCA)      │ │ (Systems) │ │  (Docs)   │ │  & Awareness  │
└───────────────┘ └───────────┘ └───────────┘ └───────────────┘
        │               │               │               │
        └───────────────┴───────────────┴───────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
            ┌───────────────┐      ┌───────────────┐
            │  Governance   │      │  Audit Trail  │
            │  (KPIs/RAID)  │      │  (Immutable)  │
            └───────────────┘      └───────────────┘
```

### Key Linkages

| From | To | Link Type | Purpose |
|------|-----|-----------|---------|
| Gap Assessment | CAPA | Creates | Raise CAPA from finding |
| Deviation | CAPA | Creates/Links | CAPA for deviation correction |
| FDA 483 Observation | CAPA | Links | CAPA for observation response |
| CAPA | CSV/CSA System | Links | System change tracking |
| All Modules | Evidence | Links | Evidence trail |
| Training & Awareness | FDA 483 | Links | Actual inspection link |
| All Modules | Audit Trail | Logs | Compliance record |

---

## Critical Workflow Flows

### Flow 1: Finding → CAPA → Closure

```
┌─────────────────┐
│ GAP ASSESSMENT  │
│ Create Finding  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Assign Owner &  │
│ Set Target Date │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Link Evidence   │
│ (Document URL)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Raise CAPA      │────▶│  CAPA TRACKER   │
│ (Optional)      │     │  Create CAPA    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ Root Cause      │
         │              │ Analysis (RCA)  │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ Corrective      │
         │              │ Actions         │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ Effectiveness   │
         │              │ Check           │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ QA Review       │
         │              │                 │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ Sign & Close    │
         │              │ (GxP Signatory) │
         │              └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Update Finding  │     │ CAPA Closed     │
│ Status: Closed  │     │                 │
└─────────────────┘     └─────────────────┘
```

### Flow 2: FDA 483 Response

```
┌─────────────────┐
│   FDA 483       │
│ Create Event    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Add Observations│
│ (1, 2, 3...)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RCA per         │
│ Observation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Create/Link     │────▶│  CAPA TRACKER   │
│ CAPA(s)         │     │  (Complete)     │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Draft Response  │
│ (Manual or AGI) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Add Commitments │
│ (Due dates)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ QA Sign-off     │
│                 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Submit Response │
│ (Immutable)     │
└─────────────────┘
```

### Flow 3: Deviation → CAPA → DI Gate

```
┌─────────────────┐
│   DEVIATION     │
│ Report Incident │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Immediate       │
│ Action          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Impact          │
│ Assessment      │
│ (3 levels)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RCA             │
│ (5-Why/Fishbone)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Create CAPA     │────▶│  CAPA TRACKER   │
│ (Link)          │     └────────┬────────┘
└────────┬────────┘              │
         │                       ▼
         │              ┌─────────────────┐
         │              │ High Risk?      │
         │              │ DI Gate = Yes   │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ DI Gate Review  │
         │              │ Required        │
         │              └────────┬────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │ DI Gate Cleared │
         │              │ (Sign-off)      │
         │              └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ QA Review       │     │ Sign & Close    │
│ Deviation       │     │ CAPA            │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Close Deviation │
└─────────────────┘
```

---

## Training & Awareness Program Flow

### Complete Inspection Preparation Workflow

```
┌──────────────────────────────────────────────────────────────────────┐
│                    TRAINING & AWARENESS PROGRAM                       │
│                    (Inspection Preparation Flow)                      │
└──────────────────────────────────────────────────────────────────────┘

PHASE 1: PLANNING (90+ days before inspection)
═══════════════════════════════════════════════

┌─────────────────┐
│ Create          │
│ Inspection      │
│ (Agency, Type)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Set Expected    │
│ Inspection Date │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create Roadmap  │
│ Cards           │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┬────────┐
    │         │        │        │        │
    ▼         ▼        ▼        ▼        ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│PEOPLE │ │PROCESS│ │ DATA  │ │SYSTEMS│ │ DOCS  │
│ Lane  │ │ Lane  │ │ Lane  │ │ Lane  │ │ Lane  │
└───────┘ └───────┘ └───────┘ └───────┘ └───────┘
    │         │        │        │        │
    └─────────┴────────┴────────┴────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │ Assign Cards to Buckets │
         │ • Immediate             │
         │ • 31-60 days            │
         │ • 61-90 days            │
         └─────────────────────────┘


PHASE 2: TRAINING (60-30 days before inspection)
════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      TRAINING MODULES                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ GxP          │  │ Inspection   │  │ Front Room   │              │
│  │ Fundamentals │  │ Readiness    │  │ Protocol     │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Back Room    │  │ DIL          │  │ Part 11      │              │
│  │ Protocol     │  │ Handling     │  │ Compliance   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                        │
│  ┌──────────────┐  ┌──────────────┐                                 │
│  │ CAPA         │  │ Data         │                                 │
│  │ Management   │  │ Integrity    │                                 │
│  └──────┬───────┘  └──────┬───────┘                                 │
│         │                 │                                          │
└─────────┴─────────────────┴──────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │ Track Completion        │
              │ • User ID               │
              │ • Module                │
              │ • Score (optional)      │
              │ • Completion Date       │
              └─────────────────────────┘


PHASE 3: SIMULATIONS (30-7 days before inspection)
══════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                      MOCK INSPECTIONS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    SIMULATION TYPES                             │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │                                                                  │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │ │
│  │  │ Front Room  │  │ Back Room   │  │ SME Q&A     │            │ │
│  │  │ Q&A         │  │ Document    │  │ Practice    │            │ │
│  │  │             │  │ Review      │  │             │            │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │ │
│  │         │                │                │                     │ │
│  │  ┌─────────────┐                                               │ │
│  │  │ DIL         │                                               │ │
│  │  │ Handling    │                                               │ │
│  │  │ Practice    │                                               │ │
│  │  └──────┬──────┘                                               │ │
│  │         │                                                       │ │
│  └─────────┴───────────────────────────────────────────────────────┘ │
│                            │                                          │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │ Schedule Simulation     │
               │ • Type                  │
               │ • Date/Time             │
               │ • Duration              │
               │ • Participants          │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │ Run Simulation          │
               │ Status: In Progress     │
               └───────────┬─────────────┘
                           │
                           ▼
               ┌─────────────────────────┐
               │ Complete & Score        │
               │ • Score: 0-100%         │
               │ • Notes                 │
               │ • Improvement Areas     │
               └─────────────────────────┘


PHASE 4: PLAYBOOKS (Reference during inspection)
════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                        PLAYBOOKS                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ FRONT ROOM PLAYBOOK                                             ││
│  │ • Greeting inspector protocol                                   ││
│  │ • Conference room setup                                         ││
│  │ • SME introduction procedures                                   ││
│  │ • Question handling guidelines                                  ││
│  │ • DO: Provide accurate, concise answers                        ││
│  │ • DON'T: Volunteer extra information                           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ BACK ROOM PLAYBOOK                                              ││
│  │ • Document retrieval SOP                                        ││
│  │ • Printer/scanner setup                                         ││
│  │ • Document tracking log                                         ││
│  │ • Communication with front room                                 ││
│  │ • DO: Log all documents requested                              ││
│  │ • DON'T: Send unreviewed documents                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ SME PLAYBOOK                                                    ││
│  │ • Preparation checklist                                         ││
│  │ • Common question areas                                         ││
│  │ • Escalation procedures                                         ││
│  │ • DO: Answer only what is asked                                ││
│  │ • DON'T: Speculate or guess                                    ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ DIL HANDLING PLAYBOOK                                           ││
│  │ • Document/Information List management                          ││
│  │ • Request logging                                               ││
│  │ • Response time tracking                                        ││
│  │ • DO: Track every request with timestamp                       ││
│  │ • DON'T: Delay responses without notification                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘


PHASE 5: ACTUAL INSPECTION
══════════════════════════

┌─────────────────────────────────────────────────────────────────────┐
│                    INSPECTION DAY FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                                                │
│  │ Day Start       │                                                │
│  │ • Opening meeting│                                               │
│  │ • Inspector intro│                                               │
│  │ • Agenda review  │                                               │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ During          │                                                │
│  │ • Front room Q&A│                                                │
│  │ • Back room docs│                                                │
│  │ • DIL tracking  │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Midday          │                                                │
│  │ • Progress check│                                                │
│  │ • Team huddle   │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Day End         │                                                │
│  │ • Daily debrief │                                                │
│  │ • Action items  │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │ Evening         │                                                │
│  │ • Team review   │                                                │
│  │ • Next day prep │                                                │
│  └─────────────────┘                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘


PHASE 6: POST-INSPECTION
════════════════════════

┌─────────────────┐
│ Complete        │
│ Inspection      │
│ (Outcome)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ FDA 483 Issued? │────▶│ Link to FDA 483 │
│                 │ Yes │ Event           │
└────────┬────────┘     └─────────────────┘
         │ No
         ▼
┌─────────────────┐
│ Update Readiness│
│ Score           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Archive         │
│ Inspection      │
│ Records         │
└─────────────────┘
```

### Readiness Score Calculation

```
Score = (Completed Actions / Total Actions) × 100

Weighting:
• Completed on time: 1.0 points
• Completed overdue: 0.5 points
• Not completed: 0 points

Example:
• 18 actions completed on time (18 × 1.0 = 18)
• 2 actions completed late (2 × 0.5 = 1)
• Total cards: 20

Score = (18 + 1) / 20 × 100 = 95%
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           USER ACTIONS                                        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND MODULES (React)                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Dashboard│ │Gap Asmt │ │Deviation│ │  CAPA   │ │ CSV/CSA │ │ FDA 483 │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │          │          │          │          │          │             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                          │
│  │Evidence │ │Training │ │Governanc│ │Audit Trl│                          │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                          │
└───────┼──────────┼──────────┼──────────┼────────────────────────────────────┘
        │          │          │          │
        └──────────┴──────────┴──────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      REDUX STORE (State Management)                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  findings   │ │    capa     │ │  deviation  │ │   systems   │           │
│  │    slice    │ │    slice    │ │    slice    │ │    slice    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   fda483    │ │  evidence   │ │  readiness  │ │    raid     │           │
│  │    slice    │ │    slice    │ │    slice    │ │    slice    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │ auditTrail  │ │    auth     │ │  settings   │                           │
│  │    slice    │ │    slice    │ │    slice    │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
└──────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      API ROUTES (Next.js /api)                                │
│  /api/findings  /api/capas  /api/deviations  /api/systems  /api/fda483      │
│  /api/documents  /api/raid  /api/users  /api/sites  /api/auth               │
└──────────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      DATABASE (Prisma + SQLite)                               │
│  Finding | CAPA | Deviation | GxPSystem | FDA483Event | Document | RAIDItem │
│  User | Site | Tenant | Subscription | AuditLog                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Role-Based Access Matrix

| Module | super_admin | customer_admin | qa_head | qc_lab_director | regulatory_affairs | csv_val_lead | it_cdo | operations_head | viewer |
|--------|-------------|----------------|---------|-----------------|-------------------|--------------|--------|-----------------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gap Assessment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Deviation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| CAPA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| CSV/CSA | ✅ | ✅ | ✅ | — | — | ✅ | — | — | — |
| FDA 483 | ✅ | ✅ | ✅ | — | ✅ | — | — | — | — |
| Evidence | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Training & Awareness | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| Governance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Audit Trail | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| Settings | ✅ | ✅ | ✅ | — | — | — | ✅ | — | — |

---

## Compliance Requirements by Module

| Module | Key Compliance Requirements |
|--------|----------------------------|
| **Gap Assessment** | Evidence linking, framework compliance tracking |
| **Deviation** | 3-level impact assessment, immediate action documentation |
| **CAPA** | GxP signatory e-signature, DI gate approval, immutable closure |
| **CSV/CSA** | Validation stage workflow, Part 11/Annex 11 compliance |
| **FDA 483** | Response deadline enforcement, observation-CAPA linkage |
| **Evidence** | Version control, compliance tagging, retention tracking |
| **Training & Awareness** | Training record immutability, simulation documentation |
| **Governance** | KPI accuracy, RAID traceability |
| **Audit Trail** | Server-side timestamps, immutable entries (21 CFR Part 11) |

---

*Document generated for Pharma Glimmora Platform*
*Version: 2.0*
