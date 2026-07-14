import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { tenantId?: string } | undefined;
    if (!user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.document.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend EvidenceDocument interface
    // Map database fields to expected frontend shape
    const statusMap: Record<string, string> = {
      draft: "Draft",
      current: "Current",
      superseded: "Superseded",
      missing: "Missing",
      under_review: "Under Review",
    };

    const transformed = documents.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      siteId: "", // Default, not in DB
      title: d.fileName,
      reference: d.id.slice(0, 8).toUpperCase(),
      type: "Other" as const, // Default type
      area: "QMS" as const, // Default area
      systemId: d.linkedModule === "csv-csa" ? d.linkedRecordId : undefined,
      findingId: d.linkedModule === "gap-assessment" ? d.linkedRecordId : undefined,
      capaId: d.linkedModule === "capa" ? d.linkedRecordId : undefined,
      eventId: d.linkedModule === "fda-483" ? d.linkedRecordId : undefined,
      version: d.version,
      status: (statusMap[d.status] ?? "Draft") as "Current" | "Draft" | "Superseded" | "Missing" | "Under Review",
      author: d.uploadedBy,
      reviewedBy: d.approvedBy ?? undefined,
      effectiveDate: d.createdAt.toISOString().split("T")[0],
      expiryDate: undefined,
      tags: [],
      url: undefined,
      sizeKb: d.fileSize ? parseInt(d.fileSize, 10) : undefined,
      complianceTags: [], // Empty array to prevent undefined errors
      createdAt: d.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { tenantId?: string } | undefined;
    if (!user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const document = await prisma.document.create({
      data: {
        tenantId: user.tenantId,
        fileName: body.fileName,
        fileType: body.fileType || null,
        fileSize: body.fileSize || null,
        version: body.version || "v1.0",
        status: body.status || "draft",
        description: body.description || null,
        linkedModule: body.linkedModule || null,
        linkedRecordId: body.linkedRecordId || null,
        uploadedBy: session.user.name || session.user.email || "System",
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("Error creating document:", error);
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }
}
