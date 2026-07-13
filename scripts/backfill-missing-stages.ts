/**
 * Heal demo systems that have ZERO validationStage rows (legacy fixture data
 * in the local dev.db predates auto-stage-creation). Idempotent: only touches
 * systems with no stages; creates the standard 7 with status "not_started",
 * exactly like createSystem() does for UI-created systems.
 *
 * Run: npx tsx scripts/backfill-missing-stages.ts
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const STANDARD_STAGES = ["URS", "FS", "DS", "IQ", "OQ", "PQ", "RTR"] as const;

async function main() {
  const systems = await prisma.gxPSystem.findMany({
    where: { deletedAt: null },
    select: { id: true, reference: true, name: true, _count: { select: { validationStages: true } } },
  });

  const missing = systems.filter((s) => s._count.validationStages === 0);
  console.log(`Systems total: ${systems.length} · missing stages: ${missing.length}`);

  for (const s of missing) {
    await prisma.validationStage.createMany({
      data: STANDARD_STAGES.map((stageName) => ({
        systemId: s.id,
        stageName,
        status: "not_started",
      })),
    });
    console.log(`  ✓ ${s.reference} (${s.name}) — created ${STANDARD_STAGES.length} stages`);
  }

  if (missing.length === 0) console.log("Nothing to backfill — all systems already have stages.");
  else console.log("Done.");
}

main().finally(() => prisma.$disconnect());
