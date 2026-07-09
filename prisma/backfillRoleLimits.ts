/**
 * One-time backfill: seed per-plan role-cap defaults into PlanRoleLimit for all
 * EXISTING plans (Phase-A left the table empty). Idempotent — re-runnable, never
 * clobbers an admin-edited cap. Run: `npx tsx prisma/backfillRoleLimits.ts`.
 */
import { PrismaClient } from "@prisma/client";
import { seedPlanRoleLimits } from "./roleLimitsSeed";

async function main() {
  const prisma = new PrismaClient();
  try {
    const res = await seedPlanRoleLimits(prisma);
    console.log(`[backfill] plans=${res.plans} plansCapsUpdated=${res.plansUpdated} rowsCreated=${res.created} rowsUpdatedToNewDefault=${res.updated} rowsKeptEdited=${res.keptEdited}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
