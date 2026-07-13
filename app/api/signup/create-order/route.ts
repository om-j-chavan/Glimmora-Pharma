/**
 * POST /api/signup/create-order
 *
 * Creates a Razorpay order for a pending signup.
 * Public endpoint - no authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrder, getPublicKey } from "@/lib/razorpay";
import { z } from "zod";

const createOrderSchema = z.object({
  signupId: z.string().min(1, "Signup ID is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signupId } = createOrderSchema.parse(body);

    // Find the pending signup
    const pendingSignup = await prisma.pendingSignup.findUnique({
      where: { id: signupId },
      include: { plan: true },
    });

    if (!pendingSignup) {
      return NextResponse.json(
        { error: "Signup session not found" },
        { status: 404 }
      );
    }

    // Check if signup has expired
    if (pendingSignup.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Signup session has expired. Please start again." },
        { status: 400 }
      );
    }

    // Check if already completed
    if (pendingSignup.status === "completed") {
      return NextResponse.json(
        { error: "This signup has already been completed" },
        { status: 400 }
      );
    }

    // If an order already exists and is not expired, return it
    if (pendingSignup.razorpayOrderId && pendingSignup.status === "order_created") {
      return NextResponse.json({
        success: true,
        orderId: pendingSignup.razorpayOrderId,
        amount: pendingSignup.orderAmount,
        currency: pendingSignup.orderCurrency,
        keyId: getPublicKey(),
        prefill: {
          name: pendingSignup.adminName,
          email: pendingSignup.adminEmail,
          contact: pendingSignup.phone ?? "",
        },
        notes: {
          signupId: pendingSignup.id,
          companyName: pendingSignup.companyName,
          planId: pendingSignup.planId,
        },
      });
    }

    // Calculate amount based on billing cycle
    const amount =
      pendingSignup.billingCycle === "yearly"
        ? pendingSignup.plan.priceYearly
        : pendingSignup.plan.priceMonthly;

    // Create Razorpay order
    const order = await createOrder({
      amount,
      currency: pendingSignup.plan.currency,
      receipt: pendingSignup.id,
      notes: {
        signupId: pendingSignup.id,
        companyName: pendingSignup.companyName,
        planId: pendingSignup.planId,
        billingCycle: pendingSignup.billingCycle,
      },
    });

    // Update pending signup with order details
    await prisma.pendingSignup.update({
      where: { id: signupId },
      data: {
        razorpayOrderId: order.id,
        orderAmount: amount,
        orderCurrency: pendingSignup.plan.currency,
        status: "order_created",
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount,
      currency: pendingSignup.plan.currency,
      keyId: getPublicKey(),
      prefill: {
        name: pendingSignup.adminName,
        email: pendingSignup.adminEmail,
        contact: pendingSignup.phone ?? "",
      },
      notes: {
        signupId: pendingSignup.id,
        companyName: pendingSignup.companyName,
        planId: pendingSignup.planId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[signup/create-order] Error:", error);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
