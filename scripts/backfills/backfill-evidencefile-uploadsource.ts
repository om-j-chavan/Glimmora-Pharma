/**
 * One-off — stamp uploadSource on existing CAPA EvidenceFile rows.
 *
 * Provenance-at-CREATION, NOT current uploader: each EvidenceFile has an
 * EVIDENCE_FILE_UPLOADED AuditLog row (recordId = file.id). The carryover path
 * (convertCategorizedDocsToEvidence) records `source: *_carryover` +
 * `sourceDocumentId` in newValue; the direct upload path (addEvidenceFile) does
 * not. So carryover-sourced → "gap" (read-only), everything else → "qa_added"
 * (added after raise; includes worker worklist uploads). Reading the audit
 * (what happened at creation) — never uploadedById (which re-buckets on
 * reassignment) — is the whole point.
 *
 * Scope: EvidenceFile deletedAt: null. Touches ONLY EvidenceFile.uploadSource.
 * The column has NO schema default, so untouched rows stay null until this runs.
 *
 * DRY-RUN by default — pass --apply to write. REQUIRES the
 * add_evidencefile_upload_source migration to have been applied first.
 *
 *   npx tsx scripts/backfills/backfill-evidencefile-uploadsource.ts           # dry run
 *   npx tsx scripts/backfills/backfill-evidencefile-uploadsource.ts --apply   # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** True when the EVIDENCE_FILE_UPLOADED audit newValue marks a carryover. */
function isGapProvenance(newValue: string | null): boolean {
  if (!newValue) return false;
  try {
    const j = JSON.parse(newValue) as { source?: unknown; sourceDocumentId?: unknown };
    return (
      (typeof j.source === "string" && j.source.includes("carryover")) ||
      j.sourceDocumentId != null
    );
  } catch {
    return false;
  }
}

async function main() {
  const files = await prisma.evidenceFile.findMany({
    where: { deletedAt: null },
    select: { id: true, fileName: true, uploadSource: true },
  });

  // One EVIDENCE_FILE_UPLOADED row per file (recordId = file.id).
  const audits = await prisma.auditLog.findMany({
    where: { action: "EVIDENCE_FILE_UPLOADED", recordId: { in: files.map((f) => f.id) } },
    select: { recordId: true, newValue: true },
  });
  const provByFile = new Map<string, string | null>();
  for (const a of audits) if (a.recordId) provByFile.set(a.recordId, a.newValue);

  // Three cases, deliberately distinct:
  //   audit row + carryover marker  → "gap"      (provably carried, read-only)
  //   audit row, no carryover marker → "qa_added" (provably a direct upload)
  //   NO audit row                  → leave NULL  (provenance unknowable — let
  //     the conservative null-handling UI treat it read-only rather than assert
  //     it deletable; matches the "no @default, null = unknown" decision).
  const gap: typeof files = [];
  const qaAdded: typeof files = [];
  const unknown: typeof files = [];
  for (const f of files) {
    if (!provByFile.has(f.id)) unknown.push(f);
    else if (isGapProvenance(provByFile.get(f.id) ?? null)) gap.push(f);
    else qaAdded.push(f);
  }

  console.log(
    `[backfill] EvidenceFiles: ${files.length}  →  gap: ${gap.length}, qa_added: ${qaAdded.length}, left null (no audit row): ${unknown.length}\n`,
  );
  console.log("[backfill] sample (first 10):");
  for (const f of files.slice(0, 10)) {
    const target = !provByFile.has(f.id)
      ? "null (skip)"
      : isGapProvenance(provByFile.get(f.id) ?? null)
        ? "gap"
        : "qa_added";
    console.log(`  - ${f.fileName}  →  ${target}  (was uploadSource=${f.uploadSource ?? "null"})`);
  }

  if (!APPLY) {
    console.log(
      `\n[backfill] DRY RUN — no rows written. Re-run with --apply to stamp ${gap.length} "gap" + ${qaAdded.length} "qa_added" (${unknown.length} left null).`,
    );
    return;
  }

  const [g, q] = await prisma.$transaction([
    prisma.evidenceFile.updateMany({
      where: { id: { in: gap.map((f) => f.id) } },
      data: { uploadSource: "gap" },
    }),
    prisma.evidenceFile.updateMany({
      where: { id: { in: qaAdded.map((f) => f.id) } },
      data: { uploadSource: "qa_added" },
    }),
  ]);
  console.log(`\n[backfill] APPLIED — gap: ${g.count}, qa_added: ${q.count}, left null: ${unknown.length}. Done.`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
