/**
 * RUNG 2 one-time backfill — migrate legacy CSV/CSA soft links to the new
 * real FK columns. Run once locally: `npx tsx scripts/backfill-csv-fks.ts`.
 *
 * Finding: not a DB column.
 *
 * Reality (confirmed in Rung 2 recon): the Finding→system and CAPA→system
 * "soft links" the audit referenced were Redux-slice fields only — they were
 * never persisted, so there is no source column to migrate. The only real
 * legacy soft column is RTMEntry.linkedFindingId (which the audit found is
 * never written by any action). This script migrates whatever exists there
 * and reports honest counts (expected ~0).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== RUNG 2 CSV/CSA FK backfill ===");

  // Finding.systemId — no persisted source (linkedSystemId was Redux-only).
  console.log("Finding.systemId:   0 candidates (legacy linkedSystemId was never persisted to the DB).");

  // CAPA.systemId — no persisted source (soft match was in-memory in DIAuditPanel).
  console.log("CAPA.systemId:      0 candidates (no persisted soft link existed).");

  // RTMEntry.findingId — migrate from the real (but historically unwritten)
  // linkedFindingId column.
  const candidates = await prisma.rTMEntry.findMany({
    where: { linkedFindingId: { not: null }, findingId: null },
    select: { id: true, linkedFindingId: true },
  });
  let updated = 0;
  let unmatched = 0;
  for (const r of candidates) {
    const finding = await prisma.finding.findUnique({
      where: { id: r.linkedFindingId! },
      select: { id: true },
    });
    if (finding) {
      await prisma.rTMEntry.update({ where: { id: r.id }, data: { findingId: r.linkedFindingId } });
      updated++;
    } else {
      console.warn(`  ⚠ RTMEntry ${r.id}: linkedFindingId ${r.linkedFindingId} has no matching Finding — left null`);
      unmatched++;
    }
  }
  console.log(`RTMEntry.findingId: ${candidates.length} candidate(s), ${updated} updated, ${unmatched} unmatched.`);
  console.log("=== backfill complete ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
