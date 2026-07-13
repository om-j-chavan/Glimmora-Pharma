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

    const items = await prisma.rAIDItem.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend RAIDItem interface
    const transformed = items.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      type: r.type as "Risk" | "Action" | "Issue" | "Decision",
      title: r.title,
      description: r.description,
      priority: r.priority as "Critical" | "High" | "Medium" | "Low",
      owner: r.owner,
      dueDate: r.dueDate?.toISOString().split("T")[0] ?? undefined,
      status: r.status as "Open" | "Closed",
      impact: r.impact ?? undefined,
      mitigation: r.mitigation ?? undefined,
      closedBy: r.closedBy ?? undefined,
      closedAt: r.closedAt?.toISOString() ?? undefined,
      reopenedBy: r.reopenedBy ?? undefined,
      reopenedAt: r.reopenedAt?.toISOString() ?? undefined,
      reopenReason: r.reopenReason ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching RAID items:", error);
    return NextResponse.json({ error: "Failed to fetch RAID items" }, { status: 500 });
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

    const item = await prisma.rAIDItem.create({
      data: {
        tenantId: user.tenantId,
        type: body.type,
        title: body.title,
        description: body.description,
        priority: body.priority,
        owner: body.owner,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        status: body.status || "Open",
        impact: body.impact || null,
        mitigation: body.mitigation || null,
        createdBy: session.user.name || session.user.email || "System",
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating RAID item:", error);
    return NextResponse.json({ error: "Failed to create RAID item" }, { status: 500 });
  }
}
