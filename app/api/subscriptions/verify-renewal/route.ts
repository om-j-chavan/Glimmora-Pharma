/**
 * POST /api/subscriptions/verify-renewal
 *
 * Verifies renewal payment and extends subscription.
 * Requires authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { verifyPaymentSignature, fetchPayment } from "@/lib/razorpay";
import { z } from "zod";

const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
  subscriptionId: z.string().min(1),
  planId: z.string().min(1),
  billingCycle: z.enum(["monthly", "yearly"]),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      subscriptionId,
      planId,
      billingCycle,
    } = verifySchema.parse(body);

    const tenantId = session.user.tenantId;

    // Verify subscription belongs to this tenant
    const subscription = await prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    // Verify the Razorpay signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      console.error("[subscriptions/verify-renewal] Invalid signature");
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 }
      );
    }

    // Double-check payment status with Razorpay API
    const payment = await fetchPayment(razorpayPaymentId);

    if (payment.status !== "captured" && payment.status !== "authorized") {
      console.error("[subscriptions/verify-renewal] Payment not successful:", payment.status);
      return NextResponse.json(
        { error: "Payment was not successful" },
        { status: 400 }
      );
    }

    // Get the plan
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    // Calculate new dates
    const now = new Date();
    const subscriptionMonths = billingCycle === "yearly" ? 12 : 1;

    // If subscription is still active, extend from current expiry
    // If expired, extend from now
    const startDate =
      subscription.expiryDate > now ? subscription.expiryDate : now;
    const newExpiryDate = new Date(startDate);
    newExpiryDate.setMonth(newExpiryDate.getMonth() + subscriptionMonths);

    // Update subscription and create payment in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const paymentRecord = await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          tenantId,
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          amount: payment.amount,
          currency: payment.currency,
          status: "captured",
          method: payment.method,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
          email: payment.email,
          contact: payment.contact,
          description: `Renewal: ${plan.displayName} (${billingCycle}) - Year ${subscription.currentYear + 1}`,
          paidAt: now,
        },
      });

      // Update subscription
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          planId,
          maxAccounts: plan.maxAccounts,
          expiryDate: newExpiryDate,
          status: "Active",
          currentPeriodStart: startDate,
          currentPeriodEnd: newExpiryDate,
          currentYear: subscription.currentYear + 1,
        },
      });

      return { subscription: updatedSubscription, payment: paymentRecord };
    });

    return NextResponse.json({
      success: true,
      message: "Subscription renewed successfully",
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
        expiryDate: result.subscription.expiryDate,
        currentYear: result.subscription.currentYear,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[subscriptions/verify-renewal] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify renewal" },
      { status: 500 }
    );
  }
}
