import { describe, expect, it } from "vitest";
import { platformCheckoutPath, requestTarget, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { changeStoreSubscription, opsCheckoutConfigured, quoteStoreCheckout, startStoreCheckout, verifyStoreCheckout } from "../ops-checkout";
import { opsKeyFor, readBuyer } from "../purchase";

const SECRET = "billing-secret-0123456789abcdef0123456789abcdef";
const env = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_BILLING_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const BIZ = `biz_${"a".repeat(32)}`;
const buyer: Buyer = { name: "Spice Route", addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null };
const order = { kind: "order", keyId: "rzp_test_x", razorpayOrderId: "order_1", amountPaise: 1180000, businessName: "Spice Route", description: "Pro plan" };

/** An Ops stand-in: checks the request like Ops does (secret, whole body, route), then answers signed with the request's id. */
function ops(reply: { status?: number; body?: unknown; tamper?: boolean; wrongId?: boolean; throws?: boolean } = {}) {
  const seen: { method?: string; url?: string; body?: string; signedOk?: boolean } = {};
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    if (reply.throws) throw new Error("down");
    const url = String(input);
    const text = String(init?.body ?? "");
    const verified = verifyRequest([SECRET], new Headers(init?.headers), text, { target: requestTarget("POST", url) });
    Object.assign(seen, { method: init?.method, url, body: text, signedOk: verified.ok });
    if (!verified.ok) return new Response("{}", { status: 401 });
    const answer = JSON.stringify(reply.body ?? order);
    const headers = signedHeaders(SECRET, reply.wrongId ? "someone-else" : verified.id, answer);
    return new Response(reply.tamper ? answer.replace("order_1", "order_9") : answer, { status: reply.status ?? 200, headers });
  }) as typeof fetch;
  return { fetchImpl, seen };
}
const start = (fetchImpl: typeof fetch, e = env) => startStoreCheckout({ businessId: BIZ, opsProductKey: "catering", planId: "plan_1", interval: "ANNUAL", buyer }, { env: e, fetchImpl });

describe("Store: buy calls to Ops", () => {
  it("is configured only with the address and a billing secret of at least 32 characters", () => {
    expect(opsCheckoutConfigured(env)).toBe(true);
    expect(opsCheckoutConfigured({ OPS_BASE_URL: "http://x", OPS_PLATFORM_BILLING_SECRET: "short" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(opsCheckoutConfigured({ OPS_BASE_URL: "http://x", OPS_PLATFORM_READER_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("sends one signed POST to the business's own route and returns Ops's verified order", async () => {
    const { fetchImpl, seen } = ops();
    const result = await start(fetchImpl);
    expect(result).toEqual({ ok: true, answer: order });
    expect(seen.method).toBe("POST");
    expect(seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "checkout")}`);
    expect(seen.signedOk).toBe(true);
    expect(JSON.parse(seen.body!)).toEqual({ planId: "plan_1", interval: "ANNUAL", buyer });
  });

  it("does nothing without configuration, and the read-only secret is not a substitute", async () => {
    const { fetchImpl, seen } = ops();
    expect(await start(fetchImpl, {} as unknown as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "not_configured" });
    expect(await start(fetchImpl, { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_READER_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "not_configured" });
    expect(seen.method).toBeUndefined();
  });

  it("reports unreachable, refused, tampered, wrong-id and malformed answers as plain reasons, never a payment", async () => {
    expect(await start(ops({ throws: true }).fetchImpl)).toEqual({ ok: false, reason: "unreachable" });
    expect(await start(ops({ status: 500 }).fetchImpl)).toEqual({ ok: false, reason: "refused" });
    expect(await start(ops({ tamper: true }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await start(ops({ wrongId: true }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await start(ops({ body: { kind: "order" } }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
    expect(await start(ops({ body: { ...order, kind: "subscription" } }).fetchImpl)).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("a 400 from Ops carries its message for the person, a 404 is an unknown business", async () => {
    expect(await start(ops({ status: 400, body: { error: "That plan is not available." } }).fetchImpl)).toEqual({ ok: false, reason: "rejected", message: "That plan is not available." });
    expect(await start(ops({ status: 404, body: { error: "unknown_business" } }).fetchImpl)).toEqual({ ok: false, reason: "unknown_business" });
  });

  it("verify sends Razorpay's three values to the verify route and returns the invoice number", async () => {
    const { fetchImpl, seen } = ops({ body: { ok: true, status: "PAID", invoiceNumber: "FPSR-26-11-1" } });
    const result = await verifyStoreCheckout({ businessId: BIZ, opsProductKey: "catering", razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "sig" }, { env, fetchImpl });
    expect(result).toEqual({ ok: true, answer: { status: "PAID", invoiceNumber: "FPSR-26-11-1" } });
    expect(seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "verify")}`);
    expect(JSON.parse(seen.body!)).toEqual({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "sig" });
  });
});

describe("Store: price quote and plan changes", () => {
  const quote = { planName: "Max", interval: "ANNUAL", planPrice: 20000, credit: 2000, creditDays: 73, creditLabel: "Credit for 73 unused days of Pro", amount: 18000, gstPercent: 18, gstAmount: 3240, total: 21240 };

  it("asks Ops for the price of a plan and returns its figures, credit included", async () => {
    const { fetchImpl, seen } = ops({ body: quote });
    const result = await quoteStoreCheckout({ businessId: BIZ, opsProductKey: "catering", planId: "plan_2", interval: "ANNUAL" }, { env, fetchImpl });
    expect(result).toEqual({ ok: true, answer: quote });
    expect(seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "quote")}`);
    expect(JSON.parse(seen.body!)).toEqual({ planId: "plan_2", interval: "ANNUAL" });
    expect(seen.signedOk).toBe(true);
  });

  it("refuses a quote with missing or non-numeric figures", async () => {
    for (const body of [{ ...quote, total: "21240" }, { ...quote, credit: undefined }, { ...quote, interval: "WEEKLY" }, { planName: "x" }]) {
      expect(await quoteStoreCheckout({ businessId: BIZ, opsProductKey: "catering", planId: "p", interval: "ANNUAL" }, { env, fetchImpl: ops({ body }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
    }
  });

  it("sends each plan change to its own route; only a downgrade carries a plan", async () => {
    for (const change of ["downgrade", "undo-downgrade", "cancel", "reactivate"] as const) {
      const { fetchImpl, seen } = ops({ body: { ok: true } });
      const result = await changeStoreSubscription({ businessId: BIZ, opsProductKey: "catering", change, planId: "plan_1", interval: "MONTHLY" }, { env, fetchImpl });
      expect(result, change).toEqual({ ok: true, answer: { ok: true } });
      expect(seen.url, change).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", change)}`);
      expect(JSON.parse(seen.body!), change).toEqual(change === "downgrade" ? { planId: "plan_1", interval: "MONTHLY" } : {});
    }
  });

  it("a 400 from Ops carries its message; an answer that is not ok is refused", async () => {
    const asked = { businessId: BIZ, opsProductKey: "catering", change: "cancel" as const };
    expect(await changeStoreSubscription(asked, { env, fetchImpl: ops({ status: 400, body: { error: "There is no paid plan to cancel." } }).fetchImpl })).toEqual({ ok: false, reason: "rejected", message: "There is no paid plan to cancel." });
    expect(await changeStoreSubscription(asked, { env, fetchImpl: ops({ body: { ok: false } }).fetchImpl })).toEqual({ ok: false, reason: "bad_answer" });
  });
});

describe("Store: the purchase request", () => {
  it("maps the Store's product key back to Ops's", () => {
    expect(opsKeyFor("caterly")).toBe("catering");
    expect(opsKeyFor("rivo")).toBe("rivo");
  });

  it("turns the form into the buyer Ops stores, upper-casing the GSTIN, and refuses incomplete details with the form's own messages", () => {
    const ok = readBuyer({ name: " Spice Route ", addressLine1: "1 MG Road", city: "Pune", state: "Maharashtra", postalCode: "411001", gstin: "27abcde1234f1z5" });
    expect(ok).toEqual({ ok: true, buyer: { name: "Spice Route", addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: "27ABCDE1234F1Z5" } });
    const bad = readBuyer({ name: "", postalCode: "12" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fields)).toEqual(expect.arrayContaining(["name", "addressLine1", "postalCode"]));
    expect(readBuyer(null).ok).toBe(false);
  });
});
