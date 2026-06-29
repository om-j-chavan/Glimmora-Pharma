import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const getDeviations = cache(async (tenantId: string) => {
  const rows = await prisma.deviation.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    // Include the linked CAPA's human-readable reference so the list +
    // detail views can render "CAPA-…" instead of the raw cuid.
    include: { sourcedCAPA: { select: { id: true, reference: true } } },
  });
  if (rows.length === 0) return rows.map((r) => ({ ...r, documents: [], activeTask: null }));

  // Persisted evidence attachments (shared Document pipeline, linked by
  // linkedModule/linkedRecordId — there is no FK relation). ONE tenant-scoped
  // query for ALL deviations (the { in: devIds } form — never N+1 per row).
  const devIds = rows.map((r) => r.id);
  const docs = await prisma.document.findMany({
    where: {
      linkedModule: "Deviation Management",
      linkedRecordId: { in: devIds },
      tenantId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, fileName: true, originalFileName: true, fileType: true,
      fileExtension: true, fileSize: true, status: true, version: true,
      uploadedBy: true, uploadedAt: true, createdAt: true, linkedRecordId: true,
    },
  });
  const byDev = new Map<string, typeof docs>();
  for (const d of docs) {
    if (!d.linkedRecordId) continue;
    const arr = byDev.get(d.linkedRecordId);
    if (arr) arr.push(d);
    else byDev.set(d.linkedRecordId, [d]);
  }

  // Stage 4 (deviation redesign) — the current ACTIVE low-priority task per
  // deviation (newest non-terminal one), so the detail panel can show its
  // status and QA can review it. ONE tenant-scoped query for ALL deviations.
  const tasks = await prisma.deviationTask.findMany({
    where: {
      tenantId, deviationId: { in: devIds }, deletedAt: null,
      status: { in: ["pending", "in_progress", "submitted", "rework"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, deviationId: true, assignee: true, assigneeId: true, message: true,
      dueDate: true, status: true, completionNotes: true, submittedAt: true, reworkReason: true,
      // Stage 5 — the flat QA↔worker conversation, so the QA task panel shows it too.
      messages: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true } },
    },
  });
  const taskByDev = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) {
    if (!taskByDev.has(t.deviationId)) taskByDev.set(t.deviationId, t); // newest active wins
  }

  return rows.map((r) => ({ ...r, documents: byDev.get(r.id) ?? [], activeTask: taskByDev.get(r.id) ?? null }));
});

export const getDeviation = cache(async (id: string, tenantId: string) => {
  return prisma.deviation.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
});

