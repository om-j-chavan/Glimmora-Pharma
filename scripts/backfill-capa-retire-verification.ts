/**
 * One-time data backfill — retire the CAPA independent-verification step.
 *
 * The verification stage (pending_verification + verifyCAPA) was removed: an
 * approved CAPA is now closeable directly from pending_qa_review. This script
 * normalizes any CAPA still parked in the now-defunct "pending_verification"
 * state back to "pending_qa_review" so it re-enters the (unchanged) approval +
 * sign-&-close flow cleanly.
 *
 * Scope: ONLY non-closed in-flight rows — a CAPA in "pending_verification" is
 * by definition not yet closed, so the status filter already excludes closed
 * CAPAs. Closed CAPAs keep their verifiedAt / verification SignedRecords
 * (Part 11 history) untouched. We also leave the moved rows' verification
 * fields as-is (vestigial but harmless; closure no longer reads them) so the
 * link to any verification SignedRecord is preserved.
 *
 * Run once locally (and once per environment):
 *   npx tsx scripts/backfill-capa-retire-verification.ts
 *
 * Idempotent: re-running affects 0 rows once no CAPA sits in pending_verification.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stranded = await prisma.cAPA.findMany({
    where: { status: "pending_verification" },
    select: { id: true, reference: true, tenantId: true, verifiedAt: true },
  });

  if (stranded.length === 0) {
    console.log("[backfill] No CAPAs in pending_verification — nothing to do.");
    return;
  }

  console.log(`[backfill] Found ${stranded.length} CAPA(s) in pending_verification:`);
  for (const c of stranded) {
    console.log(
      `  - ${c.reference ?? c.id} (tenant ${c.tenantId})${c.verifiedAt ? " [was verified]" : ""}`,
    );
  }

  const { count } = await prisma.cAPA.updateMany({
    where: { status: "pending_verification" },
    data: { status: "pending_qa_review" },
  });

  console.log(`[backfill] Moved ${count} CAPA(s) → pending_qa_review. Done.`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
