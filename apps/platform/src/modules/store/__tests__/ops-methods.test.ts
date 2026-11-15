import { describe, expect, it } from "vitest";
import { platformCheckoutPath, requestTarget, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { changeStoreAutoPay, listStoreMethods, removeStoreMethod, sendOwnerContact, startStoreAddCard, startStoreCheckout, startStoreMakePrimary, verifyStoreAddCard, verifyStoreCheckout, verifyStoreMakePrimary } from "../ops-checkout";

const SECRET = "billing-secret-0123456789abcdef0123456789abcdef";
const env = { OPS_BASE_URL: "http://ops.test", OPS_PLATFORM_BILLING_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const BIZ = `biz_${"a".repeat(32)}`;
const buyer: Buyer = { name: "Spice Route", addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null };
const subscription = { kind: "subscription", keyId: "rzp_test_x", razorpaySubscriptionId: "sub_1", amountPaise: 118000, businessName: "Spice Route", description: "Pro plan, auto-pay" };

/** An Ops stand-in that checks the request like Ops does and answers signed with the request's id. */
function ops(body: unknown, status = 200) {
  const seen: { url?: string; body?: string; signedOk?: boolean } = {};
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const text = String(init?.body ?? "");
    const verified = verifyRequest([SECRET], new Headers(init?.headers), text, { target: requestTarget("POST", url) });
    Object.assign(seen, { url, body: text, signedOk: verified.ok });
    if (!verified.ok) return new Response("{}", { status: 401 });
    const answer = JSON.stringify(body);
    return new Response(answer, { status, headers: signedHeaders(SECRET, verified.id, answer) });
  }) as typeof fetch;
  return { fetchImpl, seen };
}
const deps = (fetchImpl: typeof fetch) => ({ env, fetchImpl });
const base = { businessId: BIZ, opsProductKey: "catering" };

describe("Store: monthly auto-pay", () => {
  it("a checkout can answer with an auto-pay subscription, and a subscription answer missing its id is refused", async () => {
    const { fetchImpl } = ops(subscription);
    expect(await startStoreCheckout({ ...base, planId: "p", interval: "MONTHLY", buyer }, deps(fetchImpl))).toEqual({ ok: true, answer: subscription });
    expect(await startStoreCheckout({ ...base, planId: "p", interval: "MONTHLY", buyer }, deps(ops({ ...subscription, razorpaySubscriptionId: undefined }).fetchImpl))).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("verify carries an auto-pay's three values, or a setup report, to the same verify route", async () => {
    const paid = ops({ ok: true, status: "PAID", invoiceNumber: "FP-1" });
    expect(await verifyStoreCheckout({ ...base, razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: "s" }, deps(paid.fetchImpl))).toEqual({ ok: true, answer: { status: "PAID", invoiceNumber: "FP-1" } });
    expect(paid.seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "verify")}`);
    expect(JSON.parse(paid.seen.body!)).toEqual({ razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature: "s" });
    const failed = ops({ ok: true, status: "FAILED", invoiceNumber: null });
    await verifyStoreCheckout({ ...base, razorpaySubscriptionId: "sub_1", failed: { reason: "declined", detail: null } }, deps(failed.fetchImpl));
    expect(JSON.parse(failed.seen.body!)).toEqual({ razorpaySubscriptionId: "sub_1", failed: { reason: "declined", detail: null } });
  });
});

describe("Store: payment-method calls to Ops", () => {
  it("lists the saved methods and the next charge date, refusing an answer that is not that shape", async () => {
    const answer = { methods: [{ id: "pm_1", kind: "CARD", label: "Visa ending 4366", isPrimary: true }], nextChargeAt: "2026-12-01T00:00:00.000Z" };
    const { fetchImpl, seen } = ops(answer);
    expect(await listStoreMethods(base, deps(fetchImpl))).toEqual({ ok: true, answer });
    expect(seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "methods")}`);
    expect(seen.signedOk).toBe(true);
    expect(await listStoreMethods(base, deps(ops({ methods: [{ id: 1 }], nextChargeAt: null }).fetchImpl))).toEqual({ ok: false, reason: "bad_answer" });
    expect(await listStoreMethods(base, deps(ops({ methods: "x" }).fetchImpl))).toEqual({ ok: false, reason: "bad_answer" });
  });

  it("add card: start returns what Razorpay's registration window needs; verify returns the saved label", async () => {
    const started = { keyId: "rzp_test_x", customerId: "cust_1", razorpayOrderId: "order_1", amountPaise: 500, description: "Save a card" };
    const a = ops(started);
    expect(await startStoreAddCard(base, deps(a.fetchImpl))).toEqual({ ok: true, answer: started });
    expect(a.seen.url).toContain("/billing/method-add");
    expect(await startStoreAddCard(base, deps(ops({ keyId: "k" }).fetchImpl))).toEqual({ ok: false, reason: "bad_answer" });
    const v = ops({ ok: true, label: "Visa ending 9999", refunded: false });
    expect(await verifyStoreAddCard({ ...base, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "s" }, deps(v.fetchImpl))).toEqual({ ok: true, answer: { label: "Visa ending 9999", refunded: false } });
    expect(v.seen.url).toContain("/billing/method-add-verify");
    expect(JSON.parse(v.seen.body!)).toEqual({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "s" });
  });

  it("make primary: start names the method; verify carries the new subscription's values", async () => {
    const started = { keyId: "rzp_test_x", customerId: "cust_1", razorpaySubscriptionId: "sub_2", description: "Authorise" };
    const a = ops(started);
    expect(await startStoreMakePrimary({ ...base, methodId: "pm_2" }, deps(a.fetchImpl))).toEqual({ ok: true, answer: started });
    expect(JSON.parse(a.seen.body!)).toEqual({ methodId: "pm_2" });
    expect(a.seen.url).toContain("/billing/method-primary");
    const v = ops({ ok: true, label: "Visa ending 1111" });
    expect(await verifyStoreMakePrimary({ ...base, razorpaySubscriptionId: "sub_2", razorpayPaymentId: "pay_2", signature: "s" }, deps(v.fetchImpl))).toEqual({ ok: true, answer: { label: "Visa ending 1111" } });
    expect(v.seen.url).toContain("/billing/method-primary-verify");
  });

  it("remove: a refusal from Ops reaches the person with its message", async () => {
    expect(await removeStoreMethod({ ...base, methodId: "pm_1" }, deps(ops({ ok: true }).fetchImpl))).toEqual({ ok: true, answer: { ok: true } });
    expect(await removeStoreMethod({ ...base, methodId: "pm_1" }, deps(ops({ error: "The last payment method cannot be removed. Add another first." }, 400).fetchImpl))).toEqual({ ok: false, reason: "rejected", message: "The last payment method cannot be removed. Add another first." });
  });
});

describe("Store: pause, resume and stop auto-pay", () => {
  it("sends each change to its own route with an empty body and returns ok; a refusal reaches the person with its message", async () => {
    for (const change of ["pause", "resume", "cancel"] as const) {
      const o = ops({ ok: true });
      expect(await changeStoreAutoPay({ ...base, change }, deps(o.fetchImpl))).toEqual({ ok: true, answer: { ok: true } });
      expect(o.seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", `autopay-${change}` as const)}`);
      expect(JSON.parse(o.seen.body!)).toEqual({});
    }
    expect(await changeStoreAutoPay({ ...base, change: "pause" }, deps(ops({ error: "Auto-pay is not on." }, 400).fetchImpl))).toEqual({ ok: false, reason: "rejected", message: "Auto-pay is not on." });
    expect(await changeStoreAutoPay({ ...base, change: "pause" }, deps(ops({ ok: false }).fetchImpl))).toEqual({ ok: false, reason: "bad_answer" });
  });
});

describe("Store: owner contact to Ops", () => {
  it("sends the Admin's phone and email, signed, to the owner-contact route", async () => {
    const { fetchImpl, seen } = ops({ ok: true });
    expect(await sendOwnerContact({ ...base, phone: "+919845000111", email: "admin@account.test" }, deps(fetchImpl))).toEqual({ ok: true, answer: { ok: true } });
    expect(seen.url).toBe(`http://ops.test${platformCheckoutPath(BIZ, "catering", "owner-contact")}`);
    expect(seen.signedOk).toBe(true);
    expect(JSON.parse(seen.body!)).toEqual({ phone: "+919845000111", email: "admin@account.test" });
  });
});
