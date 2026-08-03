/**
 * One-off data remediation — populate Finding.assignedAt / assignedById from the
 * assignment's own audit trail (Item 18).
 *
 * assignFinding changed `owner` but recorded no actor and no timestamp, alone
 * among this model's lifecycle events (submittedAt/By, reworkAt/By both exist).
 * The write is fixed (findings.ts); this repairs the rows it already left NULL.
 *
 * SOURCE — the LATEST FINDING_ASSIGNED AuditLog row for the finding:
 *     assignedAt   = auditRow.createdAt   (written in the SAME tx as the owner change)
 *     assignedById = auditRow.userId      (the ASSIGNER — mirroring submittedById =
 *                                          the submitter; the assignee is `owner`)
 *
 * GUARD — newValue.assigneeId MUST equal the finding's current owner. A mismatch
 * means owner drifted through a path that emitted no FINDING_ASSIGNED (updateFinding
 * used to permit exactly that) — the coincidence Item 18 removes. Stamping
 * assignedAt there would date an assignment to somebody who is no longer the owner,
 * which is worse than saying nothing. Mismatch → NULL, reported.
 *
 * NULL STAYS NULL. Null means UNKNOWN, not "never assigned" — the column cannot
 * distinguish "never dispatched" from "dispatched before this column existed", and
 * neither can we. Specifically NOT inferred from:
 *   • status              — wrong 6 of 7 times in dev: In Progress is reached via
 *                           createCAPA (capas/lifecycle.ts:617) and via status edits,
 *                           neither of which assigns anyone.
 *   • owner !== createdById — wrong BOTH ways: false-negative when QA assigns back to
 *                           the raiser (permitted, findings.ts:436-438), false-positive
 *                           when never assigned. And createdById is itself NULL on the
 *                           seeded FND-BLR-* rows, so the comparison isn't even defined.
 *   • the uploadedBy/owner NAME — names are neither unique nor stable.
 * If it isn't in the trail, we don't know.
 *
 * NO PER-FINDING AUDIT ROW — deliberately, and this is the opposite call from
 * backfill-gap-doc-uploadedbyid. The test: is the mapping a COPY of a recorded fact,
 * or an ASSERTION manufactured from a join? There, the audit row had no documentId
 * (its recordId was the finding), so "row Y describes document Z" was a claim I made
 * from a three-way join, recorded nowhere else — it needed a trail to be reversible.
 * Here recordId IS the findingId: the link is STORED, not chosen, and both values are
 * verbatim copies of columns on a row already keyed to this exact record. A row saying
 * "we copied R.createdAt into the column" adds nothing recoverable — R stays findable
 * by recordId forever and the value is re-derivable at any time. The rule:
 *     destructive or inferred      → audit row
 *     copy of a stored, keyed fact → no audit row; THIS OUTPUT is the remediation record
 * (matching backfill-finding-status-casing and backfill-gap-doc-uploadsource, which
 * write none.) The one manufactured bit — "the latest row is the current assignment" —
 * is what the assigneeId === owner guard exists to check.
 *
 * Touches ONLY Finding.assignedAt/assignedById, and only where assignedAt is NULL —
 * an existing value is never overwritten. Tenant-scoped; deletedAt: null.
 *
 * ── READING THIS AGAINST PROD ──────────────────────────────────────────────
 * The resolved count is not the number to check. Read the NULL buckets:
 *   no audit row  — expected for anything assigned before FINDING_ASSIGNED existed,
 *                   and for everything never assigned. A large count is not a bug.
 *   MISMATCH      — owner drifted with no assignment event. Each one is a record whose
 *                   owner cannot be explained by the trail; worth investigating on its
 *                   own terms, and NOT resolvable by loosening this script.
 *   no userId     — an admin-session actor the FK couldn't resolve at assign time.
 *
 * DRY-RUN by default — pass --apply to write. Capture this output as the
 * remediation record.
 *
 *   npx tsx scripts/backfills/backfill-finding-assignment-provenance.ts          # dry run
 *   npx tsx scripts/backfills/backfill-finding-assignment-provenance.ts --apply  # write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

interface Resolved {
  id: string;
  reference: string | null;
  owner: string;
  assignedAt: Date;
  assignedById: string;
  sourceAuditLogId: string;
}
interface Skipped {
  id: string;
  reference: string | null;
  status: string;
  note: string;
}

function parseAssigneeId(v: string | null): string | undefined {
  if (!v) return undefined;
  try {
    return (JSON.parse(v) as { assigneeId?: string }).assigneeId;
  } catch {
    return undefined;
  }
}

async function main() {
  const findings = await prisma.finding.findMany({
    where: { deletedAt: null, assignedAt: null },
    select: { id: true, reference: true, status: true, owner: true, tenantId: true },
    orderBy: { reference: "asc" },
  });

  const alreadySet = await prisma.finding.count({ where: { deletedAt: null, assignedAt: { not: null } } });

  const resolved: Resolved[] = [];
  const skipped: Skipped[] = [];

  for (const f of findings) {
    // Newest first — the current assignment. Tenant-scoped alongside recordId.
    const rows = await prisma.auditLog.findMany({
      where: { action: "FINDING_ASSIGNED", recordId: f.id, tenantId: f.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, createdAt: true, newValue: true },
    });

    if (rows.length === 0) {
      skipped.push({ id: f.id, reference: f.reference, status: f.status, note: "no FINDING_ASSIGNED row — never assigned, or assigned before the audit existed; unknown either way" });
      continue;
    }
    const latest = rows[0];
    const assigneeId = parseAssigneeId(latest.newValue);
    if (assigneeId !== f.owner) {
      skipped.push({
        id: f.id,
        reference: f.reference,
        status: f.status,
        note: `MISMATCH — latest FINDING_ASSIGNED names assignee ${assigneeId ?? "(unparseable)"} but owner is ${f.owner}; owner drifted with no assignment event`,
      });
      continue;
    }
    if (!latest.userId) {
      skipped.push({ id: f.id, reference: f.reference, status: f.status, note: `matched audit row ${latest.id} carries userId: null — the trail could not identify the assigner; NOT resolved by name` });
      continue;
    }
    resolved.push({
      id: f.id,
      reference: f.reference,
      owner: f.owner,
      assignedAt: latest.createdAt,
      assignedById: latest.userId,
      sourceAuditLogId: latest.id,
    });
  }

  console.log(`[backfill] Findings with assignedAt NULL:   ${findings.length}`);
  console.log(`[backfill] Resolved from the audit trail:   ${resolved.length}`);
  console.log(`[backfill] Left NULL (reported below):      ${skipped.length}`);
  console.log(`[backfill]   (already populated, untouched: ${alreadySet})\n`);

  if (resolved.length) {
    console.log("[backfill] WILL SET — assignedAt/assignedById from FINDING_ASSIGNED (assigneeId === owner verified):");
    for (const r of resolved) {
      console.log(`  - ${r.reference ?? r.id}`);
      console.log(`      assignedAt   = ${r.assignedAt.toISOString()}`);
      console.log(`      assignedById = ${r.assignedById}   (assigner)   from audit ${r.sourceAuditLogId}`);
    }
  }

  if (skipped.length) {
    const mismatches = skipped.filter((s) => s.note.startsWith("MISMATCH"));
    console.log("\n[backfill] LEFT NULL — the trail does not answer it:");
    for (const s of skipped) {
      console.log(`  - ${(s.reference ?? s.id).padEnd(18)} [${s.status}]`);
      console.log(`      why: ${s.note}`);
    }
    if (mismatches.length) {
      console.log(`\n[backfill] !! ${mismatches.length} MISMATCH(es) above — owner changed with no assignment event. Investigate; do not resolve by loosening this script.`);
    }
  }

  if (resolved.length === 0) {
    console.log("\n[backfill] Nothing to set.");
    return;
  }

  if (!APPLY) {
    console.log(`\n[backfill] DRY RUN — no rows written. Re-run with --apply to set ${resolved.length} assignment record(s).`);
    return;
  }

  let written = 0;
  let raced = 0;
  for (const r of resolved) {
    // Re-assert assignedAt: null (optimistic lock) — a real assignment since the
    // read wins over the backfill.
    const { count } = await prisma.finding.updateMany({
      where: { id: r.id, assignedAt: null, deletedAt: null, owner: r.owner },
      data: { assignedAt: r.assignedAt, assignedById: r.assignedById },
    });
    if (count > 0) written += 1;
    else {
      raced += 1;
      console.log(`  ! ${r.reference ?? r.id} changed since the read — left alone.`);
    }
  }

  console.log(`\n[backfill] APPLIED — set ${written} assignment record(s).`);
  if (raced) console.log(`[backfill] Skipped ${raced} (changed since the read).`);
  console.log("[backfill] Done.");
}

main()
  .catch((err) => { console.error("[backfill] failed:", err); process.exitCode = 1; })
  .finally(() => void prisma.$disconnect());
