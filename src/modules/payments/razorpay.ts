import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RazorpayCredentials } from "./payment-settings";

/**
 * The kitchen's own Razorpay account, called with the kitchen's own keys (never Platterly's).
 * Plain REST with Basic auth, so there is no SDK to carry. Amounts are in paise.
 */
const API = "https://api.razorpay.com/v1";

function auth(creds: Pick<RazorpayCredentials, "keyId" | "keySecret">) {
  return `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
}

export class RazorpayError extends Error {}

export async function createRazorpayOrder(creds: RazorpayCredentials, params: { amountRupees: number; receipt: string; notes: Record<string, string> }) {
  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: auth(creds), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: Math.round(params.amountRupees * 100), currency: "INR", receipt: params.receipt.slice(0, 40), notes: params.notes }),
  });
  if (!response.ok) throw new RazorpayError(`Razorpay refused the order (${response.status}).`);
  const body = (await response.json()) as { id: string };
  return { razorpayOrderId: body.id };
}

/** Used by "Test Connection": a cheap authenticated read. */
export async function testRazorpayKeys(creds: Pick<RazorpayCredentials, "keyId" | "keySecret">): Promise<boolean> {
  const response = await fetch(`${API}/orders?count=1`, { headers: { Authorization: auth(creds) } });
  return response.ok;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Razorpay Checkout's own signature: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function verifyCheckoutSignature(params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string }, keySecret: string): boolean {
  const expected = createHmac("sha256", keySecret).update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`).digest("hex");
  return safeEqualHex(expected, params.signature);
}

/** Webhook signature: HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
