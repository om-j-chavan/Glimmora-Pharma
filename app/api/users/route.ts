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

    const users = await prisma.user.findMany({
      where: { tenantId: user.tenantId },
      include: { site: true },
      orderBy: { name: "asc" },
    });

    // Transform to match frontend User interface
    const transformed = users.map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      siteId: u.siteId ?? undefined,
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      gxpSignatory: u.gxpSignatory,
      status: u.isActive ? "Active" : "Inactive",
      lastLogin: u.lastLogin?.toISOString() ?? undefined,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as { tenantId?: string; name?: string; email?: string } | undefined;
    if (!sessionUser?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(body.password || "changeme123", 10);

    const newUser = await prisma.user.create({
      data: {
        tenantId: sessionUser.tenantId,
        siteId: body.siteId || null,
        name: body.name,
        email: body.email,
        username: body.username,
        passwordHash,
        role: body.role,
        gxpSignatory: body.gxpSignatory || false,
        isActive: true,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
