/**
 * One-off — stamp uploadSource on existing Gap Assessment documents.
 *
 * Best-guess: a doc WITH a category → "work" (only the worker upload path sets a
 * category); a doc with NO category → "create". Scope: linkedModule="Gap
 * Assessment", deletedAt: null. Touches ONLY Document.uploadSource.
 *
 * The schema default already makes every existing row "create" once the
 * migration applies, so --apply mainly PROMOTES the categorized docs to "work".
 *
 * DRY-RUN by default — pass --apply to write. REQUIRES the add_document_upload_source
 * migration to have been applied first (it reads the new column).
 *
 *   npx tsx scripts/backfills/backfill-gap-doc-uploadsource.ts           # dry run
 *   npx tsx scripts/backfills/backfill-gap-doc-uploadsource.ts --apply   # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const docs = await prisma.document.findMany({
    where: { linkedModule: "Gap Assessment", deletedAt: null },
    select: { id: true, fileName: true, category: true, uploadSource: true },
  });

  const toWork = docs.filter((d) => d.category != null);
  const toCreate = docs.filter((d) => d.category == null);

  console.log(`[backfill] Gap docs: ${docs.length}  →  work: ${toWork.length}, create: ${toCreate.length}\n`);
  console.log("[backfill] sample (first 10):");
  for (const d of docs.slice(0, 10)) {
    const target = d.category != null ? "work" : "create";
    console.log(`  - ${d.fileName}  [category=${d.category ?? "—"}]  →  ${target}  (was uploadSource=${d.uploadSource ?? "null"})`);
  }

  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to stamp ${toWork.length} "work" + ${toCreate.length} "create".`);
    return;
  }

  const [w, c] = await prisma.$transaction([
    prisma.document.updateMany({
      where: { linkedModule: "Gap Assessment", deletedAt: null, category: { not: null } },
      data: { uploadSource: "work" },
    }),
    prisma.document.updateMany({
      where: { linkedModule: "Gap Assessment", deletedAt: null, category: null },
      data: { uploadSource: "create" },
    }),
  ]);
  console.log(`\n[backfill] APPLIED — work: ${w.count}, create: ${c.count}. Done.`);
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
