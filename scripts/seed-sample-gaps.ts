/**
 * Demo seed — sample compliance gaps so the dashboard Gap Detection panel (and
 * AGI Insights) render across all three severities (HIGH / MED / LOW).
 *
 * THROWAWAY sample data. Every row's description / requirement / name is
 * prefixed "[SAMPLE]" so it is obvious in the UI and removable via
 * scripts/remove-sample-gaps.ts. Rows go through the SAME models + fields real
 * records use (real references via the existing generators, real User-id
 * owners, valid siteId) — so they surface through the REAL gap checks
 * (isOverdue, riskLevel/validationStatus, diGate, nextReview,
 * pending_qa_review). No gate bypass, no panel/logic change.
 *
 * Run:    npx tsx scripts/seed-sample-gaps.ts
 * Remove: npx tsx scripts/remove-sample-gaps.ts
 *
 * Idempotent-ish: if any [SAMPLE] CAPA already exists for the demo tenant the
 * script skips (run the remove script first to reseed).
 */
import { PrismaClient } from "@prisma/client";
import { buildReferencePrefix, generateReference } from "@/lib/reference";

const prisma = new PrismaClient();
const SAMPLE = "[SAMPLE]";
const DEMO_EMAIL = "admin@pharmaglimmora.com";

async function main() {
  const demo = await prisma.tenant.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!demo) throw new Error(`Demo tenant ${DEMO_EMAIL} not found — run npm run db:seed first.`);
  const tenantId = demo.id;

  const site = await prisma.site.findFirst({ where: { tenantId, code: "CHN" }, select: { id: true, code: true } });
  const siteId = site?.id ?? null;
  const siteCode = site?.code ?? "CHN";

  // Real User-id owners (same lookup the main seed uses). Fall back to a plain
  // display name if the users aren't seeded — never a Tenant id in a User FK.
  const priya = await prisma.user.findFirst({ where: { tenantId, username: "priya.sharma" }, select: { id: true } });
  const anita = await prisma.user.findFirst({ where: { tenantId, username: "anita.patel" }, select: { id: true } });
  const ownerQA = priya?.id ?? "Dr. Priya Sharma";
  const ownerCSV = anita?.id ?? "Anita Patel";

  const existing = await prisma.cAPA.count({ where: { tenantId, description: { startsWith: SAMPLE } } });
  if (existing > 0) {
    console.log(`Sample gaps already present (${existing} "[SAMPLE]" CAPAs). Skipping.`);
    console.log(`Run "npx tsx scripts/remove-sample-gaps.ts" first if you want to reseed.`);
    await prisma.$disconnect();
    return;
  }

  const now = Date.now();
  const past30 = new Date(now - 30 * 864e5);
  const past15 = new Date(now - 15 * 864e5);
  const future30 = new Date(now + 30 * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  // Reference generators (same helpers the real createCAPA / createFinding use).
  const capaRef = () => generateReference(buildReferencePrefix("CAPA", siteCode), new Date(), async (p, y) =>
    (await prisma.cAPA.findFirst({ where: { reference: { startsWith: `${p}-${y}-` } }, orderBy: { reference: "desc" }, select: { reference: true } }))?.reference ?? null);
  const findRef = () => generateReference(buildReferencePrefix("FND", siteCode), new Date(), async (p, y) =>
    (await prisma.finding.findFirst({ where: { reference: { startsWith: `${p}-${y}-` } }, orderBy: { reference: "desc" }, select: { reference: true } }))?.reference ?? null);
  // GxPSystem uses SYS-<SITE>-<NNNN> (4-digit, no year) — mirror nextSystemReference.
  const sysRef = async () => {
    const latest = await prisma.gxPSystem.findFirst({ where: { tenantId, reference: { startsWith: `SYS-${siteCode}-` } }, orderBy: { reference: "desc" }, select: { reference: true } });
    let n = 1;
    const m = latest?.reference?.match(/-(\d+)$/);
    if (m) n = Number.parseInt(m[1], 10) + 1;
    return `SYS-${siteCode}-${String(n).padStart(4, "0")}`;
  };

  const rows: { ref: string | null; type: string; severity: string; trigger: string; date: string }[] = [];

  // ── HIGH ──
  const c1 = await prisma.cAPA.create({ data: { tenantId, siteId, reference: await capaRef(), source: "Gap Assessment", description: `${SAMPLE} Overdue CAPA — remediate cleanroom HVAC excursion`, risk: "High", owner: ownerQA, createdBy: "Sample Seed", status: "open", dueDate: past30 } });
  rows.push({ ref: c1.reference, type: "CAPA", severity: "HIGH", trigger: "overdue (status open + dueDate -30d)", date: iso(past30) });

  const s1 = await prisma.gxPSystem.create({ data: { tenantId, siteId, reference: await sysRef(), name: `${SAMPLE} LIMS upgrade`, type: "LIMS", riskLevel: "HIGH", validationStatus: "In Progress", owner: ownerCSV, createdBy: "Sample Seed" } });
  rows.push({ ref: s1.reference, type: "System", severity: "HIGH", trigger: "riskLevel HIGH + validationStatus != Validated", date: "—" });

  const f1 = await prisma.finding.create({ data: { tenantId, siteId, reference: await findRef(), requirement: `${SAMPLE} Critical: missing data-integrity controls on QC balance`, area: "QC Lab", severity: "Critical", status: "Open", owner: ownerQA, createdBy: "Sample Seed" } });
  rows.push({ ref: f1.reference, type: "Finding", severity: "HIGH", trigger: "severity Critical + status Open", date: "—" });

  // ── MED ──
  const c2 = await prisma.cAPA.create({ data: { tenantId, siteId, reference: await capaRef(), source: "Gap Assessment", description: `${SAMPLE} DI-gate CAPA — data integrity remediation`, risk: "High", owner: ownerQA, createdBy: "Sample Seed", status: "open", diGate: true, dueDate: future30 } });
  rows.push({ ref: c2.reference, type: "CAPA", severity: "MED", trigger: "diGate true + open (dueDate +30d, NOT overdue)", date: iso(future30) });

  // MEDIUM risk + Validated so ONLY the periodic-review check trips (not high-risk-unvalidated / overdue-validation).
  const s2 = await prisma.gxPSystem.create({ data: { tenantId, siteId, reference: await sysRef(), name: `${SAMPLE} Chromatography Data System`, type: "CDS", riskLevel: "MEDIUM", validationStatus: "Validated", owner: ownerCSV, nextReview: past15, createdBy: "Sample Seed" } });
  rows.push({ ref: s2.reference, type: "System", severity: "MED", trigger: "nextReview -15d (Validated, MEDIUM risk)", date: iso(past15) });

  // ── LOW ──
  const c3 = await prisma.cAPA.create({ data: { tenantId, siteId, reference: await capaRef(), source: "Gap Assessment", description: `${SAMPLE} CAPA awaiting QA sign-off`, risk: "Medium", owner: ownerQA, createdBy: "Sample Seed", status: "pending_qa_review", dueDate: future30 } });
  rows.push({ ref: c3.reference, type: "CAPA", severity: "LOW", trigger: "status pending_qa_review", date: iso(future30) });

  console.log(`\nInserted ${rows.length} "[SAMPLE]" rows on tenant ${tenantId} (site ${siteCode}):`);
  console.table(rows);
  console.log(`Remove with: npx tsx scripts/remove-sample-gaps.ts`);
  console.log(`Note: the dashboard reads via the client store — open /capa, /csv-csa and /gap-assessment once so the data hydrates, then the Gap Detection panel shows HIGH/MED/LOW.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
