import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileStorage } from "@/lib/fileStorage";
import { systemVisibilityWhere } from "@/lib/queries/systems";

/**
 * GET /api/stage-documents/[id]
 *
 * Authenticated download endpoint for StageDocument content (substage
 * mirrors the CAPA Evidence /api/evidence/files/[id] route — same auth,
 * tenant-scope, soft-delete semantics, and Content-Disposition behaviour).
 *
 * Enforcement:
 *   1. Authentication (session cookie).
 *   2. Tenant scope — the document's validationStage → system → tenantId
 *      must match the caller, unless the caller is super_admin.
 *   3. Soft-delete — by default a soft-deleted document returns 410 Gone
 *      with the deletion timestamp + reason. Set ?includeDeleted=1
 *      (super_admin only) to retrieve the bytes for audit-trail review.
 *
 * Cache-Control is private + 5-minute window: each StageDocument.id is
 * immutable per Part 11, so re-fetches inside the same session can hit
 * the browser cache without staleness risk.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const doc = await prisma.stageDocument.findUnique({
    where: { id },
    include: {
      validationStage: {
        include: {
          system: { select: { id: true, tenantId: true } },
        },
      },
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (
    session.user.role !== "super_admin" &&
    doc.validationStage.system.tenantId !== session.user.tenantId
  ) {
    // Don't leak existence to other tenants — same shape as 404.
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Phase 4 — re-check PARENT-SYSTEM visibility (no IDOR on stage-doc bytes): a
  // non-see-all user who is neither the system's creator nor a rework-task
  // assignee cannot read its stage documents even by doc id. systemVisibilityWhere
  // is {} for see-all roles, so tenant scope above still governs them.
  const visibleSystem = await prisma.gxPSystem.findFirst({
    where: { id: doc.validationStage.system.id, ...systemVisibilityWhere(session) },
    select: { id: true },
  });
  if (!visibleSystem) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (
    doc.deletedAt !== null &&
    !(includeDeleted && session.user.role === "super_admin")
  ) {
    return NextResponse.json(
      {
        error: "Document has been removed",
        deletedAt: doc.deletedAt.toISOString(),
        deletionReason: doc.deletionReason,
      },
      { status: 410 },
    );
  }

  try {
    const buffer = await fileStorage.read(doc.fileUrl);
    const headers = new Headers();
    headers.set("Content-Type", doc.fileType);
    headers.set("Content-Length", String(doc.fileSize));
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.originalFileName)}"`,
    );
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    console.error("[stage-documents] read failed:", err);
    return NextResponse.json(
      { error: "Document content unavailable" },
      { status: 500 },
    );
  }
}
