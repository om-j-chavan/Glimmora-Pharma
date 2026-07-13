/**
 * RUNG 3A.1 recon (READ-ONLY) — find stages that hold live evidence but still
 * sit at status "not_started" (pre-2.8 uploads, before addStageDocument began
 * flipping the status). Prints SYS-BLR-0004 detail + the full backfill set.
 *   npx tsx scripts/recon-stale-stages.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function liveDocCount(stageId: string): Promise<number> {
  return prisma.stageDocument.count({ where: { validationStageId: stageId, deletedAt: null } });
}

async function main() {
  console.log("=== RUNG 3A.1 recon: stale not_started stages with live evidence ===\n");

  // Q1 — SYS-BLR-0004 detail
  const target = await prisma.gxPSystem.findFirst({
    where: { reference: "SYS-BLR-0004" },
    select: { id: true, reference: true, name: true, validationStatus: true, statusManuallySet: true, signedOffAt: true,
      validationStages: { select: { id: true, stageName: true, status: true }, orderBy: { stageName: "asc" } } },
  });
  if (!target) {
    console.log("Q1: SYS-BLR-0004 not found.");
  } else {
    console.log(`Q1: ${target.reference} (${target.name}) — header status: ${target.validationStatus}${target.statusManuallySet ? " [manual]" : ""}${target.signedOffAt ? " [signed-off]" : ""}`);
    for (const s of target.validationStages) {
      const n = await liveDocCount(s.id);
      const flag = n >= 1 && s.status === "not_started" ? "  <-- STALE" : "";
      console.log(`     ${s.stageName.padEnd(4)} status=${s.status.padEnd(12)} liveDocs=${n}${flag}`);
    }
  }

  // Q2 — full backfill set across all systems
  console.log("\nQ2: backfill set (status=not_started AND >=1 live doc):");
  const notStarted = await prisma.validationStage.findMany({
    where: { status: "not_started" },
    select: { id: true, stageName: true, system: { select: { reference: true, name: true } } },
  });
  let count = 0;
  for (const s of notStarted) {
    const n = await liveDocCount(s.id);
    if (n >= 1) {
      count++;
      console.log(`     ${(s.system.reference ?? "—").padEnd(12)} ${s.stageName.padEnd(4)} liveDocs=${n}  (${s.system.name})`);
    }
  }
  console.log(`\n   Total stale stages to backfill: ${count}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
