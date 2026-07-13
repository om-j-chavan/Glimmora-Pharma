/**
 * RUNG 2.7 one-time backfill — assign SYS-<SITE_CODE>-<NNNN> references to
 * every GxPSystem still on a null reference. Run once locally:
 *   npx tsx scripts/backfill-system-references.ts
 *
 * Sequence rules (match src/actions/systems.ts):
 *  - SITE_CODE = Site.code (canonical), falling back to a 3-letter slug of the
 *    site name (accents/non-ASCII stripped, padded with "X").
 *  - NNNN = 4-digit zero-padded, sequential per (tenant, prefix), continuing
 *    from any references already present so a partial run is resumable.
 *  - Oldest systems (by createdAt) get the lowest numbers.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function deriveSiteCode(name: string | null | undefined): string {
  if (!name) return "XXX";
  const letters = name.normalize("NFKD").replace(/[^a-zA-Z]/g, "");
  if (!letters) return "XXX";
  return letters.slice(0, 3).toUpperCase().padEnd(3, "X");
}

async function main() {
  console.log("=== RUNG 2.7 SYS reference backfill ===");
  const systems = await prisma.gxPSystem.findMany({
    where: { reference: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, siteId: true, tenantId: true },
  });
  console.log(`${systems.length} system(s) without a reference.`);

  // Running counter per (tenant, prefix), seeded from the current DB max so we
  // continue an existing sequence rather than colliding with it.
  const counters = new Map<string, number>();
  let updated = 0;
  let skipped = 0;

  for (const s of systems) {
    const site = s.siteId
      ? await prisma.site.findUnique({ where: { id: s.siteId }, select: { code: true, name: true } })
      : null;
    const siteCode = site?.code?.trim() || deriveSiteCode(site?.name);
    const prefix = `SYS-${siteCode}`;
    const key = `${s.tenantId}::${prefix}`;

    let next = counters.get(key);
    if (next === undefined) {
      const latest = await prisma.gxPSystem.findFirst({
        where: { tenantId: s.tenantId, reference: { startsWith: `${prefix}-` } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      const m = latest?.reference?.match(/-(\d+)$/);
      next = m ? Number.parseInt(m[1], 10) : 0;
    }
    next += 1;
    if (next > 9999) {
      console.warn(`  ⚠ ${prefix} sequence exhausted (>9999) — skipping ${s.id} (${s.name})`);
      skipped++;
      continue;
    }
    counters.set(key, next);
    const reference = `${prefix}-${String(next).padStart(4, "0")}`;
    await prisma.gxPSystem.update({ where: { id: s.id }, data: { reference } });
    console.log(`  ${reference} → ${s.id} (${s.name})`);
    updated++;
  }

  console.log(`=== backfill complete: ${updated} updated, ${skipped} skipped ===`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
