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

    const events = await prisma.fDA483Event.findMany({
      where: { tenantId: user.tenantId },
      include: { observations: true, commitments: true },
      orderBy: { createdAt: "desc" },
    });

    // Transform to match frontend FDA483Event interface
    const transformed = events.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      referenceNumber: e.referenceNumber,
      eventType: e.eventType,
      agency: e.agency,
      siteId: e.siteId,
      inspectionDate: e.inspectionDate.toISOString().split("T")[0],
      responseDeadline: e.responseDeadline.toISOString().split("T")[0],
      status: e.status as "Open" | "Response Due" | "Response Submitted" | "Closed",
      responseDraft: e.responseDraft ?? undefined,
      agiDraft: e.agiDraft ?? undefined,
      submittedAt: e.submittedAt?.toISOString() ?? undefined,
      submittedBy: e.submittedBy ?? undefined,
      signatureMeaning: e.signatureMeaning ?? undefined,
      createdAt: e.createdAt.toISOString(),
      observations: e.observations.map((o) => ({
        id: o.id,
        number: o.number,
        text: o.text,
        severity: o.severity as "Critical" | "Major" | "Minor",
        area: o.area ?? undefined,
        regulation: o.regulation ?? undefined,
        rcaMethod: o.rcaMethod as "5-Why" | "Fishbone" | "Freeform" | undefined,
        rootCause: o.rootCause ?? undefined,
        capaId: o.capaId ?? undefined,
        responseText: o.responseText ?? undefined,
        status: o.status as "Open" | "RCA Complete" | "CAPA Linked" | "Response Ready",
      })),
      commitments: e.commitments.map((c) => ({
        id: c.id,
        text: c.text,
        dueDate: c.dueDate?.toISOString().split("T")[0] ?? undefined,
        owner: c.owner ?? undefined,
        status: c.status as "Pending" | "In Progress" | "Completed" | "Overdue",
      })),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching FDA 483 events:", error);
    return NextResponse.json({ error: "Failed to fetch FDA 483 events" }, { status: 500 });
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

    const event = await prisma.fDA483Event.create({
      data: {
        tenantId: user.tenantId,
        referenceNumber: body.referenceNumber,
        eventType: body.eventType,
        agency: body.agency,
        siteId: body.siteId,
        inspectionDate: new Date(body.inspectionDate),
        responseDeadline: new Date(body.responseDeadline),
        status: body.status || "Open",
        createdBy: session.user.name || session.user.email || "System",
      },
      include: { observations: true, commitments: true },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Error creating FDA 483 event:", error);
    return NextResponse.json({ error: "Failed to create FDA 483 event" }, { status: 500 });
  }
}
