import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PLATTERLY's own Razorpay account (kitchens paying for their plan), read from the environment:
 * RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET. Unset keys mean checkout answers "not switched on yet"
 * and nothing else changes. A kitchen's own Razorpay (customers paying the kitchen) is never used here: it stays in the product.
 * Plain REST with Basic auth, amounts in paise.
 */
const API = "https://api.razorpay.com/v1";

export interface PlatformRazorpay {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function platformRazorpay(): PlatformRazorpay | null {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_WEBHOOK_SECRET: webhookSecret } = process.env;
  return keyId && keySecret ? { keyId, keySecret, webhookSecret: webhookSecret ?? "" } : null;
}

export class RazorpayError extends Error {}

export async function createRazorpayOrder(creds: PlatformRazorpay, params: { amountRupees: number; receipt: string; notes: Record<string, string> }, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(params.amountRupees * 100), currency: "INR", receipt: params.receipt.slice(0, 40), notes: params.notes }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new RazorpayError(`Razorpay refused the order (${response.status}).`);
  const body = (await response.json()) as { id: string };
  return { razorpayOrderId: body.id };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Razorpay Checkout's own signature: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function verifyCheckoutSignature(params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }, keySecret: string): boolean {
  return safeEqual(createHmac("sha256", keySecret).update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`).digest("hex"), params.signature);
}

/** Webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  return safeEqual(createHmac("sha256", webhookSecret).update(rawBody).digest("hex"), signature);
}
