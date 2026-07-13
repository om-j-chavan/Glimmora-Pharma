/**
 * RUNG 3C one-time data backfill — unify the historical CSV/CSA audit module
 * string. Pre-3C, stage-document events were logged under "CSV / Validation"
 * while every other CSV/CSA action used "CSV/CSA". The audit-trail filter
 * matches "CSV/CSA" by strict equality, so the split rows were invisible.
 * Run once locally:
 *   npx tsx scripts/backfill-audit-csv-validation.ts
 *
 * Idempotent: re-running affects 0 rows once unified.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== RUNG 3C audit module unification: 'CSV / Validation' -> 'CSV/CSA' ===");
  const before = await prisma.auditLog.count({ where: { module: "CSV / Validation" } });
  console.log(`${before} audit row(s) with module = "CSV / Validation".`);

  const result = await prisma.auditLog.updateMany({
    where: { module: "CSV / Validation" },
    data: { module: "CSV/CSA" },
  });
  console.log(`Updated ${result.count} row(s) -> "CSV/CSA".`);

  const remaining = await prisma.auditLog.count({ where: { module: "CSV / Validation" } });
  console.log(`Remaining "CSV / Validation" rows (should be 0): ${remaining}`);
  console.log("=== backfill complete ===");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
