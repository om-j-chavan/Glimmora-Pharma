/**
 * RUNG 3H one-time data backfill — normalize Finding.status to canonical
 * Title Case ("Open" | "In Progress" | "Closed"). Run once locally:
 *   npx tsx scripts/backfill-finding-status-case.ts
 *
 * Pre-3H, createFinding wrote "open" and closeFinding wrote "closed"
 * (lowercase), while the schema default, the updateFinding enum, the
 * FindingStatus type, and every read site use Title Case. This maps any
 * non-canonical row to Title Case. Idempotent: rows already canonical are
 * skipped; unknown values are logged and left untouched.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CANONICAL = new Set(["Open", "In Progress", "Closed"]);
const MAP: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  "in progress": "In Progress",
  closed: "Closed",
};

async function main() {
  console.log("=== RUNG 3H Finding.status Title-Case backfill ===");
  const rows = await prisma.finding.findMany({ select: { id: true, status: true, reference: true } });
  console.log(`${rows.length} finding row(s) scanned.`);

  let updated = 0;
  let unknown = 0;
  for (const r of rows) {
    if (CANONICAL.has(r.status)) continue; // already canonical
    const target = MAP[r.status.trim().toLowerCase()];
    if (!target) {
      console.warn(`  ⚠ unknown status ${JSON.stringify(r.status)} on ${r.reference ?? r.id} — left as-is`);
      unknown++;
      continue;
    }
    await prisma.finding.update({ where: { id: r.id }, data: { status: target } });
    console.log(`  ${r.reference ?? r.id}: ${JSON.stringify(r.status)} -> ${JSON.stringify(target)}`);
    updated++;
  }

  console.log(`=== backfill complete: ${updated} updated, ${unknown} unknown, ${rows.length} scanned ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
