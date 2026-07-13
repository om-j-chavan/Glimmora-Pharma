import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileStorage } from "@/lib/fileStorage";

/**
 * GET /api/evidence/files/[id]
 *
 * Authenticated download endpoint for EvidenceFile content. The file's bytes
 * are not accessible via direct URL (the local fileStorage backend writes
 * outside ./public on purpose). This route enforces:
 *   1. Authentication (session cookie).
 *   2. Tenant scope — the file's evidenceItem → capa → tenantId must match
 *      the caller, unless the caller is super_admin.
 *   3. Soft-delete — by default a soft-deleted file returns 410 Gone with a
 *      message explaining the audit trail still references it. Set
 *      ?includeDeleted=1 (super_admin only) to retrieve a deleted file's
 *      bytes for audit-trail review.
 *
 * Response sets Content-Disposition: attachment with the original filename
 * so the browser saves with a useful name rather than the storage hash.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  const file = await prisma.evidenceFile.findUnique({
    where: { id },
    include: {
      evidenceItem: { include: { capa: { select: { tenantId: true } } } },
    },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  if (
    session.user.role !== "super_admin" &&
    file.evidenceItem.capa.tenantId !== session.user.tenantId
  ) {
    // Don't leak existence to other tenants — same shape as 404.
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.deletedAt !== null && !(includeDeleted && session.user.role === "super_admin")) {
    return NextResponse.json(
      {
        error: "File has been removed",
        deletedAt: file.deletedAt.toISOString(),
        deletionReason: file.deletionReason,
      },
      { status: 410 },
    );
  }

  try {
    const buffer = await fileStorage.read(file.fileUrl);
    const headers = new Headers();
    headers.set("Content-Type", file.fileType);
    headers.set("Content-Length", String(file.fileSize));
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.originalFileName)}"`,
    );
    // Long cache only for our own session — the URL identifies a specific
    // EvidenceFile.id, but the underlying bytes are immutable per Part 11.
    headers.set("Cache-Control", "private, max-age=300");
    // Convert Node Buffer to Uint8Array for the Web Response API.
    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    console.error("[evidence/files] read failed:", err);
    return NextResponse.json({ error: "File content unavailable" }, { status: 500 });
  }
}
