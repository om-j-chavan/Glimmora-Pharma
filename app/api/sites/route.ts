import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { tenantId?: string } | undefined;
    if (!user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sites = await prisma.site.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { name: "asc" },
    });

    // Transform to match frontend Site interface
    const transformed = sites.map((s) => ({
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      code: s.code ?? "",
      location: s.location ?? "",
      gmpScope: s.gmpScope ?? "",
      status: s.isActive ? "Active" : "Inactive",
      createdAt: s.createdAt.toISOString(),
    }));

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching sites:", error);
    return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
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

    const site = await prisma.site.create({
      data: {
        tenantId: user.tenantId,
        name: body.name,
        code: body.code || null,
        location: body.location || null,
        gmpScope: body.gmpScope || null,
        isActive: true,
      },
    });

    return NextResponse.json(site, { status: 201 });
  } catch (error) {
    console.error("Error creating site:", error);
    return NextResponse.json({ error: "Failed to create site" }, { status: 500 });
  }
}
