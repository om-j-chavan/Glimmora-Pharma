/**
 * Remove the throwaway sample gap rows created by scripts/seed-sample-gaps.ts.
 * Deletes ONLY rows whose description / requirement / name starts with
 * "[SAMPLE]" on the demo tenant — real records are never touched.
 *
 *   npx tsx scripts/remove-sample-gaps.ts            (delete)
 *   npx tsx scripts/remove-sample-gaps.ts --dry-run  (report counts only)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SAMPLE = "[SAMPLE]";
const DEMO_EMAIL = "admin@pharmaglimmora.com";
const DRY = process.argv.includes("--dry-run");

async function main() {
  const demo = await prisma.tenant.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (!demo) throw new Error(`Demo tenant ${DEMO_EMAIL} not found.`);
  const tenantId = demo.id;

  const capaWhere = { tenantId, description: { startsWith: SAMPLE } };
  const findWhere = { tenantId, requirement: { startsWith: SAMPLE } };
  const sysWhere = { tenantId, name: { startsWith: SAMPLE } };

  const capaCount = await prisma.cAPA.count({ where: capaWhere });
  const findCount = await prisma.finding.count({ where: findWhere });
  const sysCount = await prisma.gxPSystem.count({ where: sysWhere });

  console.log(`"[SAMPLE]" rows on tenant ${tenantId}: CAPA=${capaCount}, Finding=${findCount}, System=${sysCount}`);

  if (DRY) {
    console.log(`Dry run — would delete ${capaCount + findCount + sysCount} row(s). Nothing deleted.`);
    await prisma.$disconnect();
    return;
  }

  const c = await prisma.cAPA.deleteMany({ where: capaWhere });
  const f = await prisma.finding.deleteMany({ where: findWhere });
  const s = await prisma.gxPSystem.deleteMany({ where: sysWhere });
  console.log(`Deleted: CAPA=${c.count}, Finding=${f.count}, System=${s.count}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
