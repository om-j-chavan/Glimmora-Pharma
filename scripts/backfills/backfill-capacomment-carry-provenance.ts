/**
 * One-off data remediation — set CAPAComment.carriedFromFindingId / -Ref on the
 * gap-work-notes comments the carry wrote BEFORE those columns existed.
 *
 * createCAPA carries a finding's completionNotes onto the CAPA as one CAPAComment.
 * The old carry MARKED that comment by PREFIXING the body with
 * "(work notes from finding FND-…) <note>". The new carry stores the provenance in
 * columns and leaves the body as the note. Pre-migration rows still carry the
 * prefix and NULL columns, so getCAPACarriedNotes (keyed on carriedFromFindingId)
 * does not surface them — written, then invisible everywhere. This repairs those.
 *
 * SOURCE — the row's OWN body prefix. There is no better source: the pre-column
 * carry recorded provenance nowhere else. But a parsed prefix is an INFERENCE, so
 * the bar to act on it is high:
 *
 *   - The body must MATCH the exact carry prefix. Anything that merely looks
 *     similar is left alone.
 *   - The extracted ref must RESOLVE to a real Finding in the SAME tenant as the
 *     comment. A ref that resolves to nothing, or to another tenant's finding, is
 *     not a fact we will assert — set nothing, report it.
 *   - The body AFTER stripping the prefix must be non-empty. A "note" that was only
 *     a prefix was never a note; leave it untouched.
 *
 * Any row failing any of these stays NULL and is reported. Null means "we could not
 * establish provenance", which is the honest state — better than a guessed link.
 *
 * WRITES AN AUDIT ROW per repaired comment (CAPACOMMENT_CARRY_PROVENANCE_BACKFILLED)
 * — and that is the RIGHT call, by the test this project has been using:
 *   copy of a stored, keyed fact  -> no audit row (the value is re-derivable)
 *   destructive, or an INFERENCE  -> audit row (the assertion lives nowhere else)
 * This is the second shape. "This comment came from that finding" is a claim I am
 * MANUFACTURING from a string match on the body — the uploadedById situation, not
 * the assignedAt one. If the parse is ever found wrong, the audit row (carrying the
 * matched prefix and the resolved id) is the only way to find and reverse what it
 * touched. Comment + audit row commit in the SAME transaction.
 *
 * Also REWRITES the body to drop the prefix, so the surface shows the note the
 * worker wrote — matching every row the new carry writes. oldValue preserves the
 * original prefixed body, so nothing is lost.
 *
 * Touches ONLY rows where carriedFromFindingId IS NULL — never overwrites a value.
 * Tenant-scoped; deletedAt: null.
 *
 * DRY-RUN by default — pass --apply to write.
 *
 *   npx tsx scripts/backfills/backfill-capacomment-carry-provenance.ts          # dry run
 *   npx tsx scripts/backfills/backfill-capacomment-carry-provenance.ts --apply  # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const AUDIT_MODULE = "CAPA";
const AUDIT_ACTION = "CAPACOMMENT_CARRY_PROVENANCE_BACKFILLED";
const REASON =
  "provenance parsed from the legacy carry prefix '(work notes from finding <ref>)'; the pre-column carry stored it nowhere else";
const ACTOR_NAME = "System · backfill-capacomment-carry-provenance";

// The exact prefix the old carry wrote: "(work notes from finding <ref>) <body>".
const PREFIX_RE = /^\(work notes from finding ([^)]+)\) ([\s\S]*)$/;

interface Resolved {
  id: string;
  tenantId: string;
  capaId: string;
  ref: string;
  findingId: string;
  oldBody: string;
  newBody: string;
}
interface Skipped {
  id: string;
  note: string;
}

async function main() {
  const rows = await prisma.cAPAComment.findMany({
    where: { deletedAt: null, carriedFromFindingId: null, body: { startsWith: "(work notes from finding " } },
    select: { id: true, tenantId: true, capaId: true, body: true, authorName: true },
    orderBy: { createdAt: "asc" },
  });

  const alreadyStamped = await prisma.cAPAComment.count({
    where: { deletedAt: null, carriedFromFindingId: { not: null } },
  });

  const resolved: Resolved[] = [];
  const skipped: Skipped[] = [];

  for (const r of rows) {
    const m = r.body.match(PREFIX_RE);
    if (!m) {
      skipped.push({ id: r.id, note: "body does not match the exact carry prefix — not touched" });
      continue;
    }
    const ref = m[1].trim();
    const newBody = m[2];
    if (newBody.trim().length === 0) {
      skipped.push({ id: r.id, note: `stripping the prefix leaves an EMPTY body (ref ${ref}) — a prefix-only "note" is not a note; not touched` });
      continue;
    }
    // Resolve the ref to a real Finding in the SAME tenant as the comment.
    const finding = await prisma.finding.findFirst({
      where: { reference: ref, tenantId: r.tenantId },
      select: { id: true },
    });
    if (!finding) {
      skipped.push({ id: r.id, note: `parsed ref ${ref} resolves to no finding in tenant ${r.tenantId} — provenance not asserted` });
      continue;
    }
    resolved.push({ id: r.id, tenantId: r.tenantId, capaId: r.capaId, ref, findingId: finding.id, oldBody: r.body, newBody });
  }

  console.log(`[backfill] Candidate comments (prefix + marker NULL): ${rows.length}`);
  console.log(`[backfill] Will repair (prefix parses + ref resolves + body non-empty): ${resolved.length}`);
  console.log(`[backfill] Left NULL (reported below): ${skipped.length}`);
  console.log(`[backfill]   (already stamped, untouched: ${alreadyStamped})\n`);

  if (resolved.length) {
    console.log("[backfill] WILL SET carriedFromFindingId/-Ref + strip the prefix:");
    for (const r of resolved) {
      console.log(`  - ${r.id}  (tenant ${r.tenantId}, capa ${r.capaId})`);
      console.log(`      ref          : ${r.ref}  ->  finding ${r.findingId}`);
      console.log(`      body old     : ${JSON.stringify(r.oldBody.slice(0, 70))}`);
      console.log(`      body new     : ${JSON.stringify(r.newBody.slice(0, 70))}`);
    }
  }
  if (skipped.length) {
    console.log("\n[backfill] LEFT NULL — provenance not establishable:");
    for (const s of skipped) console.log(`  - ${s.id}\n      why: ${s.note}`);
  }

  if (resolved.length === 0) {
    console.log("\n[backfill] Nothing to repair.");
    return;
  }
  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to repair ${resolved.length} + write ${resolved.length} audit row(s).`);
    return;
  }

  let written = 0;
  let raced = 0;
  for (const r of resolved) {
    const ok = await prisma.$transaction(async (tx) => {
      // Re-assert carriedFromFindingId: null (optimistic lock) — a concurrent real
      // carry-repair since the read wins over the backfill.
      const { count } = await tx.cAPAComment.updateMany({
        where: { id: r.id, carriedFromFindingId: null, deletedAt: null },
        data: { carriedFromFindingId: r.findingId, carriedFromFindingRef: r.ref, body: r.newBody },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          tenantId: r.tenantId,
          userId: null,
          userName: ACTOR_NAME,
          userRole: null,
          module: AUDIT_MODULE,
          action: AUDIT_ACTION,
          recordId: r.capaId,
          recordTitle: r.id,
          oldValue: r.oldBody,
          newValue: JSON.stringify({
            commentId: r.id,
            carriedFromFindingId: r.findingId,
            carriedFromFindingRef: r.ref,
            matchedOn: "body prefix '(work notes from finding <ref>)' + ref resolved to a same-tenant Finding",
            reason: REASON,
          }),
        },
      });
      return true;
    });
    if (ok) written += 1;
    else { raced += 1; console.log(`  ! ${r.id} changed since the read — left alone, no audit row.`); }
  }

  console.log(`\n[backfill] APPLIED — repaired ${written} comment(s), wrote ${written} audit row(s).`);
  if (raced) console.log(`[backfill] Skipped ${raced} (changed since the read).`);
  console.log("[backfill] Done.");
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
