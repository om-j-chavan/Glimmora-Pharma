import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AuditEntry } from "@/store/auditTrail.slice";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as { tenantId?: string }).tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 400 });
    }

    const logs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 500, // Limit to last 500 entries for performance
    });

    const entries: AuditEntry[] = logs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      userId: log.userId ?? "",
      userName: log.userName,
      userRole: log.userRole ?? "",
      module: log.module,
      action: log.action,
      recordId: log.recordId ?? "",
      recordTitle: log.recordTitle ?? "",
      oldValue: log.oldValue ?? undefined,
      newValue: log.newValue ?? undefined,
      ipAddress: log.ipAddress ?? undefined,
    }));

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as { tenantId?: string }).tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant" }, { status: 400 });
    }

    const body = await request.json();

    const log = await prisma.auditLog.create({
      data: {
        tenantId,
        userId: body.userId,
        userName: body.userName,
        userRole: body.userRole,
        module: body.module,
        action: body.action,
        recordId: body.recordId,
        recordTitle: body.recordTitle,
        oldValue: body.oldValue,
        newValue: body.newValue,
        ipAddress: body.ipAddress,
      },
    });

    return NextResponse.json({ id: log.id });
  } catch (error) {
    console.error("Error creating audit log:", error);
    return NextResponse.json(
      { error: "Failed to create audit log" },
      { status: 500 }
    );
  }
}
