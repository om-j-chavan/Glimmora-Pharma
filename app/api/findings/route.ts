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

    const tenantId = user.tenantId;

    const findings = await prisma.finding.findMany({
      where: { tenantId },
      include: { site: true, capa: true },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend Finding interface
    const transformed = findings.map((f) => ({
      id: f.id,
      tenantId: f.tenantId,
      siteId: f.siteId ?? "",
      area: f.area,
      requirement: f.requirement,
      framework: f.framework ?? "",
      severity: f.severity as "Critical" | "High" | "Low",
      status: f.status as "Open" | "In Progress" | "Closed",
      owner: f.owner,
      targetDate: f.targetDate?.toISOString().split("T")[0] ?? "",
      evidenceLink: f.evidenceLink ?? "",
      rootCause: f.rootCause ?? undefined,
      capaId: f.linkedCAPAId ?? undefined,
      createdAt: f.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching findings:", error);
    return NextResponse.json({ error: "Failed to fetch findings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const finding = await prisma.finding.create({
      data: {
        tenantId: session.user.tenantId,
        siteId: body.siteId || null,
        requirement: body.requirement,
        area: body.area,
        framework: body.framework || null,
        severity: body.severity,
        status: body.status || "Open",
        owner: body.owner,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        rootCause: body.rootCause || null,
        evidenceLink: body.evidenceLink || null,
        createdBy: session.user.name || session.user.email || "System",
      },
    });

    return NextResponse.json(finding, { status: 201 });
  } catch (error) {
    console.error("Error creating finding:", error);
    return NextResponse.json({ error: "Failed to create finding" }, { status: 500 });
  }
}
