/**
 * One-off data remediation — populate Document.uploadedById on Gap Assessment
 * evidence documents from the upload's own audit trail.
 *
 * uploadFindingEvidence wrote `uploadedBy` (a display name) but never
 * `uploadedById` (the authoritative User FK), alone among every Document writer
 * — evidence.ts, documents.ts, risks.ts, systems.ts, fda483.ts all set it. The
 * write is fixed (findings.ts); this repairs the rows it already left NULL.
 *
 * SOURCE — the FINDING_EVIDENCE_UPLOADED AuditLog row's `userId`. That is
 * provenance captured AT CREATION, in the same transaction as the Document, and
 * is the only record of who actually performed the upload.
 *
 * NOT resolved by name. `uploadedBy` holds a display name, and names are neither
 * unique nor stable — resolving through one would re-derive the authoritative
 * field from the denormalised string this change exists to stop trusting. This
 * DB proves the point: the two audit rows carrying `userId: null` both read
 * userName "QC App", a name that resolves to a real User elsewhere. Tempting,
 * and wrong: the trail says the system could not identify a user at upload time.
 * Those documents stay NULL. Null means UNKNOWN, not unattributed.
 *
 * MATCH RULE — the audit row does NOT store a documentId (its recordId is the
 * FINDING), so the document→audit link is INFERRED from three values written in
 * that same transaction:
 *     audit.recordId        === document.linkedRecordId   (same finding)
 *     newValue.fileName     === document.fileName
 *     newValue.contentHash  === document.sha256
 * Exactly ONE matching row is required. Zero matches, several matches, or a
 * matched row with no userId → left NULL and reported. No fuzzy matching, no
 * nearest-timestamp tiebreak: an ambiguous trail is not a trail.
 *
 * VALIDATION — Document.uploadedById is a bare String column with NO foreign
 * key, so a bogus id would be accepted silently and rot. Every resolved id is
 * checked against a real User in the SAME tenant before it is written.
 *
 * Writes ONE audit row per repaired document (DOCUMENT_UPLOADER_ID_BACKFILLED).
 * That is not ceremony: the document→audit mapping above is an INFERENCE this
 * script makes, recorded nowhere else. The source FINDING_EVIDENCE_UPLOADED row
 * says "someone uploaded a file named X to finding Y" — it does not say "this
 * document's uploader was set to U, on the strength of that row". If the join
 * rule is ever found wrong, these rows are the only way to find and reverse what
 * it touched. Document + audit row commit in the SAME transaction.
 *
 * Touches ONLY Document.uploadedById, and only where it is currently NULL — an
 * existing value is never overwritten. Tenant-scoped; deletedAt: null.
 *
 * ── READING THIS AGAINST PROD ──────────────────────────────────────────────
 * The resolved count is NOT the number to check. Correctness rests entirely on
 * the join finding EXACTLY ONE audit row per document, and the two buckets that
 * report its failure are the ones to read:
 *
 *   MULTIPLE rows  — a genuine collision: the same file, same bytes, uploaded to
 *                    the SAME finding more than once. The dry run prints each
 *                    one with the distinct userIds involved. If they all name the
 *                    same uploader the answer is knowable but this script will
 *                    still decline it — deliberately, because widening the rule
 *                    to "all matches agree" is a judgement call for a human, not
 *                    a default. If they disagree, the document's uploader is
 *                    genuinely undecidable from the trail.
 *   ZERO rows      — the document has no upload audit row at all: written before
 *                    the audit existed, by a path that doesn't log, or with a
 *                    fileName/sha256 that has since diverged from what was
 *                    logged. Each is a different problem and none of them is
 *                    "resolve it anyway".
 *
 * Dev ran 19/19 clean with both buckets empty, which says nothing about prod:
 * more documents and repeated uploads of the same file make collisions strictly
 * likelier. Both buckets stay NULL by design — a large one is a signal to stop
 * and look, never to loosen the rule. If MULTIPLE dominates, the fix is a real
 * document→audit link, not a better guess.
 *
 * DRY-RUN by default — pass --apply to write. Capture this output as the
 * remediation record.
 *
 *   npx tsx scripts/backfills/backfill-gap-doc-uploadedbyid.ts          # dry run
 *   npx tsx scripts/backfills/backfill-gap-doc-uploadedbyid.ts --apply  # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const AUDIT_MODULE = "Gap Assessment";
const AUDIT_ACTION = "DOCUMENT_UPLOADER_ID_BACKFILLED";
const MATCHED_ON = "FINDING_EVIDENCE_UPLOADED: recordId=linkedRecordId + newValue.fileName + newValue.contentHash=sha256";
const REASON =
  "uploadFindingEvidence wrote uploadedBy (name) but never uploadedById; resolved from the upload's own audit row, never from the name string";
/** No session behind a backfill; AuditLog.userName is non-nullable, so name the
 *  script rather than impersonate a person. userId/userRole stay null. */
const ACTOR_NAME = "System · backfill-gap-doc-uploadedbyid";

interface Resolved {
  docId: string;
  fileName: string;
  tenantId: string;
  findingId: string;
  userId: string;
  userName: string;
  sourceAuditLogId: string;
}
interface Skipped {
  docId: string;
  fileName: string;
  note: string;
}

function parseNewValue(v: string | null): { fileName?: string; contentHash?: string } {
  if (!v) return {};
  try {
    return JSON.parse(v) as { fileName?: string; contentHash?: string };
  } catch {
    return {};
  }
}

async function main() {
  const docs = await prisma.document.findMany({
    where: { linkedModule: "Gap Assessment", deletedAt: null, uploadedById: null },
    select: { id: true, fileName: true, sha256: true, linkedRecordId: true, tenantId: true, uploadedBy: true },
    orderBy: { createdAt: "asc" },
  });

  const softDeleted = await prisma.document.count({
    where: { linkedModule: "Gap Assessment", deletedAt: { not: null }, uploadedById: null },
  });
  const alreadySet = await prisma.document.count({
    where: { linkedModule: "Gap Assessment", deletedAt: null, uploadedById: { not: null } },
  });

  const auditRows = await prisma.auditLog.findMany({
    where: { action: "FINDING_EVIDENCE_UPLOADED" },
    select: { id: true, userId: true, userName: true, recordId: true, newValue: true, tenantId: true },
  });

  // Cache User lookups — the column has no FK, so an unverified id would rot.
  const userCache = new Map<string, { id: string; name: string; tenantId: string } | null>();
  async function findUser(id: string) {
    if (!userCache.has(id)) {
      userCache.set(id, await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, tenantId: true } }));
    }
    return userCache.get(id)!;
  }

  const resolved: Resolved[] = [];
  const skipped: Skipped[] = [];

  for (const d of docs) {
    if (!d.linkedRecordId || !d.sha256) {
      skipped.push({ docId: d.id, fileName: d.fileName, note: !d.sha256 ? "document has no sha256 — cannot match the trail" : "document has no linkedRecordId" });
      continue;
    }
    const matches = auditRows.filter((r) => {
      if (r.tenantId !== d.tenantId || r.recordId !== d.linkedRecordId) return false;
      const nv = parseNewValue(r.newValue);
      return nv.fileName === d.fileName && nv.contentHash === d.sha256;
    });

    if (matches.length === 0) {
      skipped.push({ docId: d.id, fileName: d.fileName, note: "no FINDING_EVIDENCE_UPLOADED row matches — not in the trail, so unknown" });
      continue;
    }
    if (matches.length > 1) {
      const ids = [...new Set(matches.map((m) => m.userId))];
      skipped.push({
        docId: d.id,
        fileName: d.fileName,
        note: `${matches.length} audit rows match this document (userIds: ${JSON.stringify(ids)}) — ambiguous, not resolved`,
      });
      continue;
    }
    const row = matches[0];
    if (!row.userId) {
      skipped.push({
        docId: d.id,
        fileName: d.fileName,
        note: `matched audit row ${row.id} carries userId: null (userName ${JSON.stringify(row.userName)}) — the trail could not identify a user at upload; NOT resolved by name`,
      });
      continue;
    }
    const user = await findUser(row.userId);
    if (!user) {
      skipped.push({ docId: d.id, fileName: d.fileName, note: `audit userId ${row.userId} has no User row — refusing to write an unresolvable id` });
      continue;
    }
    if (user.tenantId !== d.tenantId) {
      skipped.push({ docId: d.id, fileName: d.fileName, note: `audit userId ${row.userId} belongs to another tenant — refusing to cross the boundary` });
      continue;
    }
    resolved.push({
      docId: d.id,
      fileName: d.fileName,
      tenantId: d.tenantId,
      findingId: d.linkedRecordId,
      userId: row.userId,
      userName: user.name,
      sourceAuditLogId: row.id,
    });
  }

  console.log(`[backfill] Gap docs with uploadedById NULL:      ${docs.length}`);
  console.log(`[backfill] Resolved from the audit trail:        ${resolved.length}`);
  console.log(`[backfill] Left NULL (reported below):           ${skipped.length}`);
  console.log(`[backfill]   (already populated, untouched: ${alreadySet}; soft-deleted, out of scope: ${softDeleted})\n`);

  if (resolved.length) {
    console.log("[backfill] WILL SET — uploadedById resolved from FINDING_EVIDENCE_UPLOADED.userId:");
    const byUser = new Map<string, number>();
    for (const r of resolved) {
      byUser.set(r.userName, (byUser.get(r.userName) ?? 0) + 1);
      console.log(`  - ${r.fileName.slice(0, 42)}`);
      console.log(`      -> ${r.userId}  (${r.userName})   from audit ${r.sourceAuditLogId}`);
    }
    console.log("\n[backfill] Resolved per uploader:");
    for (const [name, n] of byUser) console.log(`    ${name}: ${n} doc(s)`);
  }

  if (skipped.length) {
    console.log("\n[backfill] LEFT NULL — the trail does not answer it (review these):");
    for (const s of skipped) {
      console.log(`  - ${s.fileName.slice(0, 42)}`);
      console.log(`      why: ${s.note}`);
    }
  }

  if (resolved.length === 0) {
    console.log("\n[backfill] Nothing to set.");
    return;
  }

  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to set ${resolved.length} uploadedById value(s) + write ${resolved.length} audit row(s).`);
    return;
  }

  let written = 0;
  let raced = 0;
  for (const r of resolved) {
    // Per-doc tx so the audit row can never separate from the write. The where
    // re-asserts uploadedById: null (optimistic lock) — if it has since been set,
    // leave it and write no audit row claiming we set it.
    const ok = await prisma.$transaction(async (tx) => {
      const { count } = await tx.document.updateMany({
        where: { id: r.docId, uploadedById: null, deletedAt: null },
        data: { uploadedById: r.userId },
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
          recordId: r.docId,
          recordTitle: r.fileName.slice(0, 80),
          oldValue: null,
          newValue: JSON.stringify({
            uploadedById: r.userId,
            resolvedUserName: r.userName,
            findingId: r.findingId,
            sourceAuditLogId: r.sourceAuditLogId,
            matchedOn: MATCHED_ON,
            reason: REASON,
          }),
        },
      });
      return true;
    });
    if (ok) written += 1;
    else {
      raced += 1;
      console.log(`  ! ${r.fileName.slice(0, 42)} already had a value — left alone, no audit row.`);
    }
  }

  console.log(`\n[backfill] APPLIED — set ${written} uploadedById value(s), wrote ${written} audit row(s).`);
  if (raced) console.log(`[backfill] Skipped ${raced} (value set since the read).`);
  console.log("[backfill] Done.");
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
