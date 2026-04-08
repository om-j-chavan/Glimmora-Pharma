import type { FDA483Event } from "@/store/fda483.slice";

export const MOCK_FDA483_EVENTS: FDA483Event[] = [
  {
    id: "event-001", tenantId: "tenant-glimmora", type: "FDA 483", referenceNumber: "FEI-3004795103-2026", agency: "FDA", siteId: "site-gl-3", inspectionDate: "2026-03-10T00:00:00Z", responseDeadline: "2026-04-05T00:00:00Z", status: "Response Due", responseDraft: "", agiDraft: "", createdAt: "2026-03-10T14:00:00Z",
    observations: [
      { id: "obs-001-1", number: 1, text: "Failure to maintain complete data integrity controls in the LIMS system. Audit trail gaps identified in 3 of 12 modules reviewed during inspection.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 211.68(b)", status: "RCA In Progress", rcaMethod: "5 Why", rootCause: "System upgrade Nov 2025 reset audit trail configuration.", capaId: "CAPA-0042" },
      { id: "obs-001-2", number: 2, text: "Electronic signatures in CDS not cryptographically linked to records as required under 21 CFR Part 11.", severity: "Critical", area: "QC Lab", regulation: "21 CFR 11.50", status: "Open", capaId: "CAPA-0043" },
      { id: "obs-001-3", number: 3, text: "HPLC qualification records (IQ/OQ) overdue by 9 months. Equipment used in GMP testing without current qualification.", severity: "Major", area: "Manufacturing", regulation: "21 CFR 211.68(a)", status: "Response Drafted", rcaMethod: "Fishbone", rootCause: "CMMS did not flag overdue qualification. Scheduling gap.", capaId: "CAPA-0044" },
    ],
    commitments: [
      { id: "commit-001-1", eventId: "event-001", text: "Audit trail remediation across all 12 LIMS modules \u2014 configuration locked via change control", dueDate: "2026-03-31T00:00:00Z", owner: "u-005", status: "In Progress" },
      { id: "commit-001-2", eventId: "event-001", text: "E-signature binding validation and protocol completion", dueDate: "2026-04-15T00:00:00Z", owner: "u-005", status: "Pending" },
      { id: "commit-001-3", eventId: "event-001", text: "HPLC IQ/OQ completion and CMMS update with automated reminders", dueDate: "2026-03-31T00:00:00Z", owner: "u-002", status: "Complete" },
    ],
  },
];
