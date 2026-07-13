/**
 * RUNG 2.8 one-time backfill — assign URS-<SITE_CODE>-<NNNN> references to
 * every RTMEntry still on a null reference. Run once locally:
 *   npx tsx scripts/backfill-rtm-references.ts
 *
 * Mirrors the SYS backfill (scripts/backfill-system-references.ts):
 *  - SITE_CODE = the containing system's Site.code (canonical), falling back
 *    to a 3-letter slug of the site name.
 *  - NNNN = 4-digit zero-padded, sequential per (tenant, prefix), continuing
 *    from any references already present so the run is resumable.
 *  - Oldest entries (by createdAt) get the lowest numbers.
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
  console.log("=== RUNG 2.8 URS reference backfill ===");
  const entries = await prisma.rTMEntry.findMany({
    where: { reference: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      ursId: true,
      system: { select: { tenantId: true, siteId: true } },
    },
  });
  console.log(`${entries.length} RTM entr(y/ies) without a reference.`);

  const counters = new Map<string, number>();
  const siteCache = new Map<string, string>();
  let updated = 0;
  let skipped = 0;

  for (const e of entries) {
    const tenantId = e.system.tenantId;
    const siteId = e.system.siteId;
    let siteCode = siteId ? siteCache.get(siteId) : undefined;
    if (siteCode === undefined) {
      const site = siteId ? await prisma.site.findUnique({ where: { id: siteId }, select: { code: true, name: true } }) : null;
      siteCode = site?.code?.trim() || deriveSiteCode(site?.name);
      if (siteId) siteCache.set(siteId, siteCode);
    }
    const prefix = `URS-${siteCode}`;
    const key = `${tenantId}::${prefix}`;

    let next = counters.get(key);
    if (next === undefined) {
      const latest = await prisma.rTMEntry.findFirst({
        where: { reference: { startsWith: `${prefix}-` }, system: { tenantId } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      const m = latest?.reference?.match(/-(\d+)$/);
      next = m ? Number.parseInt(m[1], 10) : 0;
    }
    next += 1;
    if (next > 9999) {
      console.warn(`  ⚠ ${prefix} sequence exhausted (>9999) — skipping ${e.id}`);
      skipped++;
      continue;
    }
    counters.set(key, next);
    const reference = `${prefix}-${String(next).padStart(4, "0")}`;
    await prisma.rTMEntry.update({ where: { id: e.id }, data: { reference } });
    console.log(`  ${reference} → ${e.id} (tag: ${e.ursId})`);
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
