/**
 * One-off data remediation — null the Finding.evidenceLink values that the
 * upload-conflation bug wrote.
 *
 * uploadFindingEvidence used to stamp `evidenceLink` with the uploaded file's
 * sanitized name inside the upload transaction (src/actions/findings.ts:806-809,
 * now removed). Evidence Link and Evidence Docs are two SEPARATE fields: the
 * link is a free-text reference the author supplies, the docs are Document rows.
 * The bug made an uploaded doc's FILENAME render as the finding's Evidence Link,
 * and let each new upload silently overwrite whatever the author had entered.
 * These values were never author-entered — they are bug output, so leaving them
 * preserves a fabrication under an author-attributed field.
 *
 * MATCH RULE — narrow on purpose. A value is cleared ONLY when it EXACTLY equals
 * the fileName of a live Document on that SAME finding. That equality is the
 * bug's signature: it wrote `sanitized`, which is verbatim what Document.fileName
 * stores (the same identity removeFindingEvidence's repoint used). Anything that
 * does NOT match is LEFT ALONE and reported — it may be a real author-entered
 * reference that merely looks file-ish. No heuristics, no fuzzy matching: we do
 * not guess at authorship.
 *
 * Writes ONE audit row per cleared finding (FINDING_EVIDENCE_LINK_CLEARED), so
 * the repair is attributable rather than silent. Finding + audit row commit in
 * the SAME transaction per finding: no cleared value without its trail.
 *
 * Touches ONLY Finding.evidenceLink. No Document, SignedRecord, or CAPA row.
 * Tenant-scoped (audit rows carry the finding's own tenantId); deletedAt: null.
 *
 * DRY-RUN by default — pass --apply to write. Capture this output as the
 * remediation record.
 *
 *   npx tsx scripts/backfills/backfill-finding-evidencelink-conflation.ts          # dry run
 *   npx tsx scripts/backfills/backfill-finding-evidencelink-conflation.ts --apply  # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const AUDIT_MODULE = "Gap Assessment";
const AUDIT_ACTION = "FINDING_EVIDENCE_LINK_CLEARED";
const CLEAR_REASON =
  "filename written by the upload conflation bug (removed findings.ts:806-809); field was never author-entered";
/** No session behind a backfill; AuditLog.userName is non-nullable, so name the
 *  script itself rather than impersonate a person. userId/userRole stay null. */
const ACTOR_NAME = "System · backfill-finding-evidencelink-conflation";

interface Matched {
  id: string;
  reference: string | null;
  tenantId: string;
  clearedValue: string;
  matchedDocumentId: string;
}
interface Unmatched {
  id: string;
  reference: string | null;
  tenantId: string;
  value: string;
  /** Why it didn't match — the diagnostic that makes this row actionable. */
  note: string;
}

async function main() {
  // Candidates: live findings carrying a non-empty evidenceLink.
  const findings = await prisma.finding.findMany({
    where: { deletedAt: null, evidenceLink: { not: null } },
    select: { id: true, reference: true, tenantId: true, evidenceLink: true },
    orderBy: { reference: "asc" },
  });
  const candidates = findings.filter((f) => (f.evidenceLink ?? "").trim().length > 0);

  // All Gap Assessment docs for those findings, in ONE query. Soft-deleted rows
  // are pulled too — NOT as clear targets, but so an unmatched value can say
  // whether it points at a doc that was since removed (still bug output, but the
  // live-match rule deliberately won't clear it without a decision).
  const docs = candidates.length
    ? await prisma.document.findMany({
        where: {
          linkedModule: "Gap Assessment",
          linkedRecordId: { in: candidates.map((f) => f.id) },
        },
        select: { id: true, fileName: true, linkedRecordId: true, deletedAt: true },
      })
    : [];
  const docsByFinding = new Map<string, typeof docs>();
  for (const d of docs) {
    if (!d.linkedRecordId) continue;
    const arr = docsByFinding.get(d.linkedRecordId) ?? [];
    arr.push(d);
    docsByFinding.set(d.linkedRecordId, arr);
  }

  const matched: Matched[] = [];
  const unmatched: Unmatched[] = [];

  for (const f of candidates) {
    const value = (f.evidenceLink ?? "").trim();
    const own = docsByFinding.get(f.id) ?? [];
    const live = own.find((d) => d.deletedAt === null && d.fileName === value);
    if (live) {
      matched.push({ id: f.id, reference: f.reference, tenantId: f.tenantId, clearedValue: value, matchedDocumentId: live.id });
      continue;
    }
    const removed = own.find((d) => d.deletedAt !== null && d.fileName === value);
    unmatched.push({
      id: f.id,
      reference: f.reference,
      tenantId: f.tenantId,
      value,
      note: removed
        ? `matches a SOFT-DELETED doc (${removed.id}) — bug output whose doc is gone; not cleared (live-match rule)`
        : own.length === 0
          ? "no docs on this finding — likely a genuine author-entered reference"
          : `no filename match among ${own.length} doc(s) on this finding — likely author-entered`,
    });
  }

  console.log(`[backfill] Findings with a non-empty evidenceLink: ${candidates.length}`);
  console.log(`[backfill] Will clear (exact live filename match):  ${matched.length}`);
  console.log(`[backfill] Left alone (no match — reported below):  ${unmatched.length}\n`);

  if (matched.length) {
    console.log("[backfill] WILL CLEAR — evidenceLink === a live Document.fileName on the same finding:");
    for (const m of matched) {
      console.log(`  - ${m.reference ?? m.id}  (tenant ${m.tenantId})`);
      console.log(`      value : ${JSON.stringify(m.clearedValue)}`);
      console.log(`      doc   : ${m.matchedDocumentId}`);
    }
  }

  if (unmatched.length) {
    console.log("\n[backfill] LEFT ALONE — no exact live filename match (review these):");
    for (const u of unmatched) {
      console.log(`  - ${u.reference ?? u.id}  (tenant ${u.tenantId})`);
      console.log(`      value : ${JSON.stringify(u.value)}`);
      console.log(`      why   : ${u.note}`);
    }
  }

  if (matched.length === 0) {
    console.log("\n[backfill] Nothing to clear.");
    return;
  }

  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to clear ${matched.length} evidenceLink value(s) + write ${matched.length} audit row(s).`);
    return;
  }

  let cleared = 0;
  let skipped = 0;
  for (const m of matched) {
    // Per-finding tx so the audit row can never separate from the clear. The
    // where re-asserts the exact value read (optimistic lock): if an author has
    // since typed a real link, count === 0 and we leave it — and write no audit
    // row claiming otherwise.
    const ok = await prisma.$transaction(async (tx) => {
      const { count } = await tx.finding.updateMany({
        where: { id: m.id, evidenceLink: m.clearedValue, deletedAt: null },
        data: { evidenceLink: null },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          tenantId: m.tenantId,
          userId: null,
          userName: ACTOR_NAME,
          userRole: null,
          module: AUDIT_MODULE,
          action: AUDIT_ACTION,
          recordId: m.id,
          recordTitle: m.reference ?? undefined,
          oldValue: m.clearedValue,
          newValue: JSON.stringify({
            clearedValue: m.clearedValue,
            matchedDocumentId: m.matchedDocumentId,
            reason: CLEAR_REASON,
          }),
        },
      });
      return true;
    });
    if (ok) cleared += 1;
    else {
      skipped += 1;
      console.log(`  ! ${m.reference ?? m.id} changed since the read — left alone, no audit row.`);
    }
  }

  console.log(`\n[backfill] APPLIED — cleared ${cleared} evidenceLink value(s), wrote ${cleared} audit row(s).`);
  if (skipped) console.log(`[backfill] Skipped ${skipped} (value changed since the read).`);
  console.log("[backfill] Done.");
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
