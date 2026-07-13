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

    const capas = await prisma.cAPA.findMany({
      where: { tenantId: user.tenantId },
      include: { site: true, finding: true, documents: true },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend CAPA interface
    // Map risk levels from DB (HIGH/MEDIUM/LOW) to frontend (Critical/High/Low)
    const riskMap: Record<string, string> = { HIGH: "Critical", MEDIUM: "High", LOW: "Low" };

    const transformed = capas.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      siteId: c.siteId ?? "",
      findingId: c.findingId ?? undefined,
      source: c.source as "Gap Assessment" | "483" | "Deviation" | "Audit" | "Complaint" | "OOS" | "Change Control",
      description: c.description,
      risk: (riskMap[c.risk] ?? "High") as "Critical" | "High" | "Low",
      owner: c.owner,
      dueDate: c.dueDate?.toISOString().split("T")[0] ?? "",
      status: c.status as "Open" | "In Progress" | "Pending QA Review" | "Closed",
      rca: c.rca ?? undefined,
      rcaMethod: c.rcaMethod as "5-Why" | "Fishbone" | "Fault Tree" | undefined,
      correctiveActions: c.correctiveActions ?? undefined,
      effectivenessCheck: c.effectivenessCheck,
      effectivenessDate: c.effectivenessDate?.toISOString().split("T")[0] ?? undefined,
      diGate: c.diGate,
      diGateStatus: c.diGateStatus as "Pending" | "Cleared" | "Failed" | undefined,
      diGateNotes: c.diGateNotes ?? undefined,
      diGateReviewedBy: c.diGateReviewedBy ?? undefined,
      diGateReviewDate: c.diGateReviewDate?.toISOString().split("T")[0] ?? undefined,
      closedBy: c.closedBy ?? undefined,
      closedAt: c.closedAt?.toISOString() ?? undefined,
      createdAt: c.createdAt.toISOString(),
      evidenceLinks: [], // Default empty array - evidence links are managed via documents
      documents: c.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileSize: d.fileSize ?? "",
        fileType: d.fileType ?? "",
        version: d.version,
        status: d.status as "current" | "superseded",
        uploadedBy: d.uploadedBy,
        approvedBy: d.approvedBy ?? undefined,
        approvedAt: d.approvedAt?.toISOString() ?? undefined,
        description: d.description ?? undefined,
        uploadedAt: d.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching CAPAs:", error);
    return NextResponse.json({ error: "Failed to fetch CAPAs" }, { status: 500 });
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

    const capa = await prisma.cAPA.create({
      data: {
        tenantId: user.tenantId,
        siteId: body.siteId || null,
        findingId: body.findingId || null,
        source: body.source,
        description: body.description,
        risk: body.risk,
        owner: body.owner,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: body.status || "Open",
        createdBy: session.user.name || session.user.email || "System",
      },
      include: { documents: true },
    });

    return NextResponse.json(capa, { status: 201 });
  } catch (error) {
    console.error("Error creating CAPA:", error);
    return NextResponse.json({ error: "Failed to create CAPA" }, { status: 500 });
  }
}
