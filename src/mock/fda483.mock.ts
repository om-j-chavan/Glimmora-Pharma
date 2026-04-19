import type { FDA483Event } from "@/store/fda483.slice";

export const MOCK_FDA483_EVENTS: FDA483Event[] = [
  {
    id: "event-001", tenantId: "tenant-glimmora", type: "FDA 483", referenceNumber: "FEI-3004795103-2026", agency: "FDA", siteId: "site-gl-3", inspectionDate: "2026-03-10T00:00:00Z", responseDeadline: "2026-04-05T00:00:00Z", status: "Under Investigation", responseDraft: "", agiDraft: "", createdAt: "2026-03-10T14:00:00Z",
    documents: [{ id: "FDA-DOC-001", fileName: "FDA_483_Original_Letter.pdf", fileType: "pdf", fileSize: "1.2 MB", uploadedBy: "Dr. Priya Sharma", uploadedByRole: "QA Head", uploadedAt: "2026-03-11T05:30:00Z", version: "v1.0", status: "current", description: "Original FDA 483 letter received", linkedTo: { module: "FDA 483", recordId: "event-001", recordTitle: "FEI-3004795103-2026" } }],
    responseDocuments: [{ id: "FDA-DOC-002", fileName: "FDA_483_Response_Package.pdf", fileType: "pdf", fileSize: "4.1 MB", uploadedBy: "Dr. Priya Sharma", uploadedByRole: "QA Head", uploadedAt: "2026-04-14T10:00:00Z", version: "v1.0", status: "approved", approvedBy: "Dr. Priya Sharma", approvedAt: "2026-04-14T14:00:00Z", description: "Complete response package with all supporting evidence", linkedTo: { module: "FDA 483 Response", recordId: "event-001_response", recordTitle: "Response Package" } }],
    linkedCapas: [{ capaId: "CAPA-0042", linkedObservation: 1 }, { capaId: "CAPA-0043", linkedObservation: 2 }, { capaId: "CAPA-0044", linkedObservation: 3 }],
    observations: [
      { id: "obs-001-1", number: 1, text: "Failure to maintain complete data integrity controls in the LIMS system. Audit trail gaps identified in 3 of 12 modules reviewed during inspection.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 211.68(b)", status: "CAPA Linked", rcaMethod: "5 Why", rootCause: "System upgrade Nov 2025 reset audit trail configuration.", capaId: "CAPA-0042", capaIds: ["CAPA-0042"], documents: [{ id: "obs1-doc-1", fileName: "OBS1_Evidence_AuditTrail.pdf", fileType: "pdf", fileSize: "0.9 MB", uploadedBy: "Dr. Nisha Rao", uploadedByRole: "QC/Lab Director", uploadedAt: "2026-03-15T05:00:00Z", version: "v1.0", status: "current", linkedTo: { module: "FDA 483 Observation", recordId: "obs-001-1", recordTitle: "Observation #1" } }] },
      { id: "obs-001-2", number: 2, text: "Electronic signatures in CDS not cryptographically linked to records as required under 21 CFR Part 11.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 11.50", status: "In Progress", capaId: "CAPA-0043", capaIds: ["CAPA-0043"], documents: [] },
      { id: "obs-001-3", number: 3, text: "HPLC qualification records (IQ/OQ) overdue by 9 months. Equipment used in GMP testing without current qualification.", severity: "High", area: "Manufacturing", regulation: "21 CFR 211.68(a)", status: "Response Ready", rcaMethod: "Fishbone", rootCause: "CMMS did not flag overdue qualification. Scheduling gap.", capaId: "CAPA-0044", capaIds: ["CAPA-0044"], documents: [{ id: "obs3-doc-1", fileName: "HPLC_Qualification_Plan.pdf", fileType: "pdf", fileSize: "1.5 MB", uploadedBy: "Anita Patel", uploadedByRole: "CSV/Val Lead", uploadedAt: "2026-03-20T08:00:00Z", version: "v1.0", status: "current", linkedTo: { module: "FDA 483 Observation", recordId: "obs-001-3", recordTitle: "Observation #3" } }] },
    ],
    commitments: [
      { id: "commit-001-1", eventId: "event-001", text: "Audit trail remediation across all 12 LIMS modules \u2014 configuration locked via change control", dueDate: "2026-03-31T00:00:00Z", owner: "u-005", status: "In Progress" },
      { id: "commit-001-2", eventId: "event-001", text: "E-signature binding validation and protocol completion", dueDate: "2026-04-15T00:00:00Z", owner: "u-005", status: "Pending" },
      { id: "commit-001-3", eventId: "event-001", text: "HPLC IQ/OQ completion and CMMS update with automated reminders", dueDate: "2026-03-31T00:00:00Z", owner: "u-002", status: "Complete" },
    ],
  },
  {
    id: "event-002", tenantId: "tenant-glimmora", type: "Warning Letter", referenceNumber: "WL-2026-MUM-047", agency: "FDA", siteId: "site-gl-1", inspectionDate: "2026-02-18T00:00:00Z", responseDeadline: "2026-03-20T00:00:00Z", status: "Response Submitted", responseDraft: "Response submitted acknowledging deficiencies and committing to remediation plan outlined in attached document.", agiDraft: "", createdAt: "2026-02-20T09:30:00Z",
    observations: [
      { id: "obs-002-1", number: 1, text: "Inadequate investigation of repeat batch deviations in API Line 3. Root cause analysis superficial and recurrence prevention not effective.", severity: "Critical", area: "Manufacturing", regulation: "21 CFR 211.192", status: "Closed", rcaMethod: "Fishbone", rootCause: "Insufficient RCA training for shift supervisors.", capaId: "CAPA-0038" },
      { id: "obs-002-2", number: 2, text: "Cleaning validation protocol not updated to reflect current API product rotation.", severity: "High", area: "Manufacturing", regulation: "21 CFR 211.67", status: "Response Drafted", capaId: "CAPA-0038" },
    ],
    commitments: [
      { id: "commit-002-1", eventId: "event-002", text: "Retrain all shift supervisors on structured RCA methods", dueDate: "2026-03-15T00:00:00Z", owner: "u-002", status: "Complete" },
      { id: "commit-002-2", eventId: "event-002", text: "Revise cleaning validation master plan and requalify API Line 3", dueDate: "2026-04-30T00:00:00Z", owner: "u-002", status: "In Progress" },
    ],
  },
  {
    id: "event-003", tenantId: "tenant-glimmora", type: "EMA Inspection", referenceNumber: "EMA-GMP-2026-118", agency: "EMA", siteId: "site-gl-2", inspectionDate: "2026-01-22T00:00:00Z", responseDeadline: "2026-02-22T00:00:00Z", status: "Closed", responseDraft: "", agiDraft: "", createdAt: "2026-01-23T10:00:00Z",
    observations: [
      { id: "obs-003-1", number: 1, text: "Temperature mapping records for stability chamber SC-04 incomplete for Q4 2025.", severity: "High", area: "QC Lab", regulation: "EU GMP Annex 15", status: "Closed", rcaMethod: "5 Why", rootCause: "Logger battery failure during power outage.", capaId: "CAPA-0045" },
      { id: "obs-003-2", number: 2, text: "Supplier qualification file for excipient vendor ABC Labs missing current audit report.", severity: "Low", area: "Warehouse", regulation: "EU GMP Ch.7", status: "Closed" },
    ],
    commitments: [
      { id: "commit-003-1", eventId: "event-003", text: "Replace data logger batteries on all stability chambers and add UPS", dueDate: "2026-02-28T00:00:00Z", owner: "u-005", status: "Complete" },
    ],
  },
  {
    id: "event-004", tenantId: "tenant-glimmora", type: "MHRA Inspection", referenceNumber: "MHRA-GMP-2026-073", agency: "MHRA", siteId: "site-gl-4", inspectionDate: "2026-03-25T00:00:00Z", responseDeadline: "2026-04-25T00:00:00Z", status: "Response Due", responseDraft: "", agiDraft: "", createdAt: "2026-03-26T14:30:00Z",
    observations: [
      { id: "obs-004-1", number: 1, text: "Change control CCR-2026-018 implemented without evaluating impact on validated cleaning procedure.", severity: "High", area: "Manufacturing", regulation: "MHRA GMP Ch.1", status: "Open", capaId: "CAPA-0046" },
      { id: "obs-004-2", number: 2, text: "Training records for 4 operators do not cover the current revision of SOP-MAN-101.", severity: "Low", area: "Manufacturing", regulation: "MHRA GMP Ch.2", status: "RCA In Progress", rcaMethod: "5 Why" },
    ],
    commitments: [
      { id: "commit-004-1", eventId: "event-004", text: "Update change control procedure to mandate cleaning impact assessment", dueDate: "2026-05-15T00:00:00Z", owner: "u-002", status: "In Progress" },
      { id: "commit-004-2", eventId: "event-004", text: "Retrain all formulation operators on revised SOP-MAN-101", dueDate: "2026-04-30T00:00:00Z", owner: "u-007", status: "Pending" },
    ],
  },
];
