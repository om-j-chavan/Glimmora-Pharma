/**
 * POST /api/signup/initiate
 *
 * Creates a pending signup record with company and admin details.
 * Validates unique email/username before proceeding.
 * Public endpoint - no authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const initiateSchema = z.object({
  // Company details
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  customerCode: z
    .string()
    .min(3, "Customer code must be at least 3 characters")
    .max(20, "Customer code must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Customer code can only contain letters, numbers, hyphens and underscores"),

  // Admin user details
  adminName: z.string().min(2, "Admin name must be at least 2 characters"),
  adminEmail: z.string().email("Invalid email address"),
  adminUsername: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),

  // Contact
  phone: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
  language: z.string().default("en"),

  // Plan selection
  planId: z.string().min(1, "Please select a plan"),
  billingCycle: z.enum(["monthly", "yearly"]).default("yearly"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = initiateSchema.parse(body);

    // Check for existing tenant with same email, username, or customer code
    const existingTenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { email: data.adminEmail.toLowerCase() },
          { username: data.adminUsername.toLowerCase() },
          { customerCode: data.customerCode.toLowerCase() },
        ],
      },
    });

    if (existingTenant) {
      if (existingTenant.email === data.adminEmail.toLowerCase()) {
        return NextResponse.json(
          { error: "Email already registered", field: "adminEmail" },
          { status: 400 }
        );
      }
      if (existingTenant.username === data.adminUsername.toLowerCase()) {
        return NextResponse.json(
          { error: "Username already taken", field: "adminUsername" },
          { status: 400 }
        );
      }
      if (existingTenant.customerCode === data.customerCode.toLowerCase()) {
        return NextResponse.json(
          { error: "Customer code already in use", field: "customerCode" },
          { status: 400 }
        );
      }
    }

    // Check for existing pending signup with same email or username
    const existingPending = await prisma.pendingSignup.findFirst({
      where: {
        OR: [
          { adminEmail: data.adminEmail.toLowerCase() },
          { adminUsername: data.adminUsername.toLowerCase() },
          { customerCode: data.customerCode.toLowerCase() },
        ],
        expiresAt: { gt: new Date() },
        status: { not: "completed" },
      },
    });

    if (existingPending) {
      // Delete the old pending signup and create a new one
      await prisma.pendingSignup.delete({ where: { id: existingPending.id } });
    }

    // Verify the plan exists and is active
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { id: data.planId, isActive: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "Invalid or inactive plan selected", field: "planId" },
        { status: 400 }
      );
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create pending signup (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const pendingSignup = await prisma.pendingSignup.create({
      data: {
        expiresAt,
        companyName: data.companyName,
        customerCode: data.customerCode.toLowerCase(),
        adminName: data.adminName,
        adminEmail: data.adminEmail.toLowerCase(),
        adminUsername: data.adminUsername.toLowerCase(),
        passwordHash,
        phone: data.phone,
        timezone: data.timezone,
        language: data.language,
        planId: data.planId,
        billingCycle: data.billingCycle,
        status: "pending",
      },
    });

    return NextResponse.json({
      success: true,
      signupId: pendingSignup.id,
      plan: {
        name: plan.displayName,
        price: data.billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly,
        currency: plan.currency,
        billingCycle: data.billingCycle,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      return NextResponse.json(
        { error: firstIssue.message, field: firstIssue.path[0] },
        { status: 400 }
      );
    }

    console.error("[signup/initiate] Error:", error);
    return NextResponse.json(
      { error: "Failed to initiate signup" },
      { status: 500 }
    );
  }
}
