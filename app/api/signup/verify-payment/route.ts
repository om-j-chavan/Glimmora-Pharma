/**
 * POST /api/signup/verify-payment
 *
 * Verifies Razorpay payment signature and creates:
 * - Tenant record
 * - Subscription record
 * - Payment record
 *
 * Public endpoint - no authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPaymentSignature, fetchPayment } from "@/lib/razorpay";
import { z } from "zod";

const verifySchema = z.object({
  signupId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signupId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      verifySchema.parse(body);

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
        { error: "Signup session has expired" },
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

    // Verify the order ID matches
    if (pendingSignup.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json(
        { error: "Order ID mismatch" },
        { status: 400 }
      );
    }

    // Verify the Razorpay signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      console.error("[signup/verify-payment] Invalid signature for signup:", signupId);
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 }
      );
    }

    // Double-check payment status with Razorpay API
    const payment = await fetchPayment(razorpayPaymentId);

    if (payment.status !== "captured" && payment.status !== "authorized") {
      console.error("[signup/verify-payment] Payment not successful:", payment.status);
      return NextResponse.json(
        { error: "Payment was not successful" },
        { status: 400 }
      );
    }

    // Create tenant, subscription, and payment in a transaction
    const now = new Date();
    const subscriptionMonths = pendingSignup.billingCycle === "yearly" ? 12 : 1;
    const expiryDate = new Date(now);
    expiryDate.setMonth(expiryDate.getMonth() + subscriptionMonths);

    const result = await prisma.$transaction(async (tx) => {
      // Create tenant (admin user)
      const tenant = await tx.tenant.create({
        data: {
          customerCode: pendingSignup.customerCode,
          name: pendingSignup.companyName,
          username: pendingSignup.adminUsername,
          email: pendingSignup.adminEmail,
          passwordHash: pendingSignup.passwordHash,
          role: "CustomerAdministrator",
          language: pendingSignup.language,
          timezone: pendingSignup.timezone,
          isActive: true,
        },
      });

      // Create subscription
      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: pendingSignup.planId,
          maxAccounts: pendingSignup.plan.maxAccounts,
          startDate: now,
          expiryDate,
          status: "Active",
          contractStartDate: now,
          contractEndDate: expiryDate,
          currentPeriodStart: now,
          currentPeriodEnd: expiryDate,
          currentYear: 1,
          gracePeriodDays: 7,
        },
      });

      // Create payment record
      const paymentRecord = await tx.payment.create({
        data: {
          subscriptionId: subscription.id,
          tenantId: tenant.id,
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          amount: pendingSignup.orderAmount!,
          currency: pendingSignup.orderCurrency,
          status: "captured",
          method: payment.method,
          bank: payment.bank,
          wallet: payment.wallet,
          vpa: payment.vpa,
          email: payment.email,
          contact: payment.contact,
          description: `Subscription: ${pendingSignup.plan.displayName} (${pendingSignup.billingCycle})`,
          paidAt: now,
        },
      });

      // Mark pending signup as completed
      await tx.pendingSignup.update({
        where: { id: signupId },
        data: { status: "completed" },
      });

      return { tenant, subscription, payment: paymentRecord };
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully",
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        email: result.tenant.email,
        username: result.tenant.username,
      },
      subscription: {
        id: result.subscription.id,
        status: result.subscription.status,
        expiryDate: result.subscription.expiryDate,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }

    console.error("[signup/verify-payment] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}
