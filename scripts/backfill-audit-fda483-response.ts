/**
 * RUNG 3G one-time data backfill — unify the historical FDA 483 audit module
 * string. Pre-3G, response-package document uploads were logged under
 * "FDA 483 Response" while every other FDA 483 action used "FDA 483". The
 * audit-trail filter matches "FDA 483" by strict equality, so the split rows
 * were invisible. Run once locally:
 *   npx tsx scripts/backfill-audit-fda483-response.ts
 *
 * Idempotent: re-running affects 0 rows once unified.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== RUNG 3G audit module unification: 'FDA 483 Response' -> 'FDA 483' ===");
  const before = await prisma.auditLog.count({ where: { module: "FDA 483 Response" } });
  console.log(`${before} audit row(s) with module = "FDA 483 Response".`);

  const result = await prisma.auditLog.updateMany({
    where: { module: "FDA 483 Response" },
    data: { module: "FDA 483" },
  });
  console.log(`Updated ${result.count} row(s) -> "FDA 483".`);

  const remaining = await prisma.auditLog.count({ where: { module: "FDA 483 Response" } });
  console.log(`Remaining "FDA 483 Response" rows (should be 0): ${remaining}`);
  console.log("=== backfill complete ===");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
