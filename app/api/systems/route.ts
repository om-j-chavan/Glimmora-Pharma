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

    const systems = await prisma.gxPSystem.findMany({
      where: { tenantId: user.tenantId },
      include: { validationStages: true, rtmEntries: true, roadmapActivities: true },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend GxPSystem interface
    const transformed = systems.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      type: s.type,
      vendor: s.vendor ?? "",
      version: s.version ?? "",
      gxpRelevance: s.gxpRelevance,
      part11Status: s.part11Status as "Compliant" | "Non-Compliant" | "Partial" | "N/A",
      annex11Status: s.annex11Status as "Compliant" | "Non-Compliant" | "Partial" | "N/A",
      gamp5Category: s.gamp5Category,
      validationStatus: s.validationStatus as "Not Started" | "In Progress" | "Validated" | "Overdue",
      riskLevel: s.riskLevel as "HIGH" | "MEDIUM" | "LOW",
      siteId: s.siteId ?? "",
      intendedUse: s.intendedUse ?? undefined,
      gxpScope: s.gxpScope ?? undefined,
      plannedActions: s.plannedActions ?? undefined,
      owner: s.owner ?? "",
      validationStages: s.validationStages.map((vs) => ({
        id: vs.id,
        stageName: vs.stageName,
        status: vs.status as "not_started" | "in_progress" | "submitted" | "approved" | "rejected",
        notes: vs.notes ?? undefined,
        submittedBy: vs.submittedBy ?? undefined,
        submittedDate: vs.submittedDate?.toISOString().split("T")[0] ?? undefined,
        approvedBy: vs.approvedBy ?? undefined,
        approvedDate: vs.approvedDate?.toISOString().split("T")[0] ?? undefined,
        rejectedBy: vs.rejectedBy ?? undefined,
        rejectionReason: vs.rejectionReason ?? undefined,
      })),
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching systems:", error);
    return NextResponse.json({ error: "Failed to fetch systems" }, { status: 500 });
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

    const system = await prisma.gxPSystem.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        type: body.type,
        vendor: body.vendor || null,
        version: body.version || null,
        gxpRelevance: body.gxpRelevance || "Major",
        part11Status: body.part11Status || "N/A",
        annex11Status: body.annex11Status || "N/A",
        gamp5Category: body.gamp5Category || "4",
        validationStatus: body.validationStatus || "Not Started",
        riskLevel: body.riskLevel || "MEDIUM",
        siteId: body.siteId || null,
        intendedUse: body.intendedUse || null,
        gxpScope: body.gxpScope || null,
        owner: body.owner || null,
        createdBy: session.user.name || session.user.email || "System",
      },
      include: { validationStages: true },
    });

    return NextResponse.json(system, { status: 201 });
  } catch (error) {
    console.error("Error creating system:", error);
    return NextResponse.json({ error: "Failed to create system" }, { status: 500 });
  }
}
