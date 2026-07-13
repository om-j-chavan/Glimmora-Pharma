/**
 * One-off backfill — populate `reference` on existing records of all
 * five modules (Deviation, CAPA, Finding, FDA483Observation,
 * ChangeControl). Iterates per-tenant, per-site, per-year so the
 * sequence resets at year boundaries the same way the live generator
 * does. Idempotent — skips rows that already have a reference.
 *
 * Format: <MODULE>-<SITE_CODE>-<YEAR>-<NNN>
 * Fallback to 2-segment "<MODULE>-<YEAR>-<NNN>" when the record has no
 * site or the site has no code (matches the live generator).
 *
 * Run with: npx tsx scripts/backfill-references.ts
 */
import { prisma } from "@/lib/prisma";
import { buildReferencePrefix } from "@/lib/reference";

type ModuleSpec = {
  module: "DEV" | "CAPA" | "FND" | "483" | "CC";
  label: string;
  fetch: () => Promise<Array<{ id: string; reference: string | null; siteCode: string | null; createdAt: Date }>>;
  update: (id: string, reference: string) => Promise<void>;
};

async function fetchSiteCodeMap(): Promise<Map<string, string | null>> {
  const sites = await prisma.site.findMany({ select: { id: true, code: true } });
  return new Map(sites.map((s) => [s.id, s.code]));
}

async function processModule(spec: ModuleSpec) {
  const rows = await spec.fetch();
  const candidates = rows.filter((r) => !r.reference).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let updated = 0;
  // Per-prefix per-year sequence counters, seeded from highest existing
  // numbered reference for that bucket (in case a partial backfill ran).
  const counters = new Map<string, number>();
  // Seed counters from already-populated rows.
  for (const r of rows.filter((r) => r.reference)) {
    const m = r.reference!.match(/^(.+)-(\d+)$/);
    if (!m) continue;
    const bucket = m[1];
    const n = Number.parseInt(m[2], 10);
    if (!Number.isFinite(n)) continue;
    const prev = counters.get(bucket) ?? 0;
    if (n > prev) counters.set(bucket, n);
  }
  for (const row of candidates) {
    const year = row.createdAt.getUTCFullYear();
    const prefix = buildReferencePrefix(spec.module, row.siteCode);
    const bucket = `${prefix}-${year}`;
    const next = (counters.get(bucket) ?? 0) + 1;
    counters.set(bucket, next);
    const reference = `${bucket}-${String(next).padStart(3, "0")}`;
    await spec.update(row.id, reference);
    updated++;
  }
  console.log(`[backfill] ${spec.label}: candidates=${candidates.length} updated=${updated}`);
  return { module: spec.label, updated, candidates: candidates.length };
}

async function main() {
  const siteCode = await fetchSiteCodeMap();
  const totals = await Promise.all([
    processModule({
      module: "DEV",
      label: "Deviation",
      fetch: async () => {
        const rows = await prisma.deviation.findMany({
          select: { id: true, reference: true, siteId: true, createdAt: true },
        });
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          siteCode: r.siteId ? siteCode.get(r.siteId) ?? null : null,
          createdAt: r.createdAt,
        }));
      },
      update: async (id, reference) => {
        await prisma.deviation.update({ where: { id }, data: { reference } });
      },
    }),
    processModule({
      module: "CAPA",
      label: "CAPA",
      fetch: async () => {
        const rows = await prisma.cAPA.findMany({
          select: { id: true, reference: true, siteId: true, createdAt: true },
        });
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          siteCode: r.siteId ? siteCode.get(r.siteId) ?? null : null,
          createdAt: r.createdAt,
        }));
      },
      update: async (id, reference) => {
        await prisma.cAPA.update({ where: { id }, data: { reference } });
      },
    }),
    processModule({
      module: "FND",
      label: "Finding",
      fetch: async () => {
        const rows = await prisma.finding.findMany({
          select: { id: true, reference: true, siteId: true, createdAt: true },
        });
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          siteCode: r.siteId ? siteCode.get(r.siteId) ?? null : null,
          createdAt: r.createdAt,
        }));
      },
      update: async (id, reference) => {
        await prisma.finding.update({ where: { id }, data: { reference } });
      },
    }),
    processModule({
      module: "483",
      label: "FDA483Observation",
      fetch: async () => {
        const rows = await prisma.fDA483Observation.findMany({
          select: {
            id: true,
            reference: true,
            createdAt: true,
            event: { select: { siteId: true } },
          },
        });
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          siteCode: r.event?.siteId ? siteCode.get(r.event.siteId) ?? null : null,
          createdAt: r.createdAt,
        }));
      },
      update: async (id, reference) => {
        await prisma.fDA483Observation.update({ where: { id }, data: { reference } });
      },
    }),
    processModule({
      module: "CC",
      label: "ChangeControl",
      fetch: async () => {
        const rows = await prisma.changeControl.findMany({
          select: { id: true, reference: true, createdAt: true },
        });
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          siteCode: null,
          createdAt: r.createdAt,
        }));
      },
      update: async (id, reference) => {
        await prisma.changeControl.update({ where: { id }, data: { reference } });
      },
    }),
  ]);
  console.log("[backfill] totals:", JSON.stringify(totals));
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
