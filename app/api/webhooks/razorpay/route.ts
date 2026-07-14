/**
 * POST /api/webhooks/razorpay
 *
 * Handles Razorpay webhook events:
 * - payment.captured
 * - payment.failed
 * - order.paid
 * - refund.created
 *
 * SECURITY: Always verify webhook signature before processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/razorpay";

interface RazorpayWebhookPayload {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: {
        id: string;
        entity: string;
        amount: number;
        currency: string;
        status: string;
        order_id: string;
        method?: string;
        bank?: string;
        wallet?: string;
        vpa?: string;
        email?: string;
        contact?: string;
        error_code?: string;
        error_description?: string;
        error_source?: string;
        error_step?: string;
        error_reason?: string;
        captured: boolean;
        created_at: number;
      };
    };
    order?: {
      entity: {
        id: string;
        status: string;
        receipt: string;
      };
    };
    refund?: {
      entity: {
        id: string;
        payment_id: string;
        amount: number;
        status: string;
      };
    };
  };
  created_at: number;
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      console.error("[webhook/razorpay] Missing signature header");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.error("[webhook/razorpay] Invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    const payload: RazorpayWebhookPayload = JSON.parse(rawBody);
    const event = payload.event;

    console.log(`[webhook/razorpay] Received event: ${event}`);

    switch (event) {
      case "payment.captured":
        await handlePaymentCaptured(payload);
        break;

      case "payment.failed":
        await handlePaymentFailed(payload);
        break;

      case "order.paid":
        await handleOrderPaid(payload);
        break;

      case "refund.created":
        await handleRefundCreated(payload);
        break;

      default:
        console.log(`[webhook/razorpay] Unhandled event: ${event}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[webhook/razorpay] Error processing webhook:", error);
    // Return 200 to acknowledge receipt (Razorpay will retry on non-2xx)
    return NextResponse.json({ success: true, warning: "Error processing" });
  }
}

async function handlePaymentCaptured(payload: RazorpayWebhookPayload) {
  const payment = payload.payload.payment?.entity;
  if (!payment) return;

  // Check if this payment already exists
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: payment.id },
  });

  if (existingPayment) {
    // Update existing payment status
    await prisma.payment.update({
      where: { razorpayPaymentId: payment.id },
      data: {
        status: "captured",
        method: payment.method,
        bank: payment.bank,
        wallet: payment.wallet,
        vpa: payment.vpa,
        paidAt: new Date(payment.created_at * 1000),
      },
    });
  }

  // Check if this is for a pending signup
  const pendingSignup = await prisma.pendingSignup.findFirst({
    where: {
      razorpayOrderId: payment.order_id,
      status: { not: "completed" },
    },
  });

  if (pendingSignup) {
    console.log(`[webhook/razorpay] Payment captured for pending signup: ${pendingSignup.id}`);
    // The verify-payment endpoint will handle tenant creation
    // This is just a backup/confirmation
  }
}

async function handlePaymentFailed(payload: RazorpayWebhookPayload) {
  const payment = payload.payload.payment?.entity;
  if (!payment) return;

  // Check if this payment exists
  const existingPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: payment.id },
  });

  if (existingPayment) {
    // Update payment with failure details
    await prisma.payment.update({
      where: { razorpayPaymentId: payment.id },
      data: {
        status: "failed",
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
        errorSource: payment.error_source,
        errorStep: payment.error_step,
        errorReason: payment.error_reason,
      },
    });
  }

  // Log for pending signups
  const pendingSignup = await prisma.pendingSignup.findFirst({
    where: { razorpayOrderId: payment.order_id },
  });

  if (pendingSignup) {
    console.log(
      `[webhook/razorpay] Payment failed for pending signup: ${pendingSignup.id}`,
      payment.error_description
    );
  }
}

async function handleOrderPaid(payload: RazorpayWebhookPayload) {
  const order = payload.payload.order?.entity;
  if (!order) return;

  console.log(`[webhook/razorpay] Order paid: ${order.id}`);

  // Update subscription status if this is a renewal
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId: order.id },
    include: { subscription: true },
  });

  if (payment && payment.subscription) {
    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "Active" },
    });
  }
}

async function handleRefundCreated(payload: RazorpayWebhookPayload) {
  const refund = payload.payload.refund?.entity;
  if (!refund) return;

  // Update the payment status
  const payment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: refund.payment_id },
  });

  if (payment) {
    await prisma.payment.update({
      where: { razorpayPaymentId: refund.payment_id },
      data: { status: "refunded" },
    });

    // Optionally update subscription status
    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "Cancelled" },
    });
  }
}
