/**
 * End-to-end probe of the Evidence data model + read query against the real
 * dev DB. Bypasses server actions (which require an authenticated request
 * context) by talking to Prisma directly. This proves:
 *   - Schema accepts the 7 categories
 *   - Unique (capaId, category) constraint fires
 *   - EvidenceNoteVersion snapshot inserts cleanly
 *   - EvidenceFile soft-delete fields work
 *   - getEvidenceForCAPA returns the expected shape with files + counts
 * Cleans up everything it creates.
 */
import { PrismaClient } from "@prisma/client";
import { getEvidenceForCAPA, EVIDENCE_CATEGORIES } from "../src/lib/queries/evidence";

const prisma = new PrismaClient();

async function main() {
  // Find any tenant + the customer_admin from the dev DB.
  const tenant = await prisma.tenant.findFirst({ where: { role: "customer_admin" } });
  if (!tenant) throw new Error("No customer_admin tenant in DB — re-seed first");
  console.log("Using tenant:", tenant.id, tenant.email);

  // Create a throwaway CAPA we'll delete at the end.
  const capa = await prisma.cAPA.create({
    data: {
      tenantId: tenant.id,
      source: "Internal Audit",
      description: "PROBE — evidence collection schema + read",
      risk: "Low",
      owner: "probe",
      status: "Open",
      createdBy: "probe-script",
    },
  });
  console.log("Created probe CAPA:", capa.id);

  try {
    // 1. Initialize the 7 evidence categories.
    await prisma.evidenceItem.createMany({
      data: EVIDENCE_CATEGORIES.map((category) => ({
        capaId: capa.id,
        category,
        status: "PENDING",
        createdBy: "probe-script",
      })),
    });
    const itemCount = await prisma.evidenceItem.count({ where: { capaId: capa.id } });
    console.log(`✓ Created ${itemCount} EvidenceItem rows (expected 7)`);
    if (itemCount !== 7) throw new Error("Expected 7 items");

    // 2. Verify unique (capaId, category) constraint fires on duplicate.
    let dupBlocked = false;
    try {
      await prisma.evidenceItem.create({
        data: { capaId: capa.id, category: "BATCH_RECORDS", status: "PENDING", createdBy: "probe" },
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unique constraint")) dupBlocked = true;
    }
    console.log(`✓ Duplicate (capaId, BATCH_RECORDS) blocked by unique index: ${dupBlocked}`);
    if (!dupBlocked) throw new Error("Unique constraint did not fire");

    // 3. Status update + note version snapshot.
    const batchItem = await prisma.evidenceItem.findFirst({
      where: { capaId: capa.id, category: "BATCH_RECORDS" },
    });
    if (!batchItem) throw new Error("BATCH_RECORDS item missing");

    // First update — old notes was null, no version row should be inserted.
    await prisma.evidenceItem.update({
      where: { id: batchItem.id },
      data: { status: "IN_PROGRESS", notes: "Pulled batch records 2024-Q3" },
    });

    // Second update — old notes is now non-null; a version row should snapshot it.
    await prisma.evidenceNoteVersion.create({
      data: {
        evidenceItemId: batchItem.id,
        notes: "Pulled batch records 2024-Q3",
        statusAtTime: "IN_PROGRESS",
        createdBy: "probe-script",
      },
    });
    await prisma.evidenceItem.update({
      where: { id: batchItem.id },
      data: { status: "COMPLETE", notes: "Pulled batch records 2024-Q1-Q4 (corrected range)" },
    });
    const versions = await prisma.evidenceNoteVersion.findMany({
      where: { evidenceItemId: batchItem.id },
    });
    console.log(`✓ EvidenceNoteVersion snapshot created (${versions.length} version[s])`);
    if (versions.length !== 1) throw new Error("Expected 1 note version");

    // 4. File row + soft delete.
    const file = await prisma.evidenceFile.create({
      data: {
        evidenceItemId: batchItem.id,
        fileName: "batch-2024-q3.pdf",
        originalFileName: "batch-2024-q3.pdf",
        fileSize: 12345,
        fileType: "application/pdf",
        fileExtension: ".pdf",
        fileUrl: "evidence/probe/probe/abc123-batch-2024-q3.pdf",
        contentHashSha256: "abc123def456".padEnd(64, "0"),
        retainUntil: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
        uploadedBy: "probe-script",
      },
    });
    console.log(`✓ EvidenceFile created with SHA prefix ${file.contentHashSha256.slice(0, 8)}`);

    // Soft delete (we bypass the retention check at this layer — the action
    // enforces it; the schema doesn't).
    await prisma.evidenceFile.update({
      where: { id: file.id },
      data: {
        deletedAt: new Date(),
        deletedBy: "probe-script",
        deletionReason: "Probe cleanup — wrong batch number",
      },
    });
    const deletedFile = await prisma.evidenceFile.findUnique({ where: { id: file.id } });
    console.log(`✓ Soft-delete metadata preserved (deletedAt=${deletedFile?.deletedAt?.toISOString().slice(0, 19)}, reason length=${deletedFile?.deletionReason?.length})`);
    if (!deletedFile?.deletedAt) throw new Error("Soft delete didn't stick");

    // Add another live file so the read query has both deleted + live to count.
    const liveFile = await prisma.evidenceFile.create({
      data: {
        evidenceItemId: batchItem.id,
        fileName: "batch-2024-q3-corrected.pdf",
        originalFileName: "batch-2024-q3-corrected.pdf",
        fileSize: 23456,
        fileType: "application/pdf",
        fileExtension: ".pdf",
        fileUrl: "evidence/probe/probe/def456-batch-2024-q3-corrected.pdf",
        contentHashSha256: "def456abc123".padEnd(64, "0"),
        retainUntil: new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
        uploadedBy: "probe-script",
      },
    });
    void liveFile;

    // 5. getEvidenceForCAPA shape verification.
    const items = await getEvidenceForCAPA(capa.id, tenant.id);
    if (!items) throw new Error("getEvidenceForCAPA returned null");
    console.log(`✓ getEvidenceForCAPA returned ${items.length} items in canonical category order`);
    if (items.length !== 7) throw new Error("Expected 7 items in result");

    const orderOk = items.every((it, i) => it.category === EVIDENCE_CATEGORIES[i]);
    console.log(`✓ Items returned in canonical category order: ${orderOk}`);

    const batch = items.find((it) => it.category === "BATCH_RECORDS");
    if (!batch) throw new Error("BATCH_RECORDS not in result");
    console.log(`✓ BATCH_RECORDS: status=${batch.status}, notes=${JSON.stringify(batch.notes?.slice(0, 40))}, files.length=${batch.files.length} (expect 1 live), deletedFileCount=${batch.deletedFileCount} (expect 1), hasNoteHistory=${batch.hasNoteHistory} (expect true), isLocked=${batch.isLocked}`);
    if (batch.files.length !== 1) throw new Error("Expected 1 live file");
    if (batch.deletedFileCount !== 1) throw new Error("Expected 1 deleted file in count");
    if (!batch.hasNoteHistory) throw new Error("Expected hasNoteHistory=true");

    console.log("\n✓✓✓ All probe assertions passed.");
  } finally {
    // Cleanup: cascade-delete from CAPA wipes EvidenceItem + Files + NoteVersions.
    await prisma.cAPA.delete({ where: { id: capa.id } });
    console.log("Cleanup: probe CAPA deleted (cascade removed all evidence rows).");
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  prisma.$disconnect().then(() => process.exit(1));
});
