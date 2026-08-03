/**
 * One-off backfill — seed TenantRegion from the legacy scalar Tenant.regulatoryRegion.
 *
 * Multi-region tenants store their region SET in the TenantRegion join table,
 * which is the source of truth for framework resolution. Tenant.regulatoryRegion
 * is kept as the PRIMARY (regions[0]) shim + this backfill's source. For every
 * tenant that has a non-null regulatoryRegion, ensure a matching TenantRegion row
 * exists.
 *
 * ADDITIVE + idempotent — upsert on @@unique([tenantId, region]); a re-run is a
 * no-op. Never deletes a TenantRegion row and never touches regulatoryRegion.
 *
 *   npx tsx scripts/backfills/backfill-tenant-region.ts          # dry run
 *   npx tsx scripts/backfills/backfill-tenant-region.ts --apply  # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const total = await prisma.tenant.count();
  const tenants = await prisma.tenant.findMany({
    where: { regulatoryRegion: { not: null } },
    select: { id: true, name: true, regulatoryRegion: true },
    orderBy: { createdAt: "asc" },
  });
  const withNullRegion = total - tenants.length;

  // Resolve current state so the dry-run count reflects only real work.
  let willCreate = 0;
  let alreadyPresent = 0;
  const plan: { name: string; region: string; exists: boolean }[] = [];
  for (const t of tenants) {
    const region = t.regulatoryRegion!;
    const existing = await prisma.tenantRegion.findUnique({
      where: { tenantId_region: { tenantId: t.id, region } },
      select: { id: true },
    });
    if (existing) { alreadyPresent += 1; plan.push({ name: t.name, region, exists: true }); }
    else { willCreate += 1; plan.push({ name: t.name, region, exists: false }); }
  }

  console.log(`[backfill] Tenants total:                 ${total}`);
  console.log(`[backfill] With a regulatoryRegion:       ${tenants.length}`);
  console.log(`[backfill]   already have TenantRegion:   ${alreadyPresent}`);
  console.log(`[backfill]   need a TenantRegion row:     ${willCreate}`);
  console.log(`[backfill] With NULL region (skipped):    ${withNullRegion}\n`);

  for (const p of plan) {
    console.log(`  - ${p.name}: [${p.region}] ${p.exists ? "(exists)" : "WILL CREATE"}`);
  }

  if (willCreate === 0) {
    console.log("\n[backfill] Nothing to create — the scalar and the set are already in sync.");
    return;
  }
  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to create ${willCreate} TenantRegion row(s).`);
    return;
  }

  let written = 0;
  for (const t of tenants) {
    const region = t.regulatoryRegion!;
    // upsert = idempotent on @@unique([tenantId, region]).
    await prisma.tenantRegion.upsert({
      where: { tenantId_region: { tenantId: t.id, region } },
      update: {},
      create: { tenantId: t.id, region },
    });
    written += 1;
  }
  console.log(`\n[backfill] APPLIED — upserted ${written} TenantRegion row(s) (idempotent).`);
  console.log("[backfill] Done. Tenant.regulatoryRegion left untouched.");
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
