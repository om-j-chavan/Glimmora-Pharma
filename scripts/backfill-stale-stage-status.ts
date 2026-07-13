/**
 * RUNG 3A.1 one-time data backfill — stages that hold live evidence but still
 * sit at status "not_started" (documents uploaded BEFORE Rung 2.8 taught
 * addStageDocument to flip not_started → in_progress). Run once locally:
 *   npx tsx scripts/backfill-stale-stage-status.ts
 *
 * For every stage with >=1 live (deletedAt == null) document AND status
 * "not_started", set status = "in_progress". Stages that are in_review /
 * approved / rejected / skipped, or that have zero live docs, are left
 * untouched. Each affected system's validationStatus is then re-derived (not
 * hand-written) using the same precedence as src/actions/systems.ts
 * deriveValidationStatus, respecting a manual attestation or Part 11 sign-off
 * (which are the status authority and must not be clobbered — mirrors the
 * syncValidationStatus guard). Idempotent: a second run flips nothing.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Mirror of src/actions/systems.ts deriveValidationStatus (module-private
 *  there, replicated here so the script derives rather than hand-writes). */
function deriveValidationStatus(stages: { status: string }[]): string {
  if (stages.length === 0) return "Not Started";
  const statuses = stages.map((s) => s.status);
  const approved = statuses.filter((s) => s === "approved").length;
  const skipped = statuses.filter((s) => s === "skipped").length;
  if (approved + skipped === statuses.length && approved >= 1) return "Validated";
  if (statuses.some((s) => s === "rejected")) return "Validation Failed";
  if (statuses.some((s) => s === "in_review")) return "Under Review";
  if (approved + skipped >= 1) return "In Progress";
  if (statuses.some((s) => s === "in_progress" || s === "draft")) return "In Progress";
  return "Not Started";
}

async function main() {
  console.log("=== RUNG 3A.1 backfill: stale not_started stages holding live evidence ===");

  const candidates = await prisma.validationStage.findMany({
    where: { status: "not_started" },
    select: { id: true, stageName: true, systemId: true, system: { select: { reference: true } } },
  });

  const affectedSystems = new Set<string>();
  let stagesUpdated = 0;
  for (const s of candidates) {
    const live = await prisma.stageDocument.count({ where: { validationStageId: s.id, deletedAt: null } });
    if (live < 1) continue;
    await prisma.validationStage.update({ where: { id: s.id }, data: { status: "in_progress" } });
    affectedSystems.add(s.systemId);
    stagesUpdated++;
    console.log(`  stage ${(s.system.reference ?? s.systemId)}/${s.stageName}: not_started -> in_progress (${live} live doc${live === 1 ? "" : "s"})`);
  }

  // Re-derive each affected system's header status from its (now-updated) stages.
  let systemsUpdated = 0;
  for (const systemId of affectedSystems) {
    const sys = await prisma.gxPSystem.findUnique({
      where: { id: systemId },
      select: {
        reference: true, validationStatus: true, statusManuallySet: true, signedOffAt: true,
        validationStages: { select: { status: true } },
      },
    });
    if (!sys) continue;
    if (sys.statusManuallySet || sys.signedOffAt) {
      console.log(`  system ${sys.reference ?? systemId}: status authority is ${sys.statusManuallySet ? "manual attestation" : "sign-off"} — left as ${sys.validationStatus}`);
      continue;
    }
    const derived = deriveValidationStatus(sys.validationStages);
    if (derived !== sys.validationStatus) {
      await prisma.gxPSystem.update({ where: { id: systemId }, data: { validationStatus: derived } });
      systemsUpdated++;
      console.log(`  system ${sys.reference ?? systemId}: ${sys.validationStatus} -> ${derived}`);
    }
  }

  console.log(`=== backfill complete: ${stagesUpdated} stage(s), ${systemsUpdated} system status(es) updated ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
