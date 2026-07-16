/**
 * One-off data remediation — repair mis-cased Finding.status left by the
 * Gap→CAPA closure bug (src/actions/capas/closure.ts wrote lowercase "closed"
 * instead of canonical "Closed"). Those findings present as OPEN in the Gap
 * register even though their CAPA is signed-closed.
 *
 * Fixes ONLY findings that are: status === "closed" (corrupt) AND deletedAt: null
 * AND linkedCAPAId → a CAPA whose status === "closed". It does NOT touch a finding
 * whose linked CAPA is not closed (a different anomaly to investigate). It touches
 * no SignedRecord/CAPA/audit row — only the Finding.status casing.
 *
 * Tenant-agnostic; scoped to deletedAt: null. DRY-RUN by default — pass --apply to
 * write. Capture this output as the remediation record.
 *
 *   npx tsx scripts/backfills/backfill-finding-status-casing.ts            # dry run
 *   npx tsx scripts/backfills/backfill-finding-status-casing.ts --apply    # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const candidates = await prisma.finding.findMany({
    where: { status: "closed", deletedAt: null, linkedCAPAId: { not: null } },
    select: { id: true, reference: true, tenantId: true, linkedCAPAId: true },
  });

  const capaIds = [...new Set(candidates.map((f) => f.linkedCAPAId!).filter(Boolean))];
  const capas = capaIds.length
    ? await prisma.cAPA.findMany({ where: { id: { in: capaIds } }, select: { id: true, reference: true, status: true } })
    : [];
  const capaById = new Map(capas.map((c) => [c.id, c]));

  const affected = candidates.filter((f) => capaById.get(f.linkedCAPAId!)?.status === "closed");
  const skipped = candidates.filter((f) => capaById.get(f.linkedCAPAId!)?.status !== "closed");

  console.log(`[backfill] Candidates (status="closed", linked): ${candidates.length}`);
  console.log(`[backfill] Will fix (linked CAPA is closed):      ${affected.length}`);
  console.log(`[backfill] Skipped (linked CAPA NOT closed):       ${skipped.length}\n`);

  if (affected.length === 0) { console.log("[backfill] Nothing to fix."); return; }

  console.log("[backfill] Affected findings:");
  for (const f of affected) {
    const capa = capaById.get(f.linkedCAPAId!);
    console.log(`  - finding ${f.reference ?? f.id} (tenant ${f.tenantId})  ->  CAPA ${capa?.reference ?? f.linkedCAPAId}`);
  }
  if (skipped.length) {
    console.log("\n[backfill] Skipped (lowercase status but CAPA not closed — investigate):");
    for (const f of skipped) {
      const capa = capaById.get(f.linkedCAPAId!);
      console.log(`  - finding ${f.reference ?? f.id}  ->  CAPA ${capa?.reference ?? f.linkedCAPAId} [${capa?.status ?? "missing"}]`);
    }
  }

  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to update ${affected.length} finding(s) to "Closed".`);
    return;
  }

  // Re-assert status:"closed" + deletedAt:null in the where (defensive optimistic
  // lock) so a concurrent change since the read isn't clobbered.
  const { count } = await prisma.finding.updateMany({
    where: { id: { in: affected.map((f) => f.id) }, status: "closed", deletedAt: null },
    data: { status: "Closed" },
  });
  console.log(`\n[backfill] APPLIED — updated ${count} finding(s) to "Closed". Done.`);
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
