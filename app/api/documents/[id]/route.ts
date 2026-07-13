import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileStorage } from "@/lib/fileStorage";

/**
 * GET /api/documents/[id]
 *
 * Authenticated download for a Document's uploaded file. Mirrors
 * /api/evidence/files/[id]: the bytes live outside ./public (local backend),
 * so this route enforces auth + tenant scope + soft-delete, then streams the
 * stored bytes with a useful filename. Returns 404 for metadata/URL-only
 * documents that have no stored file.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const includeDeleted = new URL(req.url).searchParams.get("includeDeleted") === "1";

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      tenantId: true,
      storageKey: true,
      fileType: true,
      fileSize: true,
      originalFileName: true,
      fileName: true,
      deletedAt: true,
      deletionReason: true,
    },
  });
  if (!doc) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // Don't leak existence to other tenants — same shape as 404.
  if (session.user.role !== "super_admin" && doc.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (!doc.storageKey) {
    return NextResponse.json({ error: "No file attached to this document" }, { status: 404 });
  }

  if (doc.deletedAt !== null && !(includeDeleted && session.user.role === "super_admin")) {
    return NextResponse.json(
      { error: "File has been removed", deletedAt: doc.deletedAt.toISOString(), deletionReason: doc.deletionReason },
      { status: 410 },
    );
  }

  try {
    const buffer = await fileStorage.read(doc.storageKey);
    const headers = new Headers();
    headers.set("Content-Type", doc.fileType ?? "application/octet-stream");
    if (doc.fileSize) headers.set("Content-Length", doc.fileSize);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.originalFileName ?? doc.fileName)}"`,
    );
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    console.error("[documents] read failed:", err);
    return NextResponse.json({ error: "File content unavailable" }, { status: 500 });
  }
}
