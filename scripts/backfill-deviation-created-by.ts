/**
 * One-off backfill — SME Section 1, Stage 5 (FULL).
 *
 * Populates the new Deviation.createdById userId FK from the legacy
 * Deviation.createdBy display-name string. Tenant-scoped — name
 * matching is done within the Deviation's own tenant only, so a "Priya
 * Sharma" in tenant A never accidentally points at a "Priya Sharma" in
 * tenant B (which would silently corrupt SoD comparisons later).
 *
 * Idempotent — only touches Deviation rows whose createdById is still
 * null. Safe to re-run.
 *
 * Report:
 *  - populated:  rows where exactly one user matched the createdBy name
 *  - orphan:     rows whose createdBy name doesn't match any user in the tenant
 *  - ambiguous:  rows where multiple users share the same name in the tenant
 *                — left null + logged, since arbitrarily picking one would
 *                  bake an incorrect SoD identity into the audit history
 *
 * Run with: npx tsx scripts/backfill-deviation-created-by.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const deviations = await prisma.deviation.findMany({
    where: { createdById: null },
    select: { id: true, createdBy: true, tenantId: true, title: true },
  });

  let populated = 0;
  const orphan: { id: string; name: string; title: string; tenantId: string }[] = [];
  const ambiguous: {
    id: string;
    name: string;
    matchCount: number;
    tenantId: string;
  }[] = [];

  for (const dev of deviations) {
    const matches = await prisma.user.findMany({
      where: { tenantId: dev.tenantId, name: dev.createdBy },
      select: { id: true, name: true },
    });

    if (matches.length === 0) {
      orphan.push({
        id: dev.id,
        name: dev.createdBy,
        title: dev.title,
        tenantId: dev.tenantId,
      });
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push({
        id: dev.id,
        name: dev.createdBy,
        matchCount: matches.length,
        tenantId: dev.tenantId,
      });
      continue;
    }
    await prisma.deviation.update({
      where: { id: dev.id },
      data: { createdById: matches[0].id },
    });
    populated++;
  }

  console.log(
    `[backfill] totalCandidates=${deviations.length} populated=${populated} orphan=${orphan.length} ambiguous=${ambiguous.length}`,
  );
  if (orphan.length > 0) {
    console.log("[backfill] orphan rows (creator name does not match any user in tenant):");
    for (const o of orphan) {
      console.log(`  - dev=${o.id} tenant=${o.tenantId} name="${o.name}" title="${o.title}"`);
    }
  }
  if (ambiguous.length > 0) {
    console.log("[backfill] ambiguous rows (multiple users share name in tenant — left null):");
    for (const a of ambiguous) {
      console.log(`  - dev=${a.id} tenant=${a.tenantId} name="${a.name}" matchCount=${a.matchCount}`);
    }
  }
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
