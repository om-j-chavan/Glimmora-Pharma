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

/**
 * Read a required Razorpay env var, or fail with a message that NAMES it.
 *
 * The `!` these replace asserted to TypeScript that values were present which are
 * genuinely absent — a claim nobody checked. The cost was paid at the worst moment:
 * "`key_id` or `oauthToken` is mandatory", thrown from a bundled chunk with no hint
 * of which variable or which route.
 */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Razorpay is required for this request; add it to your environment (see .env.example).`,
    );
  }
  return v;
}

/**
 * LAZY singleton. Constructed on first USE, never at module load.
 *
 * Module-scope construction meant a payment SDK had to initialise for the app to
 * COMPILE: `next build` collects page data by evaluating each route's module, so the
 * constructor ran at build time and threw without runtime secrets. A route that is
 * never called at build time now never needs a key.
 */
let _razorpay: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: requireEnv("RAZORPAY_KEY_ID"),
      key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
    });
  }
  return _razorpay;
}

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
  const order = await getRazorpay().orders.create({
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
    // Was `RAZORPAY_KEY_SECRET!` — an undefined key makes crypto throw
    // ERR_INVALID_ARG_TYPE ("The 'key' argument must be of type string… Received
    // undefined"), which names neither the variable nor Razorpay.
    .createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
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
  // requireEnv stays OUTSIDE the try, deliberately. A MISSING SECRET is a config
  // error; an unparseable signature is a security answer. Folding the first into
  // the catch below returned `false` — "invalid signature" — for an unconfigured
  // server, which is a config error wearing a security error's clothes: the webhook
  // would silently reject every legitimate Razorpay callback and look like an
  // attack. This throws instead, naming RAZORPAY_WEBHOOK_SECRET.
  const expectedSignature = crypto
    .createHmac("sha256", requireEnv("RAZORPAY_WEBHOOK_SECRET"))
    .update(body)
    .digest("hex");

  try {
    // The catch covers timingSafeEqual ONLY — it throws on a length mismatch,
    // which genuinely means the signature is invalid.
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
  const payment = await getRazorpay().payments.fetch(paymentId);
  return payment as RazorpayPayment;
}

/**
 * Fetch order details from Razorpay.
 *
 * @param orderId - Razorpay order ID
 * @returns Order details
 */
export async function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  const order = await getRazorpay().orders.fetch(orderId);
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
  const payment = await getRazorpay().payments.capture(paymentId, amount, currency);
  return payment as RazorpayPayment;
}

/**
 * Get the public Razorpay key for client-side checkout.
 * This is safe to expose to the client.
 */
export function getPublicKey(): string {
  // Was `?? process.env.RAZORPAY_KEY_ID!`. That `!` was the QUIET one: with no key
  // set it returned `undefined` TYPED AS string and handed it to the client's
  // checkout — no throw, no log, and the type system asserting it was fine. A build
  // failure is loud and stops you; this shipped. requireEnv makes the same absence
  // fail where it happens, naming the variable.
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? requireEnv("RAZORPAY_KEY_ID");
}

/**
 * Check if Razorpay is configured (origin).
 */
export function isConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

// Lazy instance accessor (origin) — SAFE: getRazorpay() constructs on first ACCESS,
// never at module load, so this doesn't reintroduce the build-time construction the
// lazy singleton removed. All current importers use the functions above; kept for
// any caller that wants the raw instance.
export const razorpay = {
  get instance() {
    return getRazorpay();
  },
};
