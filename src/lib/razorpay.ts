/**
 * Razorpay server-side utilities.
 *
 * Provides functions for:
 * - Creating orders
 * - Verifying payment signatures
 * - Verifying webhook signatures
 * - Fetching payment/order details
 *
 * SECURITY: Never expose RAZORPAY_KEY_SECRET to the client.
 */

import Razorpay from "razorpay";
import crypto from "crypto";

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export interface CreateOrderParams {
  amount: number; // Amount in smallest currency unit (paise for INR)
  currency?: string;
  receipt: string; // Unique receipt ID (e.g., pending signup ID)
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
}

export interface VerifyPaymentParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayPayment {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email?: string;
  contact?: string;
  description?: string;
  error_code?: string;
  error_description?: string;
  error_source?: string;
  error_step?: string;
  error_reason?: string;
  captured: boolean;
  created_at: number;
}

/**
 * Create a Razorpay order.
 *
 * @param params - Order parameters
 * @returns Created order object
 */
export async function createOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
  const order = await razorpay.orders.create({
    amount: params.amount,
    currency: params.currency ?? "INR",
    receipt: params.receipt,
    notes: params.notes ?? {},
  });

  return order as RazorpayOrder;
}

/**
 * Verify Razorpay payment signature using HMAC SHA256.
 *
 * The signature is computed as:
 *   HMAC_SHA256(order_id + "|" + payment_id, secret)
 *
 * @param params - Payment verification parameters
 * @returns true if signature is valid
 */
export function verifyPaymentSignature(params: VerifyPaymentParams): boolean {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(razorpaySignature)
  );
}

/**
 * Verify Razorpay webhook signature.
 *
 * The signature is in the X-Razorpay-Signature header.
 *
 * @param body - Raw request body (string)
 * @param signature - Signature from X-Razorpay-Signature header
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Fetch payment details from Razorpay.
 *
 * @param paymentId - Razorpay payment ID
 * @returns Payment details
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const payment = await razorpay.payments.fetch(paymentId);
  return payment as RazorpayPayment;
}

/**
 * Fetch order details from Razorpay.
 *
 * @param orderId - Razorpay order ID
 * @returns Order details
 */
export async function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  const order = await razorpay.orders.fetch(orderId);
  return order as RazorpayOrder;
}

/**
 * Capture a payment (if auto-capture is disabled).
 *
 * @param paymentId - Razorpay payment ID
 * @param amount - Amount to capture in paise
 * @param currency - Currency code
 * @returns Captured payment details
 */
export async function capturePayment(
  paymentId: string,
  amount: number,
  currency: string = "INR"
): Promise<RazorpayPayment> {
  const payment = await razorpay.payments.capture(paymentId, amount, currency);
  return payment as RazorpayPayment;
}

/**
 * Get the public Razorpay key for client-side checkout.
 * This is safe to expose to the client.
 */
export function getPublicKey(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID!;
}

export { razorpay };
