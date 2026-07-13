/**
 * One-off backfill — SME Section 1, Stage 2 (FULL).
 *
 * Populates the new CAPA.deviationId column from the legacy
 * Deviation.linkedCAPAId reverse pointer. Idempotent — only touches
 * CAPAs whose deviationId is still null. Safe to re-run.
 *
 * Tenant-agnostic by design: the join walks the existing link in BOTH
 * directions (Deviation.linkedCAPAId points at CAPA.id), so tenant
 * mismatch would already be a pre-existing data integrity problem the
 * backfill simply reflects rather than introduces.
 *
 * Run with: npx tsx scripts/backfill-capa-deviation.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const deviationsWithLinks = await prisma.deviation.findMany({
    where: { linkedCAPAId: { not: null } },
    select: { id: true, linkedCAPAId: true, tenantId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  let updated = 0;
  let skippedOrphan = 0;
  let skippedAlready = 0;
  let skippedConflict = 0;

  for (const dev of deviationsWithLinks) {
    if (!dev.linkedCAPAId) continue;
    const capa = await prisma.cAPA.findUnique({
      where: { id: dev.linkedCAPAId },
      select: { id: true, deviationId: true, tenantId: true },
    });
    if (!capa) {
      skippedOrphan++;
      continue;
    }
    if (capa.deviationId === dev.id) {
      skippedAlready++;
      continue;
    }
    if (capa.deviationId && capa.deviationId !== dev.id) {
      // Another deviation already won this CAPA (earlier loop iteration).
      // Leave the first winner in place; the second deviation's
      // linkedCAPAId remains pointing at the CAPA but the CAPA's
      // deviationId reflects only one. Existing inconsistency, surfaced
      // not invented.
      skippedConflict++;
      continue;
    }
    if (capa.tenantId !== dev.tenantId) {
      // Cross-tenant link — pre-existing data integrity issue. Skip to
      // avoid creating a relation that violates tenant isolation.
      skippedOrphan++;
      continue;
    }
    await prisma.cAPA.update({
      where: { id: capa.id },
      data: { deviationId: dev.id },
    });
    updated++;
  }

  console.log(
    `[backfill] updated=${updated} already=${skippedAlready} orphan=${skippedOrphan} conflict=${skippedConflict} totalCandidates=${deviationsWithLinks.length}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
