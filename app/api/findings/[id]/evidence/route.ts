import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileStorage } from "@/lib/fileStorage";
import { findingVisibilityWhere } from "@/lib/queries/findings";

/**
 * GET /api/findings/[id]/evidence
 *
 * Authenticated view/download endpoint for a Gap Assessment finding's uploaded
 * evidence document. Uploaded evidence bytes are written outside ./public by
 * the local fileStorage backend, so they are not reachable by direct URL — this
 * route is the only way to read them back. It enforces:
 *   1. Authentication (session cookie).
 *   2. Tenant scope — the Document's tenantId must match the caller, unless
 *      the caller is super_admin.
 *
 * The matching Document is the newest non-deleted row that uploadFindingEvidence
 * created for this finding (linkedModule "Gap Assessment" + linkedRecordId), and
 * it must carry a storageKey (typed-reference evidence has no file to serve).
 *
 * Response sets Content-Disposition: inline so the browser previews the file
 * (PDF, image, …) in a new tab rather than forcing a download, with the original
 * filename preserved.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // Phase 3 — re-check PARENT finding visibility (no IDOR on evidence bytes): a
  // non-see-all user who is neither creator nor owner cannot read a hidden
  // finding's evidence even by id. Mirror the route's super_admin cross-tenant
  // exemption (visibilityWhere returns {} for see-all roles).
  const visibleFinding = await prisma.finding.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(session.user.role === "super_admin" ? {} : { tenantId: session.user.tenantId }),
      ...findingVisibilityWhere(session),
    },
    select: { id: true },
  });
  if (!visibleFinding) {
    return NextResponse.json({ error: "No document linked to this finding" }, { status: 404 });
  }

  const doc = await prisma.document.findFirst({
    where: {
      linkedModule: "Gap Assessment",
      linkedRecordId: id,
      storageKey: { not: null },
      deletedAt: null,
      ...(session.user.role === "super_admin" ? {} : { tenantId: session.user.tenantId }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      storageKey: true,
      fileType: true,
      fileName: true,
      originalFileName: true,
    },
  });

  if (!doc || !doc.storageKey) {
    return NextResponse.json({ error: "No document linked to this finding" }, { status: 404 });
  }

  try {
    const buffer = await fileStorage.read(doc.storageKey);
    const filename = doc.originalFileName || doc.fileName;
    const headers = new Headers();
    headers.set("Content-Type", doc.fileType || "application/octet-stream");
    headers.set("Content-Length", String(buffer.length));
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(new Uint8Array(buffer), { status: 200, headers });
  } catch (err) {
    console.error("[findings/evidence] read failed:", err);
    return NextResponse.json({ error: "File content unavailable" }, { status: 500 });
  }
}
