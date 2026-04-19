import type { ReadinessCard, Playbook, Simulation, TrainingRecord, Inspection } from "@/store/readiness.slice";

export const MOCK_READINESS_CARDS: ReadinessCard[] = [
  // People lane
  { id: "rc-001", tenantId: "tenant-glimmora", lane: "People", bucket: "Immediate", action: "Brief QA Head and key SMEs on inspection protocol", owner: "u-002", status: "Not Started", agiRisk: "High", dueDate: "2026-05-01T00:00:00Z", linkedSimulationType: "Mock Inspection" },
  { id: "rc-002", tenantId: "tenant-glimmora", lane: "People", bucket: "Immediate", action: "Assign front-room and back-room roles", owner: "u-002", status: "Not Started", agiRisk: "High", dueDate: "2026-05-05T00:00:00Z", linkedSimulationType: null },
  { id: "rc-003", tenantId: "tenant-glimmora", lane: "People", bucket: "31-60 days", action: "Run mock inspection simulation \u2014 Chennai site", owner: "u-002", status: "Not Started", agiRisk: "Medium", dueDate: "2026-05-20T00:00:00Z", linkedSimulationType: "Mock Inspection" },
  { id: "rc-004", tenantId: "tenant-glimmora", lane: "People", bucket: "61-90 days", action: "Leadership briefing \u2014 risk posture and communications", owner: "u-007", status: "Not Started", agiRisk: "Low", dueDate: "2026-06-25T00:00:00Z", linkedSimulationType: "Leadership Briefing" },
  // Process lane
  { id: "rc-005", tenantId: "tenant-glimmora", lane: "Process", bucket: "Immediate", action: "Review and update CAPA SOP \u2014 close FIND-001 gaps", owner: "u-002", status: "Not Started", agiRisk: "High", dueDate: "2026-05-08T00:00:00Z" },
  { id: "rc-006", tenantId: "tenant-glimmora", lane: "Process", bucket: "31-60 days", action: "Complete ICH Q9 risk assessment updates", owner: "u-003", status: "Not Started", agiRisk: "Medium", dueDate: "2026-05-28T00:00:00Z" },
  { id: "rc-007", tenantId: "tenant-glimmora", lane: "Process", bucket: "61-90 days", action: "Effectiveness check \u2014 closed CAPAs from Q1", owner: "u-004", status: "Not Started", agiRisk: "Medium", dueDate: "2026-06-30T00:00:00Z" },
  // Data lane
  { id: "rc-008", tenantId: "tenant-glimmora", lane: "Data", bucket: "Immediate", action: "Remediate LIMS audit trail \u2014 all 12 modules", owner: "u-005", status: "Not Started", agiRisk: "High", dueDate: "2026-05-12T00:00:00Z" },
  { id: "rc-008b", tenantId: "tenant-glimmora", lane: "Data", bucket: "31-60 days", action: "Validate audit trail logs across all GxP systems", owner: "u-005", status: "Not Started", agiRisk: "High", dueDate: "2026-06-05T00:00:00Z" },
  { id: "rc-008c", tenantId: "tenant-glimmora", lane: "Data", bucket: "61-90 days", action: "Complete DI remediation sign-off report", owner: "u-004", status: "Not Started", agiRisk: "Medium", dueDate: "2026-07-05T00:00:00Z" },
  // Systems lane
  { id: "rc-009", tenantId: "tenant-glimmora", lane: "Systems", bucket: "Immediate", action: "Complete LIMS Part 11 gap remediation", owner: "u-004", status: "Not Started", agiRisk: "High", dueDate: "2026-05-15T00:00:00Z" },
  { id: "rc-010", tenantId: "tenant-glimmora", lane: "Systems", bucket: "31-60 days", action: "CDS e-signature validation OQ completion", owner: "u-005", status: "Not Started", agiRisk: "High", dueDate: "2026-06-10T00:00:00Z" },
  { id: "rc-011", tenantId: "tenant-glimmora", lane: "Systems", bucket: "61-90 days", action: "MES validation project kickoff", owner: "u-004", status: "Not Started", agiRisk: "High", dueDate: "2026-07-10T00:00:00Z" },
  // Documentation lane
  { id: "rc-012", tenantId: "tenant-glimmora", lane: "Documentation", bucket: "Immediate", action: "Compile DIL evidence kit \u2014 Chennai QC Lab", owner: "u-003", status: "Not Started", agiRisk: "High", dueDate: "2026-05-10T00:00:00Z" },
  { id: "rc-013", tenantId: "tenant-glimmora", lane: "Documentation", bucket: "31-60 days", action: "Update all SOPs post inspection findings", owner: "u-002", status: "Not Started", agiRisk: "Medium", dueDate: "2026-06-12T00:00:00Z" },
  { id: "rc-014", tenantId: "tenant-glimmora", lane: "Documentation", bucket: "61-90 days", action: "Archive all inspection evidence documents", owner: "u-003", status: "Not Started", agiRisk: "Low", dueDate: "2026-07-15T00:00:00Z" },
];

export const MOCK_PLAYBOOKS: Playbook[] = [
  { id: "pb-001", tenantId: "tenant-glimmora", type: "Front Room", title: "Front Room Inspection Protocol", description: "Roles, behaviors, document handling and response rules for the primary inspector-facing team.", templates: ["Opening meeting deck", "Commitment matrix template", "Request log"], steps: [{ id: "s-001", order: 1, action: "Receive inspector on arrival", do: ["Greet professionally and escort to designated room", "Provide site org chart and key contact list", "Confirm scope and agenda with lead inspector"], dont: ["Do not volunteer information beyond what is asked", "Do not allow inspector to wander unescorted"] }, { id: "s-002", order: 2, action: "Manage document requests (DIL)", do: ["Log every request in the DIL tracker immediately", "Assign an owner and realistic retrieval time", "Communicate status every 30 minutes"], dont: ["Do not provide documents without back-room review", "Do not guess \u2014 confirm before committing to a deadline"] }, { id: "s-003", order: 3, action: "Handle inspector questions", do: ["Answer concisely and factually", "Say I will confirm and get back to you if unsure", "Route technical questions to the correct SME"], dont: ["Do not speculate or provide opinions", "Do not argue with the inspector", "Do not discuss unrelated issues"] }, { id: "s-004", order: 4, action: "Daily debrief with back room", do: ["Summarise all observations raised that day", "Agree overnight response actions with back-room lead", "Prepare for next day document requests"], dont: ["Do not share debrief notes outside the core team"] }, { id: "s-005", order: 5, action: "Closing meeting", do: ["Listen carefully to all observations", "Take verbatim notes on every 483 observation", "Commit only to what you can deliver in 15 business days"], dont: ["Do not commit to timelines without back-room approval", "Do not dispute observations in the room"] }] },
  { id: "pb-002", tenantId: "tenant-glimmora", type: "Back Room", title: "Back Room Operations Protocol", description: "Evidence retrieval, document review, and response coordination for the support team.", templates: ["Evidence register", "Response coordination log", "Overnight action list"], steps: [{ id: "s-006", order: 1, action: "Establish back-room command centre", do: ["Set up in a separate room with secure access", "Assign roles: evidence lead, comms lead, legal liaison", "Keep a live log of all inspector requests"], dont: ["Do not allow unassigned staff in the back room"] }, { id: "s-007", order: 2, action: "Review all documents before front-room delivery", do: ["Check every document for accuracy and completeness", "Flag any gaps or inconsistencies before submission", "Log reviewed documents in evidence register"], dont: ["Do not send unreviewed documents to front room", "Do not alter records \u2014 only identify and explain gaps"] }, { id: "s-008", order: 3, action: "Coordinate overnight responses", do: ["Prioritise by inspector risk signal", "Assign overnight actions with clear owners and deadlines", "Brief front room at morning handoff"], dont: ["Do not create new records to fill gaps"] }] },
  { id: "pb-003", tenantId: "tenant-glimmora", type: "SME", title: "SME Interview Protocol", description: "Preparation and conduct guidelines for subject matter experts who may be interviewed by inspectors.", templates: ["SME Q&A practice sheet", "Common question bank"], steps: [{ id: "s-009", order: 1, action: "SME pre-inspection preparation", do: ["Know your SOPs and be able to locate them quickly", "Practice answering: Walk me through your process for X", "Know your last training date and record location"], dont: ["Do not memorise scripts \u2014 stay conversational", "Do not prepare for questions outside your role"] }, { id: "s-010", order: 2, action: "During inspector interview", do: ["Answer only what is asked \u2014 short and factual", "Say I would need to check the record if unsure", "Refer complex questions to the QA representative"], dont: ["Do not speculate about other departments", "Do not answer questions about events you did not witness"] }] },
  { id: "pb-004", tenantId: "tenant-glimmora", type: "DIL Handling", title: "Document Information List (DIL) Protocol", description: "Systematic handling of inspector document requests \u2014 retrieval, review, and tracking.", templates: ["DIL request log", "Evidence retrieval SOP", "Document index"], steps: [{ id: "s-011", order: 1, action: "Receive DIL from inspector", do: ["Log all requested items immediately in DIL tracker", "Assign priority: immediate / same day / next day", "Confirm receipt with inspector"], dont: ["Do not acknowledge you have a document you are not sure about"] }, { id: "s-012", order: 2, action: "Locate and retrieve documents", do: ["Use the evidence library index first", "Confirm version and effective date before retrieval", "Back-room review before handing to front room"], dont: ["Do not retrieve superseded versions", "Do not provide draft documents as final"] }, { id: "s-013", order: 3, action: "Track and close DIL items", do: ["Mark each item complete when delivered", "Note any gaps with documented explanation", "Report open items at daily debrief"], dont: ["Do not leave items open without an owner"] }] },
];

export const MOCK_SIMULATIONS: Simulation[] = [];

export const MOCK_TRAINING_RECORDS: TrainingRecord[] = [];

export const MOCK_INSPECTIONS: Inspection[] = [
  {
    id: "INSP-2026-001", tenantId: "tenant-glimmora",
    title: "FDA GMP Inspection Q2 2026", siteId: "site-chennai", siteName: "Chennai QC Laboratory",
    agency: "FDA", type: "announced", status: "preparation",
    expectedDate: "2026-06-01T00:00:00Z",
    readinessScore: 0, totalActions: 16, completedActions: 0,
    inspectionLead: "u-002",
    frontRoom: ["Dr. Priya Sharma", "Rahul Mehta", "Dr. Nisha Rao", "Vikram Singh"],
    backRoom: ["Anita Patel", "Suresh Kumar", "Dr. Nisha Rao", "Rahul Mehta"],
    createdBy: "u-002", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z",
    notes: "FDA announced inspection following Q1 483 observations",
  },
  {
    id: "INSP-2026-002", tenantId: "tenant-glimmora",
    title: "EMA Annex 11 Review", siteId: "site-mumbai", siteName: "Mumbai API Plant",
    agency: "EMA", type: "announced", status: "preparation",
    expectedDate: "2026-07-15T00:00:00Z",
    readinessScore: 67, totalActions: 15, completedActions: 10,
    inspectionLead: "u-003",
    frontRoom: ["Rahul Mehta", "Dr. Priya Sharma"],
    backRoom: ["Anita Patel", "Dr. Nisha Rao"],
    createdBy: "u-002", createdAt: "2026-03-15T00:00:00Z", updatedAt: "2026-03-15T00:00:00Z",
  },
  {
    id: "INSP-2026-003", tenantId: "tenant-glimmora",
    title: "MHRA GMP Routine Inspection", siteId: "site-hyderabad", siteName: "Hyderabad Formulation",
    agency: "MHRA", type: "announced", status: "preparation",
    expectedDate: "2026-08-30T00:00:00Z",
    readinessScore: 82, totalActions: 16, completedActions: 13,
    inspectionLead: "u-002",
    frontRoom: ["Dr. Priya Sharma", "Vikram Singh"],
    backRoom: ["Anita Patel", "Suresh Kumar"],
    createdBy: "u-002", createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "INSP-2026-000", tenantId: "tenant-glimmora",
    title: "FDA GMP Inspection Q1 2026", siteId: "site-chennai", siteName: "Chennai QC Laboratory",
    agency: "FDA", type: "announced", status: "completed",
    expectedDate: "2026-03-10T00:00:00Z", startDate: "2026-03-10T00:00:00Z", endDate: "2026-03-12T00:00:00Z",
    readinessScore: 100, totalActions: 14, completedActions: 14,
    linkedFDA483Id: "FEI-3004795103-2026",
    inspectionLead: "u-002",
    createdBy: "u-002", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-12T00:00:00Z",
    notes: "Resulted in FDA 483 with 3 observations",
    completionOutcome: "FDA 483 issued",
  },
];
