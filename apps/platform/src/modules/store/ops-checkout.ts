import "server-only";
import { newId, platformCheckoutPath, requestTarget, signedHeaders, type Buyer, type CheckoutAnswer, type PlatformBillingAction } from "@platterly/contract";
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

async function signedOpsPost(businessId: string, productKey: string, action: PlatformBillingAction, body: unknown, deps: Deps): Promise<CheckoutResult<Record<string, unknown>>> {
  const env = deps.env ?? process.env;
  const secret = env.OPS_PLATFORM_BILLING_SECRET;
  if (!opsCheckoutConfigured(env) || !secret) return { ok: false, reason: "not_configured" };
  const url = new URL(platformCheckoutPath(businessId, productKey, action), env.OPS_BASE_URL);
  const requestId = newId("command");
  const text = JSON.stringify(body);
  let response: Response;
  let raw: string;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: signedHeaders(secret, requestId, text, { now: deps.now === undefined ? undefined : Math.floor(deps.now / 1000), target: requestTarget("POST", url.toString()) }),
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
