/**
 * One-off backfill — SME Section 1, Stage 6 (FULL).
 *
 * Sets effectivenessDate = closedAt + 90 days for every closed CAPA
 * whose effectivenessDate is null. Idempotent (only touches null
 * rows). Skips rejected CAPAs (status !== "closed") — those aren't
 * subject to the effectiveness check.
 *
 * Skips CAPAs with no closedAt (shouldn't happen for "closed" status
 * but defends against legacy data inconsistency).
 *
 * Run with: npx tsx scripts/backfill-capa-effectiveness-due.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const candidates = await prisma.cAPA.findMany({
    where: {
      status: "closed",
      effectivenessDate: null,
    },
    select: { id: true, reference: true, closedAt: true },
  });

  let populated = 0;
  let skippedNoClosedAt = 0;

  for (const c of candidates) {
    if (!c.closedAt) {
      skippedNoClosedAt++;
      continue;
    }
    const dueAt = new Date(c.closedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    await prisma.cAPA.update({
      where: { id: c.id },
      data: {
        effectivenessDate: dueAt,
        effectivenessCheck: true,
      },
    });
    populated++;
  }

  console.log(
    `[backfill] totalCandidates=${candidates.length} populated=${populated} skippedNoClosedAt=${skippedNoClosedAt}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
