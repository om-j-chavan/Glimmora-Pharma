/**
 * One-off backfill — SME Section 1, Stage 4 (FULL).
 *
 * Splits any existing CAPA.correctiveActions free-text blob into
 * structured CAPAActionItem rows. Idempotent — only touches CAPAs
 * that have a non-empty correctiveActions AND zero existing
 * CAPAActionItem rows.
 *
 * For each split line: sequence = index + 1, description = trimmed
 * line, owner = "Unassigned" (ownerId null), dueDate = CAPA.dueDate
 * if set or CAPA.createdAt + 30 days as a placeholder, status =
 * "pending", createdBy = "system-backfill".
 *
 * The correctiveActions field stays populated — it now acts as the
 * denormalised cache (rebuilt by syncCorrectiveActions on every
 * action-item write). Future cleanup rung may drop the column.
 *
 * Run with: npx tsx scripts/backfill-capa-action-items.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const candidates = await prisma.cAPA.findMany({
    where: {
      correctiveActions: { not: null },
    },
    select: {
      id: true,
      reference: true,
      correctiveActions: true,
      dueDate: true,
      createdAt: true,
      tenantId: true,
      _count: { select: { actionItems: true } },
    },
  });

  let capasProcessed = 0;
  let rowsCreated = 0;
  let capasSkipped = 0;

  for (const capa of candidates) {
    if (capa._count.actionItems > 0) {
      capasSkipped++;
      continue;
    }
    const raw = (capa.correctiveActions ?? "").trim();
    if (raw.length === 0) {
      capasSkipped++;
      continue;
    }
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      capasSkipped++;
      continue;
    }
    const fallbackDue = capa.dueDate
      ? new Date(capa.dueDate)
      : new Date(capa.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await prisma.cAPAActionItem.createMany({
      data: lines.map((line, idx) => ({
        tenantId: capa.tenantId,
        capaId: capa.id,
        sequence: idx + 1,
        description: line,
        owner: "Unassigned",
        ownerId: null,
        dueDate: fallbackDue,
        status: "pending",
        createdBy: "system-backfill",
        createdById: null,
      })),
    });
    rowsCreated += lines.length;
    capasProcessed++;
  }

  console.log(
    `[backfill] capasProcessed=${capasProcessed} rowsCreated=${rowsCreated} capasSkipped=${capasSkipped} totalCandidates=${candidates.length}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
