export const SEO = {
  siteName: "Pharma Glimmora",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://app.glimmora.com",
  defaultTitle: "Pharma Glimmora \u2014 GxP Compliance Platform",
  defaultDescription:
    "AI-enabled GxP/GMP inspection readiness and compliance management platform for pharmaceutical, biotech, and medical device companies.",
  defaultKeywords: [
    "GxP compliance",
    "GMP inspection readiness",
    "pharmaceutical compliance",
    "CAPA management",
    "FDA 483",
    "CSV validation",
    "audit trail",
    "pharma quality management",
  ].join(", "),
  twitterHandle: "@glimmora",
  logoUrl: "/logo.png",
};

export const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/gap-assessment": "Gap Assessment & Findings",
  "/deviation": "Deviation Management",
  "/capa": "QMS & CAPA Tracker",
  "/csv-csa": "CSV/CSA Validation",
  "/fda-483": "FDA 483 & Regulatory Events",
  "/evidence": "Evidence & Documents",
  "/governance": "Governance & KPIs",
  "/readiness": "Inspection Readiness",
  "/audit-trail": "Audit Trail",
  "/agi-console": "AGI Console",
  "/ai-policy": "AI Usage Policy",
  "/settings": "Settings",
  "/login": "Sign In",
  "/site-picker": "Select Site",
  "/admin": "Administration",
};
