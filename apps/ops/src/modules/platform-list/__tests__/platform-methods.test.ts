import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, platformCheckoutPath, requestTarget, signedHeaders, type Buyer, type PlatformBillingAction } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { POST as checkoutPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/checkout/route";
import { POST as verifyPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/verify/route";
import { POST as quotePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/quote/route";
import { POST as methodsPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/methods/route";
import { POST as methodAddPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/method-add/route";
import { POST as methodAddVerifyPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/method-add-verify/route";
import { POST as methodPrimaryPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/method-primary/route";
import { POST as methodPrimaryVerifyPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/method-primary-verify/route";
import { POST as methodRemovePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/method-remove/route";
import { POST as autopayPausePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/autopay-pause/route";
import { POST as autopayResumePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/autopay-resume/route";
import { POST as ownerContactPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/owner-contact/route";
import { POST as registerPendingPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/register-pending/route";
import { POST as abandonPendingPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/abandon-pending/route";
import { POST as autopayCancelPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/autopay-cancel/route";

/** The Store's monthly auto-pay and payment-method calls (Platform to Ops). Razorpay is a stand-in. */
const KEY = "plrmeth";
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const BILLING_SECRET = "platform-billing-secret-0123456789abcdef0123";
const BIZ = `biz_${"d".repeat(32)}`;
const DAY = 86_400_000;
const manifest = { contract: 1, productKey: KEY, name: "Meth Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };

type Pay = { id: string; status: string; amount: number; amount_refunded?: number; method: string; token_id?: string | null; customer_id?: string | null; card?: { last4: string; network: string } | null; vpa?: string | null };
let calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
let rz: Record<string, { status: string; current_start: number | null; current_end: number | null; notes?: Record<string, string> }> = {};
let inv: Record<string, { status: string; payment_id: string | null }[]> = {};
let pays: Record<string, Pay> = {};
let counter = 0;
const realFetch = globalThis.fetch;
function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    const path = url.slice("https://api.razorpay.com/v1".length);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", path, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/customers") return json({ id: `cust_M${++counter}` });
    if (path === "/orders") return json({ id: `order_M${++counter}` });
    if (path === "/plans") return json({ id: `plan_M${++counter}` });
    if (path === "/subscriptions") {
      const id = `sub_M${++counter}`;
      rz[id] = { status: "created", current_start: null, current_end: null, notes: body.notes };
      return json({ id, ...rz[id] });
    }
    const invoices = path.match(/^\/invoices\?subscription_id=(sub_\w+)$/);
    if (invoices) return json({ items: inv[invoices[1]] ?? [] });
    const change = path.match(/^\/subscriptions\/(sub_\w+)\/(pause|resume)$/);
    if (change && rz[change[1]]) {
      rz[change[1]].status = change[2] === "pause" ? "paused" : "active";
      return json({ id: change[1], ...rz[change[1]] });
    }
    const cancel = path.match(/^\/subscriptions\/(sub_\w+)\/cancel$/);
    if (cancel) {
      rz[cancel[1]] = { ...(rz[cancel[1]] ?? { current_start: null, current_end: null }), status: "cancelled" };
      return json({ id: cancel[1], ...rz[cancel[1]] });
    }
    const sub = path.match(/^\/subscriptions\/(sub_\w+)$/);
    if (sub && rz[sub[1]]) return json({ id: sub[1], ...rz[sub[1]] });
    if (path.match(/^\/payments\/pay_\w+\/refund$/)) return json({ id: `rfnd_M${++counter}`, status: "processed" });
    const pay = path.match(/^\/payments\/(pay_\w+)$/);
    if (pay && pays[pay[1]]) return json(pays[pay[1]]);
    if (path.match(/^\/customers\/cust_\w+\/tokens\/token_\w+$/) && init?.method === "DELETE") return json({ deleted: true });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const HANDLERS = { checkout: checkoutPOST, verify: verifyPOST, quote: quotePOST, methods: methodsPOST, "method-add": methodAddPOST, "method-add-verify": methodAddVerifyPOST, "method-primary": methodPrimaryPOST, "method-primary-verify": methodPrimaryVerifyPOST, "method-remove": methodRemovePOST, "autopay-pause": autopayPausePOST, "autopay-resume": autopayResumePOST, "autopay-cancel": autopayCancelPOST, "owner-contact": ownerContactPOST, "register-pending": registerPendingPOST, "abandon-pending": abandonPendingPOST } as Record<PlatformBillingAction, typeof checkoutPOST>;
const call = (action: PlatformBillingAction, body: unknown, secret: string | null = BILLING_SECRET, biz: string = BIZ) => {
  const text = JSON.stringify(body);
  const url = `http://127.0.0.1:3200${platformCheckoutPath(biz, KEY, action)}`;
  const request = new Request(url, { method: "POST", headers: secret === null ? {} : signedHeaders(secret, newId("command"), text, { target: requestTarget("POST", url) }), body: text });
  return HANDLERS[action](request, { params: Promise.resolve({ businessId: biz, productKey: KEY }) });
};
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const subSig = (subId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${payId}|${subId}`).digest("hex");
const orderSig = (orderId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${payId}`).digest("hex");
const card = (id: string, token: string, last4: string, customer: string | null = null): Pay => ({ id, status: "captured", amount: 500, method: "card", token_id: token, customer_id: customer, card: { last4, network: "Visa" } });

async function clean() {
  await prisma.abandonedOrder.deleteMany({ where: { businessId: { in: [BIZ, `biz_${"e".repeat(32)}`] } } });
  await prisma.razorpayEvent.deleteMany({ where: { businessId: BIZ } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.razorpayPlan.deleteMany({ where: { plan: { productKey: KEY } } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

let planId = "";
beforeEach(async () => {
  await clean();
  calls = [];
  rz = {};
  inv = {};
  pays = {};
  counter = 0;
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "razorpay_webhook_secret";
  process.env.PLATFORM_BILLING_SECRETS = BILLING_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  await registerProduct({ key: KEY, name: "Meth Test", baseUrl: "https://x.example", actorUserId: null });
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: {} });
  await prisma.business.create({ data: { id: BIZ, name: "PlrMeth Spice Route", ownerEmail: "o@example.test", ownerPhone: "9845671203", ownerName: "O", products: { create: { productKey: KEY } } } });
  planId = (await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 1000, priceAnnual: 10000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null)).id;
  await createPlan({ productKey: KEY, code: "max", name: "Max", isTrial: false, priceMonthly: 2000, priceAnnual: 20000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 1000 } }, null);
});
afterEach(clean);
afterAll(() => vi.unstubAllGlobals());

/** The Store buys Pro monthly and Razorpay Checkout comes back with a card payment: one paid period, the first method saved. */
async function buyMonthly() {
  const started = (await (await call("checkout", { planId, interval: "MONTHLY", buyer })).json()) as { razorpaySubscriptionId: string };
  const start = new Date();
  rz[started.razorpaySubscriptionId] = { ...rz[started.razorpaySubscriptionId], status: "active", current_start: secs(start), current_end: secs(new Date(start.getTime() + 30 * DAY)) };
  inv[started.razorpaySubscriptionId] = [{ status: "paid", payment_id: "pay_charge1" }];
  pays.pay_window = card("pay_window", "token_A", "4366", "cust_x");
  const res = await call("verify", { razorpaySubscriptionId: started.razorpaySubscriptionId, razorpayPaymentId: "pay_window", signature: subSig(started.razorpaySubscriptionId, "pay_window") });
  return { subId: started.razorpaySubscriptionId, res };
}

describe("monthly plans are auto-pay in the Store", () => {
  it("a monthly checkout is a Razorpay subscription for the business's customer, with a pending payment, whether or not autoPay is sent", async () => {
    for (const body of [{ planId, interval: "MONTHLY", buyer }, { planId, interval: "MONTHLY", buyer, autoPay: false }]) {
      const res = await call("checkout", body);
      expect(res.status).toBe(200);
      const answer = (await res.json()) as { kind: string; razorpaySubscriptionId: string; amountPaise: number };
      expect(answer).toMatchObject({ kind: "subscription", amountPaise: 118000 });
      expect(await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: answer.razorpaySubscriptionId } })).toMatchObject({ status: "PENDING", interval: "MONTHLY" });
    }
    expect(calls.filter((c) => c.path === "/subscriptions").every((c) => typeof c.body?.customer_id === "string")).toBe(true);
  });

  it("a yearly checkout is still a one-time order", async () => {
    expect(((await (await call("checkout", { planId, interval: "ANNUAL", buyer })).json()) as { kind: string }).kind).toBe("order");
  });

  it("verifying the auto-pay pays the first month, makes the plan ACTIVE and saves the card as the primary method", async () => {
    const { subId, res } = await buyMonthly();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "PAID" });
    expect(await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, endDate: null } })).toMatchObject({ status: "ACTIVE", razorpaySubscriptionId: subId, autoPay: "ACTIVE", billingInterval: "MONTHLY" });
    const methods = (await (await call("methods", {})).json()) as { methods: { label: string; isPrimary: boolean }[]; nextChargeAt: string | null };
    expect(methods.methods).toEqual([expect.objectContaining({ label: "Visa ending 4366", isPrimary: true })]);
    expect(methods.nextChargeAt).not.toBeNull();
  });

  it("a method that cannot be read does not undo the payment", async () => {
    const started = (await (await call("checkout", { planId, interval: "MONTHLY", buyer })).json()) as { razorpaySubscriptionId: string };
    const start = new Date();
    rz[started.razorpaySubscriptionId] = { ...rz[started.razorpaySubscriptionId], status: "active", current_start: secs(start), current_end: secs(new Date(start.getTime() + 30 * DAY)) };
    inv[started.razorpaySubscriptionId] = [{ status: "paid", payment_id: "pay_charge1" }];
    const res = await call("verify", { razorpaySubscriptionId: started.razorpaySubscriptionId, razorpayPaymentId: "pay_unknown", signature: subSig(started.razorpaySubscriptionId, "pay_unknown") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "PAID" });
    expect(await prisma.paymentMethod.count({ where: { businessId: BIZ } })).toBe(0);
  });

  it("a setup the owner's window reports as declined is recorded as failed and leaves the plan alone", async () => {
    const started = (await (await call("checkout", { planId, interval: "MONTHLY", buyer })).json()) as { razorpaySubscriptionId: string };
    const res = await call("verify", { razorpaySubscriptionId: started.razorpaySubscriptionId, failed: { reason: "declined", detail: null } });
    expect(res.status).toBe(200);
    expect(await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: started.razorpaySubscriptionId } })).toMatchObject({ status: "FAILED", failureReason: "declined" });
    expect(await prisma.subscription.count({ where: { businessId: BIZ } })).toBe(0);
  });

  it("a monthly upgrade gets no credit (yearly still does)", async () => {
    await buyMonthly();
    const max = (await prisma.plan.findFirstOrThrow({ where: { productKey: KEY, code: "max" } })).id;
    expect(await (await call("quote", { planId: max, interval: "MONTHLY" })).json()).toMatchObject({ credit: 0, planPrice: 2000, total: 2360 });
  });
});

describe("payment-method calls", () => {
  it("lists nothing for a business with no methods, and refuses unsigned calls", async () => {
    expect(await (await call("methods", {})).json()).toEqual({ methods: [], nextChargeAt: null });
    expect((await call("methods", {}, null)).status).toBe(401);
    expect((await call("method-remove", { methodId: "pm_x" }, "wrong-secret-0123456789abcdef0123456789")).status).toBe(401);
  });

  it("owner-contact: the Account's phone and email replace what the product sent, and bad ones are refused", async () => {
    const res = await call("owner-contact", { phone: "+919845000111", email: "admin@account.test" });
    expect(res.status).toBe(200);
    expect(await prisma.business.findUnique({ where: { id: BIZ }, select: { ownerPhone: true, ownerEmail: true } })).toEqual({ ownerPhone: "+919845000111", ownerEmail: "admin@account.test" });
    expect((await call("owner-contact", { phone: "abc", email: "admin@account.test" })).status).toBe(400);
    expect((await call("owner-contact", { phone: "+919845000111", email: "nope" })).status).toBe(400);
    expect((await call("owner-contact", { phone: "+919845000111", email: "a@b.test" }, null)).status).toBe(401);
  });

  it("a paid sign-up is registered with no plan and no trial, and abandoning it keeps one Abandoned-orders row and removes the registration", async () => {
    const PENDING = `biz_${"e".repeat(32)}`;
    try {
      expect((await call("register-pending", { name: "Asha Rao", ownerName: "Asha Rao", ownerEmail: "asha@pending.test", ownerPhone: "+919800000123" }, BILLING_SECRET, PENDING)).status).toBe(200);
      expect(await prisma.business.findUnique({ where: { id: PENDING }, select: { name: true, ownerEmail: true, ownerPhone: true } })).toEqual({ name: "Asha Rao", ownerEmail: "asha@pending.test", ownerPhone: "+919800000123" });
      expect(await prisma.businessProduct.count({ where: { businessId: PENDING, productKey: KEY } })).toBe(1);
      expect(await prisma.subscription.count({ where: { businessId: PENDING } })).toBe(0); // no trial, no plan
      // a repeat for a business that already exists changes nothing: it never overwrites the name or owner details
      expect((await call("register-pending", { name: "Someone Else", ownerName: "Someone Else", ownerEmail: "other@pending.test", ownerPhone: "+919800000999" }, BILLING_SECRET, PENDING)).status).toBe(200);
      expect(await prisma.business.findUnique({ where: { id: PENDING }, select: { name: true, ownerEmail: true, ownerPhone: true } })).toEqual({ name: "Asha Rao", ownerEmail: "asha@pending.test", ownerPhone: "+919800000123" });
      // bad input and a wrong signature are refused
      expect((await call("register-pending", { name: "", ownerEmail: "x" }, BILLING_SECRET, PENDING)).status).toBe(400);
      expect((await call("register-pending", { name: "A", ownerEmail: "a@b.test" }, null, PENDING)).status).toBe(401);

      const gone = { name: "Asha Rao", email: "asha@pending.test", phone: "+919800000123", planCode: "premium", interval: "ANNUAL", step: "opened_store", signedUpAt: new Date().toISOString() };
      expect((await call("abandon-pending", gone, BILLING_SECRET, PENDING)).status).toBe(200);
      expect(await prisma.business.count({ where: { id: PENDING } })).toBe(0);
      expect(await prisma.abandonedOrder.findUnique({ where: { businessId: PENDING }, select: { email: true, planCode: true, interval: true, step: true, status: true } })).toEqual({ email: "asha@pending.test", planCode: "premium", interval: "ANNUAL", step: "opened_store", status: "OPEN" });
      // a repeat is harmless and still one row
      expect((await call("abandon-pending", gone, BILLING_SECRET, PENDING)).status).toBe(200);
      expect(await prisma.abandonedOrder.count({ where: { businessId: PENDING } })).toBe(1);
    } finally {
      await prisma.abandonedOrder.deleteMany({ where: { businessId: PENDING } });
      await prisma.business.deleteMany({ where: { id: PENDING } });
    }
  });

  it("abandoning is refused for a business that has a plan or a paid payment, and nothing is removed", async () => {
    const gone = { name: "O", email: "o@example.test", step: "payment_failed", signedUpAt: new Date().toISOString() };
    await prisma.subscription.create({ data: { id: newId("subscription"), businessId: BIZ, productKey: KEY, planId, status: "ACTIVE", startDate: new Date() } });
    expect((await call("abandon-pending", gone)).status).toBe(409);
    expect(await prisma.business.count({ where: { id: BIZ } })).toBe(1);
    expect(await prisma.abandonedOrder.count({ where: { businessId: BIZ } })).toBe(0);
  });

  it("add card: opens a Rs 5 registration, then saves the card and refunds the Rs 5", async () => {
    const started = (await (await call("method-add", {})).json()) as { keyId: string; razorpayOrderId: string; customerId: string; amountPaise: number };
    expect(started).toMatchObject({ keyId: KEY_ID, amountPaise: 500 });
    pays.pay_new = card("pay_new", "token_N", "9999", started.customerId);
    const res = await call("method-add-verify", { razorpayOrderId: started.razorpayOrderId, razorpayPaymentId: "pay_new", signature: orderSig(started.razorpayOrderId, "pay_new") });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, label: "Visa ending 9999" });
    expect(calls.some((c) => c.path === "/payments/pay_new/refund")).toBe(true);
    expect(((await (await call("methods", {})).json()) as { methods: unknown[] }).methods).toHaveLength(1);
  });

  it("make primary: a new subscription to authorise, then the switch on verify", async () => {
    const { subId } = await buyMonthly();
    const added = (await (await call("method-add", {})).json()) as { razorpayOrderId: string; customerId: string };
    pays.pay_new = card("pay_new", "token_B", "1111", added.customerId);
    await call("method-add-verify", { razorpayOrderId: added.razorpayOrderId, razorpayPaymentId: "pay_new", signature: orderSig(added.razorpayOrderId, "pay_new") });
    const second = ((await (await call("methods", {})).json()) as { methods: { id: string; label: string; isPrimary: boolean }[] }).methods.find((m) => !m.isPrimary)!;
    const started = (await (await call("method-primary", { methodId: second.id })).json()) as { razorpaySubscriptionId: string };
    expect(started.razorpaySubscriptionId).toMatch(/^sub_M/);
    rz[started.razorpaySubscriptionId].status = "authenticated";
    pays.pay_auth = card("pay_auth", "token_B", "1111", added.customerId);
    const res = await call("method-primary-verify", { razorpaySubscriptionId: started.razorpaySubscriptionId, razorpayPaymentId: "pay_auth", signature: subSig(started.razorpaySubscriptionId, "pay_auth") });
    expect(res.status).toBe(200);
    expect(await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, endDate: null } })).toMatchObject({ razorpaySubscriptionId: started.razorpaySubscriptionId });
    expect(rz[subId].status).toBe("cancelled");
    const list = ((await (await call("methods", {})).json()) as { methods: { label: string; isPrimary: boolean }[] }).methods;
    expect(list.map((m) => [m.label, m.isPrimary])).toEqual([["Visa ending 1111", true], ["Visa ending 4366", false]]);
  });

  it("remove: the primary is refused with a message for the person; a secondary goes", async () => {
    await buyMonthly();
    const added = (await (await call("method-add", {})).json()) as { razorpayOrderId: string; customerId: string };
    pays.pay_new = card("pay_new", "token_B", "1111", added.customerId);
    await call("method-add-verify", { razorpayOrderId: added.razorpayOrderId, razorpayPaymentId: "pay_new", signature: orderSig(added.razorpayOrderId, "pay_new") });
    const list = ((await (await call("methods", {})).json()) as { methods: { id: string; isPrimary: boolean }[] }).methods;
    const refused = await call("method-remove", { methodId: list.find((m) => m.isPrimary)!.id });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/primary/);
    expect((await call("method-remove", { methodId: list.find((m) => !m.isPrimary)!.id })).status).toBe(200);
    expect(await prisma.paymentMethod.count({ where: { businessId: BIZ } })).toBe(1);
  });

  it("a bad body is a plain 400, and a method of another business is not found", async () => {
    expect((await call("method-primary", {})).status).toBe(400);
    expect((await call("method-remove", { methodId: "../x" })).status).toBe(400);
    expect((await call("method-add-verify", { nonsense: true })).status).toBe(400);
    expect((await call("method-primary-verify", { nonsense: true })).status).toBe(400);
    expect((await call("method-remove", { methodId: "pm_notmine" })).status).toBe(400);
  });
});

describe("auto-renewal calls: pause, resume, stop", () => {
  const state = () => prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, endDate: null } });

  it("pause stops future charges only, resume turns them back on, and the paid days are untouched", async () => {
    const { subId } = await buyMonthly();
    const before = await state();
    expect((await call("autopay-pause", {})).status).toBe(200);
    expect(rz[subId].status).toBe("paused");
    expect(await state()).toMatchObject({ autoPay: "PAUSED", status: "ACTIVE" });
    expect((await state()).currentPeriodEnd).toEqual(before.currentPeriodEnd);
    expect((await call("autopay-resume", {})).status).toBe(200);
    expect(rz[subId].status).toBe("active");
    expect(await state()).toMatchObject({ autoPay: "ACTIVE" });
  });

  it("stop cancels the Razorpay subscription for good, keeps the paid days, and cannot be resumed", async () => {
    const { subId } = await buyMonthly();
    expect((await call("autopay-cancel", {})).status).toBe(200);
    expect(rz[subId].status).toBe("cancelled");
    expect(await state()).toMatchObject({ autoPay: "CANCELLED", status: "ACTIVE" });
    expect((await call("autopay-resume", {})).status).toBe(400);
  });

  it("answers with a message for the person when there is nothing to change, and 401 when unsigned", async () => {
    const refused = await call("autopay-pause", {});
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/auto-pay/i);
    expect((await call("autopay-pause", {}, null)).status).toBe(401);
    expect((await call("autopay-cancel", {}, null)).status).toBe(401);
  });
});
