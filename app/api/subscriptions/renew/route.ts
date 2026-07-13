/**
 * POST /api/subscriptions/renew
 *
 * Initiates subscription renewal by creating a Razorpay order.
 * Requires authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createOrder, getPublicKey } from "@/lib/razorpay";
import { z } from "zod";

const renewSchema = z.object({
  billingCycle: z.enum(["monthly", "yearly"]).default("yearly"),
  planId: z.string().optional(), // Optional: allows upgrading to a different plan
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { billingCycle, planId: newPlanId } = renewSchema.parse(body);

    const tenantId = session.user.tenantId;

    // Get current subscription
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    if (subscription.cancelledAt) {
      return NextResponse.json(
        { error: "Subscription has been cancelled" },
        { status: 400 }
      );
    }

    // Get the plan to renew with (current or new)
    const planId = newPlanId ?? subscription.planId;
    const plan = planId
      ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } })
      : subscription.plan;

    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { error: "Selected plan is not available" },
        { status: 400 }
      );
    }

    // Get tenant details for prefill
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Calculate amount based on billing cycle
    const amount = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;

    // Create Razorpay order
    const receiptId = `renewal-${tenantId}-${Date.now()}`;
    const order = await createOrder({
      amount,
      currency: plan.currency,
      receipt: receiptId,
      notes: {
        type: "renewal",
        tenantId,
        subscriptionId: subscription.id,
        planId: plan.id,
        billingCycle,
        currentYear: String(subscription.currentYear + 1),
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount,
      currency: plan.currency,
      keyId: getPublicKey(),
      prefill: {
        name: tenant.name,
        email: tenant.email,
        contact: "", // Add phone field to tenant if needed
      },
      plan: {
        id: plan.id,
        name: plan.displayName,
        billingCycle,
      },
      subscriptionId: subscription.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[subscriptions/renew] Error:", error);
    return NextResponse.json(
      { error: "Failed to initiate renewal" },
      { status: 500 }
    );
  }
}
