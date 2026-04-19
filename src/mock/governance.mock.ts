export interface SiteKPI {
  siteId: string;
  siteName: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  readinessScore: number;
  openFindings: number;
  criticalFindings: number;
  openCAPAs: number;
  overdueCAPAs: number;
  activeFDA483: number;
  systemsValidated: number;
  systemsTotal: number;
  diExceptions: number;
  openDeviations: number;
  inspectionReadiness: number;
  nextInspection?: string;
  nextInspectionDate?: string;
  capaTimeliness: number;
  auditTrailCoverage: number;
}

export const MOCK_SITE_KPIS: SiteKPI[] = [
  {
    siteId: "site-chennai", siteName: "Chennai QC Laboratory", riskLevel: "HIGH",
    readinessScore: 40, openFindings: 2, criticalFindings: 1,
    openCAPAs: 2, overdueCAPAs: 1, activeFDA483: 1,
    systemsValidated: 0, systemsTotal: 2, diExceptions: 1,
    openDeviations: 1, inspectionReadiness: 14,
    nextInspection: "FDA GMP Q2 2026", nextInspectionDate: "2026-06-01T00:00:00Z",
    capaTimeliness: 45, auditTrailCoverage: 60,
  },
  {
    siteId: "site-mumbai", siteName: "Mumbai API Plant", riskLevel: "MEDIUM",
    readinessScore: 75, openFindings: 0, criticalFindings: 0,
    openCAPAs: 0, overdueCAPAs: 0, activeFDA483: 1,
    systemsValidated: 2, systemsTotal: 2, diExceptions: 0,
    openDeviations: 1, inspectionReadiness: 67,
    nextInspection: "EMA Annex 11", nextInspectionDate: "2026-07-15T00:00:00Z",
    capaTimeliness: 78, auditTrailCoverage: 95,
  },
  {
    siteId: "site-bangalore", siteName: "Bangalore R&D Centre", riskLevel: "MEDIUM",
    readinessScore: 65, openFindings: 1, criticalFindings: 0,
    openCAPAs: 1, overdueCAPAs: 1, activeFDA483: 0,
    systemsValidated: 0, systemsTotal: 1, diExceptions: 0,
    openDeviations: 1, inspectionReadiness: 45,
    capaTimeliness: 72, auditTrailCoverage: 80,
  },
  {
    siteId: "site-hyderabad", siteName: "Hyderabad Formulation", riskLevel: "HIGH",
    readinessScore: 82, openFindings: 0, criticalFindings: 0,
    openCAPAs: 0, overdueCAPAs: 0, activeFDA483: 1,
    systemsValidated: 1, systemsTotal: 1, diExceptions: 0,
    openDeviations: 0, inspectionReadiness: 82,
    nextInspection: "MHRA GMP", nextInspectionDate: "2026-08-30T00:00:00Z",
    capaTimeliness: 80, auditTrailCoverage: 100,
  },
];

export const MOCK_SITE_TREND = [
  { month: "Jan", chennai: 60, mumbai: 65, bangalore: 60, hyderabad: 75 },
  { month: "Feb", chennai: 55, mumbai: 68, bangalore: 62, hyderabad: 78 },
  { month: "Mar", chennai: 45, mumbai: 72, bangalore: 63, hyderabad: 80 },
  { month: "Apr", chennai: 40, mumbai: 75, bangalore: 65, hyderabad: 82 },
];
