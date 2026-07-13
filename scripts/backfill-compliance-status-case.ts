/**
 * RUNG 3K one-time data backfill — normalize GxPSystem.part11Status /
 * annex11Status to the canonical ComplianceStatus set
 * ("Compliant" | "Non-Compliant" | "Partial" | "In Progress" | "N/A").
 * Run once locally:
 *   npx tsx scripts/backfill-compliance-status-case.ts
 *
 * The only non-canonical value found in recon was "Gaps Identified"
 * (a partial-compliance label) → mapped to "Partial". Unknown values are
 * logged and left untouched (never coerced blindly). Idempotent.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANONICAL = new Set(["Compliant", "Non-Compliant", "Partial", "In Progress", "N/A"]);
// Known non-canonical → canonical mappings.
const MAP: Record<string, string> = {
  "gaps identified": "Partial",
  "non compliant": "Non-Compliant",
  "in review": "In Progress",
};

function normalize(v: string | null | undefined): string | null {
  if (v == null) return null;
  if (CANONICAL.has(v)) return null; // already canonical
  return MAP[v.trim().toLowerCase()] ?? null; // null = unknown (leave as-is)
}

async function main() {
  console.log("=== RUNG 3K compliance-status normalization ===");
  const rows = await prisma.gxPSystem.findMany({
    select: { id: true, reference: true, part11Status: true, annex11Status: true },
  });
  console.log(`${rows.length} system(s) scanned.`);

  let updated = 0;
  let unknown = 0;
  for (const r of rows) {
    const data: { part11Status?: string; annex11Status?: string } = {};
    const p11 = normalize(r.part11Status);
    const a11 = normalize(r.annex11Status);
    if (p11) data.part11Status = p11;
    if (a11) data.annex11Status = a11;

    // Warn on values that are neither canonical nor mapped.
    for (const [field, val] of [["part11Status", r.part11Status], ["annex11Status", r.annex11Status]] as const) {
      if (val != null && !CANONICAL.has(val) && !MAP[val.trim().toLowerCase()]) {
        console.warn(`  ⚠ unknown ${field}=${JSON.stringify(val)} on ${r.reference ?? r.id} — left as-is`);
        unknown++;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.gxPSystem.update({ where: { id: r.id }, data });
      console.log(`  ${r.reference ?? r.id}: ${JSON.stringify(data)}`);
      updated++;
    }
  }

  console.log(`=== backfill complete: ${updated} system(s) updated, ${unknown} unknown value(s), ${rows.length} scanned ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
