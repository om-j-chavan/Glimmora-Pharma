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

    const deviations = await prisma.deviation.findMany({
      where: { tenantId: user.tenantId },
      include: { site: true },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend Deviation interface
    const transformed = deviations.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      siteId: d.siteId ?? "",
      title: d.title,
      description: d.description,
      type: d.type as "planned" | "unplanned",
      category: d.category,
      severity: d.severity as "Critical" | "Major" | "Minor",
      area: d.area,
      detectedBy: d.detectedBy,
      detectedDate: d.detectedDate.toISOString().split("T")[0],
      owner: d.owner,
      dueDate: d.dueDate?.toISOString().split("T")[0] ?? "",
      status: d.status as "draft" | "open" | "under_investigation" | "pending_qa_review" | "closed" | "rejected",
      immediateAction: d.immediateAction ?? undefined,
      rootCause: d.rootCause ?? undefined,
      rcaMethod: d.rcaMethod as "5-Why" | "Fishbone" | "Other" | undefined,
      impact: {
        patientSafety: d.patientSafetyImpact ?? undefined,
        productQuality: d.productQualityImpact ?? undefined,
        regulatory: d.regulatoryImpact ?? undefined,
      },
      batchesAffected: d.batchesAffected ? d.batchesAffected.split(",").map(b => b.trim()) : [],
      linkedCAPAId: d.linkedCAPAId ?? undefined,
      closedBy: d.closedBy ?? undefined,
      closedDate: d.closedDate?.toISOString().split("T")[0] ?? undefined,
      closureNotes: d.closureNotes ?? undefined,
      createdAt: d.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching deviations:", error);
    return NextResponse.json({ error: "Failed to fetch deviations" }, { status: 500 });
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

    const deviation = await prisma.deviation.create({
      data: {
        tenantId: user.tenantId,
        siteId: body.siteId || null,
        title: body.title,
        description: body.description,
        type: body.type,
        category: body.category,
        severity: body.severity,
        area: body.area,
        detectedBy: body.detectedBy,
        detectedDate: new Date(body.detectedDate),
        owner: body.owner,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: body.status || "open",
        immediateAction: body.immediateAction || null,
        patientSafetyImpact: body.impact?.patientSafety || null,
        productQualityImpact: body.impact?.productQuality || null,
        regulatoryImpact: body.impact?.regulatory || null,
        batchesAffected: body.batchesAffected || null,
        createdBy: session.user.name || session.user.email || "System",
      },
    });

    return NextResponse.json(deviation, { status: 201 });
  } catch (error) {
    console.error("Error creating deviation:", error);
    return NextResponse.json({ error: "Failed to create deviation" }, { status: 500 });
  }
}
