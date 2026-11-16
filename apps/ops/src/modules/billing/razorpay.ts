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

/** A Razorpay subscription as its API and webhooks describe it. Times are Unix seconds. */
export interface RazorpaySubscription {
  id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  /** When billing starts, for a subscription made with a delayed start (a coupon's discounted first month). */
  start_at?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string> | unknown[] | null;
  customer_id?: string | null;
}

async function call<T>(creds: PlatformRazorpay, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body: unknown, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new RazorpayError(`Razorpay refused ${method} ${path.split("/")[1]} (${response.status}).`);
  return (await response.json()) as T;
}

/** A plan that charges every 30 days (our period), for the price with GST. Razorpay plans cannot be edited. */
export const createRazorpayPlan = (creds: PlatformRazorpay, p: { name: string; amountPaise: number }, fetchImpl: typeof fetch = fetch) =>
  call<{ id: string }>(creds, "POST", "/plans", { period: "daily", interval: 30, item: { name: p.name, amount: p.amountPaise, currency: "INR" } }, fetchImpl).then(({ id }) => ({ id }));

/** 120 cycles of 30 days is about ten years: auto-pay until the owner pauses, changes plan or is locked. */
export const createRazorpaySubscription = (creds: PlatformRazorpay, p: { razorpayPlanId: string; notes: Record<string, string>; customerId?: string; startAt?: number; addons?: { name: string; amountPaise: number }[] }, fetchImpl: typeof fetch = fetch) =>
  call<RazorpaySubscription>(creds, "POST", "/subscriptions", { plan_id: p.razorpayPlanId, total_count: 120, customer_notify: 1, notes: p.notes, ...(p.customerId ? { customer_id: p.customerId } : {}), ...(p.startAt ? { start_at: p.startAt } : {}), ...(p.addons?.length ? { addons: p.addons.map((a) => ({ item: { name: a.name, amount: a.amountPaise, currency: "INR" } })) } : {}) }, fetchImpl);

export const fetchRazorpaySubscription = (creds: PlatformRazorpay, id: string, fetchImpl: typeof fetch = fetch) => call<RazorpaySubscription>(creds, "GET", `/subscriptions/${id}`, undefined, fetchImpl);

/** The payment of a subscription's paid invoice: its real charge (with e-mandate the checkout's own payment is only the ₹0 mandate). */
export const fetchPaidChargeId = (creds: PlatformRazorpay, subscriptionId: string, fetchImpl: typeof fetch = fetch) =>
  call<{ items: { status: string; payment_id: string | null }[] }>(creds, "GET", `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}`, undefined, fetchImpl).then(({ items }) => items.find((i) => i.status === "paid" && i.payment_id)?.payment_id ?? null);
export const cancelRazorpaySubscription = (creds: PlatformRazorpay, id: string, atCycleEnd: boolean, fetchImpl: typeof fetch = fetch) => call<RazorpaySubscription>(creds, "POST", `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 }, fetchImpl);
export const pauseRazorpaySubscription = (creds: PlatformRazorpay, id: string, fetchImpl: typeof fetch = fetch) => call<RazorpaySubscription>(creds, "POST", `/subscriptions/${id}/pause`, { pause_at: "now" }, fetchImpl);
export const resumeRazorpaySubscription = (creds: PlatformRazorpay, id: string, fetchImpl: typeof fetch = fetch) => call<RazorpaySubscription>(creds, "POST", `/subscriptions/${id}/resume`, { resume_at: "now" }, fetchImpl);

/** Razorpay Checkout's signature for a subscription: HMAC-SHA256 of `payment_id|subscription_id` with the key secret. */
export function verifySubscriptionSignature(params: { razorpaySubscriptionId: string; razorpayPaymentId: string; signature: string }, keySecret: string): boolean {
  return safeEqual(createHmac("sha256", keySecret).update(`${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`).digest("hex"), params.signature);
}


// ---------- Saved payment methods (docs/payment-methods-design.md) ----------

/** The business's Razorpay customer. `fail_existing: 0` returns the existing customer for the same contact instead of failing, so a retry is safe. */
export const createRazorpayCustomer = (creds: PlatformRazorpay, p: { name: string; email: string; contact: string; businessId: string }, fetchImpl: typeof fetch = fetch) =>
  call<{ id: string }>(creds, "POST", "/customers", { name: p.name, email: p.email, contact: p.contact, fail_existing: "0", notes: { businessId: p.businessId } }, fetchImpl).then(({ id }) => ({ id }));

/**
 * A Rs 5 order that registers a card as a saved, recurring-authorised token for the customer (opened in Checkout with `order_id`, `customer_id` and
 * `recurring: "1"`). The Rs 5 is captured, not refunded by Razorpay: the caller refunds it once the registration is verified. The token is never debited by
 * Platterly (Razorpay has not switched on server-side token debit for this account); `max_amount` is the RBI's Rs 15,000 limit.
 */
export const createTokenRegistrationOrder = (creds: PlatformRazorpay, p: { customerId: string; receipt: string; notes: Record<string, string>; now?: Date }, fetchImpl: typeof fetch = fetch) =>
  call<{ id: string }>(creds, "POST", "/orders", { amount: 500, currency: "INR", receipt: p.receipt, customer_id: p.customerId, method: "card", token: { max_amount: 1_500_000, expire_at: Math.floor((p.now ?? new Date()).getTime() / 1000) + 365 * 86400, frequency: "as_presented" }, notes: p.notes }, fetchImpl).then(({ id }) => ({ id }));

/** A payment as Razorpay describes it: how it was paid (card last four and network, or the UPI id) and the token it created. */
export interface RazorpayPayment {
  id: string;
  status: string;
  amount: number;
  amount_refunded?: number;
  method: string;
  token_id?: string | null;
  customer_id?: string | null;
  card?: { last4?: string; network?: string; type?: string } | null;
  vpa?: string | null;
  bank?: string | null;
}
export const fetchRazorpayPayment = (creds: PlatformRazorpay, id: string, fetchImpl: typeof fetch = fetch) => call<RazorpayPayment>(creds, "GET", `/payments/${id}`, undefined, fetchImpl);
export const refundRazorpayPayment = (creds: PlatformRazorpay, id: string, amountPaise: number, fetchImpl: typeof fetch = fetch) => call<{ id: string; status: string }>(creds, "POST", `/payments/${id}/refund`, { amount: amountPaise }, fetchImpl);

export interface RazorpayToken {
  id: string;
  method: string;
  card?: { last4?: string; network?: string } | null;
  vpa?: { username?: string; handle?: string } | null;
  recurring?: boolean;
}
export const fetchCustomerTokens = (creds: PlatformRazorpay, customerId: string, fetchImpl: typeof fetch = fetch) =>
  call<{ items: RazorpayToken[] }>(creds, "GET", `/customers/${customerId}/tokens`, undefined, fetchImpl).then(({ items }) => items ?? []);
export const deleteRazorpayToken = (creds: PlatformRazorpay, customerId: string, tokenId: string, fetchImpl: typeof fetch = fetch) => call<{ deleted: boolean }>(creds, "DELETE", `/customers/${customerId}/tokens/${tokenId}`, undefined, fetchImpl);

/** Razorpay cannot delete a customer, so an erased business's record is overwritten with placeholders (name, email, contact). */
export const updateRazorpayCustomer = (creds: PlatformRazorpay, customerId: string, p: { name: string; email: string; contact: string }, fetchImpl: typeof fetch = fetch) =>
  call<{ id: string }>(creds, "PUT", `/customers/${customerId}`, { name: p.name, email: p.email, contact: p.contact }, fetchImpl);
