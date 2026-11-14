import "server-only";
import { newId, parseBillingProfileAnswer, platformBillingProfilePath, platformCheckoutPath, requestTarget, signedHeaders, type BillingProfileAnswer, type Buyer, type CheckoutAnswer, type PlatformBillingAction } from "@platterly/contract";
import { verifyPullResponse } from "@platterly/platform-contract";

/**
 * The Store's buy calls to Ops (item 4): a signed POST with the platform-billing secret (a different secret from the read-only one, so reading can never
 * start a payment), and an answer that must be signed by Ops and carry the id of this request before anything in it is believed. The caller must already have
 * checked that the signed-in person may buy for this business: Ops trusts Platform's word for who may, and checks only that the business is registered for the product.
 * A failure is a reason code; only a 400 from Ops carries its message, because Ops writes those for people.
 */
export type CheckoutFailure = "not_configured" | "unreachable" | "refused" | "bad_answer" | "rejected" | "unknown_business";
export type CheckoutResult<T> = { ok: true; answer: T } | { ok: false; reason: CheckoutFailure; message?: string };
type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number };

export const opsCheckoutConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.OPS_BASE_URL && env.OPS_PLATFORM_BILLING_SECRET && env.OPS_PLATFORM_BILLING_SECRET.length >= 32);

/** The Store's signed calls to Ops, POST for buy actions and PUT for saving the billing details: same secret, same route-bound signature, same checks on the answer. */
async function signedOpsBilling(method: "POST" | "PUT", path: string, body: unknown, deps: Deps): Promise<CheckoutResult<Record<string, unknown>>> {
  const env = deps.env ?? process.env;
  const secret = env.OPS_PLATFORM_BILLING_SECRET;
  if (!opsCheckoutConfigured(env) || !secret) return { ok: false, reason: "not_configured" };
  const url = new URL(path, env.OPS_BASE_URL);
  const requestId = newId("command");
  const text = JSON.stringify(body);
  let response: Response;
  let raw: string;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      method,
      headers: signedHeaders(secret, requestId, text, { now: deps.now === undefined ? undefined : Math.floor(deps.now / 1000), target: requestTarget(method, url.toString()) }),
      body: text,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    raw = await response.text();
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.status === 401) return { ok: false, reason: "refused" };
  const verified = verifyPullResponse([secret], requestId, response.headers, raw, deps.now);
  if (!verified.ok) return { ok: false, reason: "bad_answer" };
  if (response.status === 404) return { ok: false, reason: "unknown_business" };
  if (response.status === 400) return { ok: false, reason: "rejected", message: typeof verified.value.error === "string" ? verified.value.error : undefined };
  if (!response.ok) return { ok: false, reason: "refused" };
  return { ok: true, answer: verified.value };
}

const signedOpsPost = (businessId: string, productKey: string, action: PlatformBillingAction, body: unknown, deps: Deps) => signedOpsBilling("POST", platformCheckoutPath(businessId, productKey, action), body, deps);

/**
 * Saves a business's billing details (the Account's Billing details page). Ops checks them with the same rules as the forms and answers with the saved record.
 * The caller must already have checked that the signed-in person is the business's active Admin; `editedBy` is their id, kept in Ops's audit log.
 */
export async function saveOpsBillingProfile(input: { businessId: string; buyer: Buyer; editedBy: string }, deps: Deps = {}): Promise<CheckoutResult<BillingProfileAnswer>> {
  const got = await signedOpsBilling("PUT", platformBillingProfilePath(input.businessId), { buyer: input.buyer, editedBy: input.editedBy }, deps);
  if (!got.ok) return got;
  const parsed = parseBillingProfileAnswer(got.answer);
  return parsed.ok ? { ok: true, answer: parsed.value } : { ok: false, reason: "bad_answer" };
}

/** Starts a one-time payment: Ops creates the Razorpay order and a pending payment and answers with what Razorpay Checkout needs. */
export async function startStoreCheckout(input: { businessId: string; opsProductKey: string; planId: string; interval: "MONTHLY" | "ANNUAL"; buyer: Buyer }, deps: Deps = {}): Promise<CheckoutResult<Extract<CheckoutAnswer, { kind?: "order" }>>> {
  const got = await signedOpsPost(input.businessId, input.opsProductKey, "checkout", { planId: input.planId, interval: input.interval, buyer: input.buyer }, deps);
  if (!got.ok) return got;
  const a = got.answer;
  if (a.kind === "subscription" || typeof a.keyId !== "string" || typeof a.razorpayOrderId !== "string" || typeof a.amountPaise !== "number") return { ok: false, reason: "bad_answer" };
  return { ok: true, answer: a as unknown as Extract<CheckoutAnswer, { kind?: "order" }> };
}

/** Confirms what Razorpay Checkout returned. Ops checks Razorpay's signature itself; Platform never sees the Razorpay secret. */
export async function verifyStoreCheckout(input: { businessId: string; opsProductKey: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }, deps: Deps = {}): Promise<CheckoutResult<{ status: string | null; invoiceNumber: string | null }>> {
  const { businessId, opsProductKey, ...body } = input;
  const got = await signedOpsPost(businessId, opsProductKey, "verify", body, deps);
  if (!got.ok) return got;
  return { ok: true, answer: { status: typeof got.answer.status === "string" ? got.answer.status : null, invoiceNumber: typeof got.answer.invoiceNumber === "string" ? got.answer.invoiceNumber : null } };
}

/** What a plan would cost this business now, from Ops: the plan price, any upgrade credit for unused days, GST, and the total. The Store only shows these figures. */
export type StoreQuote = { planName: string; interval: "MONTHLY" | "ANNUAL"; planPrice: number; credit: number; creditDays: number; creditLabel: string | null; amount: number; gstPercent: number; gstAmount: number; total: number };

export async function quoteStoreCheckout(input: { businessId: string; opsProductKey: string; planId: string; interval: "MONTHLY" | "ANNUAL" }, deps: Deps = {}): Promise<CheckoutResult<StoreQuote>> {
  const got = await signedOpsPost(input.businessId, input.opsProductKey, "quote", { planId: input.planId, interval: input.interval }, deps);
  if (!got.ok) return got;
  const a = got.answer;
  const numbers = ["planPrice", "credit", "creditDays", "amount", "gstPercent", "gstAmount", "total"] as const;
  if (typeof a.planName !== "string" || (a.interval !== "MONTHLY" && a.interval !== "ANNUAL") || numbers.some((k) => typeof a[k] !== "number" || !Number.isFinite(a[k] as number))) return { ok: false, reason: "bad_answer" };
  return { ok: true, answer: a as unknown as StoreQuote };
}

export type SubscriptionChange = "downgrade" | "undo-downgrade" | "cancel" | "reactivate";

/** Schedule a lower plan for the end of the paid period, take that back, stop renewal, or take the stop back. Ops does the work; the answer is just ok. */
export async function changeStoreSubscription(input: { businessId: string; opsProductKey: string; change: SubscriptionChange; planId?: string; interval?: "MONTHLY" | "ANNUAL" }, deps: Deps = {}): Promise<CheckoutResult<{ ok: true }>> {
  const body = input.change === "downgrade" ? { planId: input.planId, interval: input.interval } : {};
  const got = await signedOpsPost(input.businessId, input.opsProductKey, input.change, body, deps);
  if (!got.ok) return got;
  return got.answer.ok === true ? { ok: true, answer: { ok: true } } : { ok: false, reason: "bad_answer" };
}
