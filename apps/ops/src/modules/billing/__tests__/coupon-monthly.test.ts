import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders, type Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { chargeAutoPay, quoteCheckout, startAutoPayCheckout, verifyAutoPayCheckout } from "../billing";
import { createCoupon, findUsableCoupon } from "../coupons";
import { POST as webhookPOST } from "@/app/api/webhooks/razorpay/route";

/**
 * A coupon on a MONTHLY plan (slice C4, AJ 2026-11-14): first payment only. Ops starts the Razorpay subscription one cycle later and puts the discounted first month in
 * as an add-on, which Razorpay charges when the owner authorises; the full price then renews from the start date. Real Razorpay test checkout showed exactly this
 * ("a payment of Rs 3,186 will be charged now ... then Rs 3,540 every month").
 */
const KEY = "cpnmonthly";
const DAY = 86_400_000;
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const WEBHOOK_SECRET = "razorpay_webhook_secret";
const manifest = { contract: 1, productKey: KEY, name: "Coupon Monthly", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: null };

let server: Server;
let baseUrl = "";
let inboundSecret = "";
const savedEnv: Record<string, string | undefined> = {};
let calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
let rz: Record<string, { status: string; current_start: number | null; current_end: number | null; start_at: number | null }> = {};
let inv: Record<string, { status: string; payment_id: string | null }[]> = {};
let counter = 0;
const realFetch = globalThis.fetch;
function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    const path = url.slice("https://api.razorpay.com/v1".length);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: init?.method ?? "GET", path, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/plans") return json({ id: `plan_T${++counter}` });
    if (path === "/customers") return json({ id: `cust_T${++counter}` });
    if (path === "/subscriptions") {
      const id = `sub_T${++counter}`;
      rz[id] = { status: "created", current_start: null, current_end: null, start_at: (body?.start_at as number | undefined) ?? null };
      return json({ id, ...rz[id] });
    }
    const invoices = path.match(/^\/invoices\?subscription_id=(sub_\w+)$/);
    if (invoices) return json({ items: inv[invoices[1]] ?? [] });
    const m = path.match(/^\/subscriptions\/(sub_\w+)(?:\/(cancel|pause|resume))?$/);
    if (m && rz[m[1]]) return json({ id: m[1], ...rz[m[1]] });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}
const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const subSig = (subId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${payId}|${subId}`).digest("hex");
const newBiz = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;
const startedAt = new Date();

async function clean() {
  await prisma.razorpayEvent.deleteMany({ where: { receivedAt: { gte: startedAt } } });
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.coupon.deleteMany({ where: { code: { startsWith: "CM" } } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.razorpayPlan.deleteMany({ where: { plan: { productKey: KEY } } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "CpnMonthly" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
async function setup() {
  const pro = await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 3000, priceAnnual: 33000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
  const id = newBiz();
  await prisma.business.create({ data: { id, name: "CpnMonthly Kitchen", ownerEmail: "o@example.test", ownerPhone: "9845671203", ownerName: "O", products: { create: { productKey: KEY } } } });
  return { pro, biz: id };
}
const monthly = (biz: string, planId: string, couponCode?: string) => ({ businessId: biz, productKey: KEY, planId, interval: "MONTHLY" as const, couponCode });

beforeAll(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) savedEnv[k] = process.env[k];
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const reply = JSON.stringify({ ok: true });
      res.writeHead(200, signedHeaders(inboundSecret, newId("command"), reply));
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await clean();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(async () => {
  await clean();
  calls = [];
  rz = {};
  inv = {};
  counter = 0;
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  const { secrets } = await registerProduct({ key: KEY, name: "Coupon Monthly", baseUrl, actorUserId: null });
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: {} });
});
afterEach(clean);

describe("a coupon on a monthly plan", () => {
  it("the quote shows the discounted first month, and what it renews at afterwards", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CM-TEN", kind: "PERCENT", value: 10 });
    const quote = await quoteCheckout(monthly(biz, pro.id, "cm-ten"));
    expect(quote).toMatchObject({ interval: "MONTHLY", planPrice: 3000, couponCode: "CM-TEN", discount: 300, amount: 2700, gstAmount: 486, total: 3186, renewalTotal: 3540 });
    expect(new Date(quote.renewalFrom!).getTime() - Date.now()).toBeGreaterThan(29 * DAY);
    expect(new Date(quote.renewalFrom!).getTime() - Date.now()).toBeLessThan(31 * DAY);
    const plain = await quoteCheckout(monthly(biz, pro.id));
    expect(plain).toMatchObject({ discount: 0, couponCode: null, total: 3540, renewalTotal: null, renewalFrom: null });
  });

  it("starts the subscription one cycle later with the discounted first month as an add-on, and records the coupon on the pending payment", async () => {
    const { pro, biz } = await setup();
    const coupon = await createCoupon({ code: "CM-TEN", kind: "PERCENT", value: 10 });
    const a = await startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-TEN"), buyer });
    const create = calls.find((c) => c.path === "/subscriptions")!.body!;
    expect(create.start_at as number).toBeGreaterThan(secs(new Date()) + 29 * 86400);
    expect(create.start_at as number).toBeLessThan(secs(new Date()) + 31 * 86400);
    expect(create.addons).toEqual([{ item: { name: expect.stringContaining("CM-TEN"), amount: 318600, currency: "INR" } }]);
    // The Razorpay plan keeps the FULL price, so renewals charge it.
    expect((calls.find((c) => c.path === "/plans")!.body!.item as { amount: number }).amount).toBe(354000);
    expect(a).toMatchObject({ kind: "subscription", amountPaise: 318600 });
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: a.razorpaySubscriptionId } });
    expect(payment).toMatchObject({ status: "PENDING", interval: "MONTHLY", couponId: coupon.id });
    expect([Number(payment.amount), Number(payment.gstAmount), Number(payment.total), Number(payment.couponDiscount)]).toEqual([2700, 486, 3186, 300]);
  });

  it("without a coupon nothing changes: no add-on, no delayed start, the plan's price now", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ ...monthly(biz, pro.id), buyer });
    const create = calls.find((c) => c.path === "/subscriptions")!.body!;
    expect(create.addons).toBeUndefined();
    expect(create.start_at).toBeUndefined();
    expect(a.amountPaise).toBe(354000);
  });

  it("verifying the authorised checkout settles the discounted first month: one invoice, auto-pay ACTIVE, paid until the renewal date", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CM-TEN", kind: "PERCENT", value: 10 });
    const a = await startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-TEN"), buyer });
    const startAt = rz[a.razorpaySubscriptionId].start_at!;
    rz[a.razorpaySubscriptionId].status = "authenticated";
    inv[a.razorpaySubscriptionId] = [{ status: "paid", payment_id: "pay_addon" }];
    const paid = await verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_window", signature: subSig(a.razorpaySubscriptionId, "pay_window") });
    expect(paid).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_addon" });
    expect(Number(paid!.total)).toBe(3186);
    expect(paid!.invoiceNumber).toBeTruthy();
    expect(paid!.periodEnd!.getTime()).toBe(startAt * 1000);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub).toMatchObject({ status: "ACTIVE", billingInterval: "MONTHLY", razorpaySubscriptionId: a.razorpaySubscriptionId, autoPay: "ACTIVE" });
    expect(sub.currentPeriodEnd!.getTime()).toBe(startAt * 1000);
    // Verifying twice changes nothing.
    await verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_window", signature: subSig(a.razorpaySubscriptionId, "pay_window") });
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz, status: "PAID" } })).toBe(1);
  });

  it("the first renewal charges the FULL price, never the discounted one, and renews the same subscription in place", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CM-TEN", kind: "PERCENT", value: 10 });
    const a = await startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-TEN"), buyer });
    const startAt = rz[a.razorpaySubscriptionId].start_at!;
    rz[a.razorpaySubscriptionId].status = "authenticated";
    inv[a.razorpaySubscriptionId] = [{ status: "paid", payment_id: "pay_addon" }];
    await verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_window", signature: subSig(a.razorpaySubscriptionId, "pay_window") });
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_renew", periodStart: new Date(startAt * 1000), periodEnd: new Date((startAt + 30 * 86400) * 1000), capturedPaise: 354000 });
    const payments = await prisma.subscriptionPayment.findMany({ where: { businessId: biz, status: "PAID" }, orderBy: { paidAt: "asc" } });
    expect(payments.map((p) => Number(p.total))).toEqual([3186, 3540]);
    expect(payments[1]).toMatchObject({ couponId: null, couponDiscount: null });
    expect([Number(payments[1].amount), Number(payments[1].gstAmount)]).toEqual([3000, 540]);
    expect(await prisma.subscription.count({ where: { businessId: biz } })).toBe(1);
  });

  it("the invoice.paid webhook settles the first month when the browser closed before verifying", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CM-TEN", kind: "PERCENT", value: 10 });
    const a = await startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-TEN"), buyer });
    rz[a.razorpaySubscriptionId].status = "authenticated";
    const body = JSON.stringify({ event: "invoice.paid", payload: { invoice: { entity: { subscription_id: a.razorpaySubscriptionId, payment_id: "pay_addon", amount_paid: 318600 } } } });
    const res = await webhookPOST(new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex") } }));
    expect(res.status).toBe(200);
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: a.razorpaySubscriptionId } });
    expect(payment).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_addon" });
    expect(await prisma.subscription.count({ where: { businessId: biz, autoPay: "ACTIVE" } })).toBe(1);
    // A webhook for an amount that is not this payment settles nothing.
    const { pro: pro2, biz: biz2 } = await setup2();
    await createCoupon({ code: "CM-TWO", kind: "PERCENT", value: 10 });
    const b = await startAutoPayCheckout({ ...monthly(biz2, pro2.id, "CM-TWO"), buyer });
    const wrong = JSON.stringify({ event: "invoice.paid", payload: { invoice: { entity: { subscription_id: b.razorpaySubscriptionId, payment_id: "pay_x", amount_paid: 1 } } } });
    await webhookPOST(new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body: wrong, headers: { "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(wrong).digest("hex") } }));
    expect((await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: b.razorpaySubscriptionId } })).status).toBe("PENDING");
  });

  it("a coupon that makes the first month free is refused, and a used-up code is refused at checkout, starting nothing", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CM-FREE", kind: "PERCENT", value: 100 });
    await expect(startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-FREE"), buyer })).rejects.toThrow(/covers this plan|contact Platterly/i);
    await createCoupon({ code: "CM-ONE", kind: "PERCENT", value: 10, maxUses: 1 });
    const one = await prisma.coupon.findUniqueOrThrow({ where: { code: "CM-ONE" } });
    const other = newBiz();
    await prisma.business.create({ data: { id: other, name: "CpnMonthly Other", ownerEmail: "p@example.test", ownerName: "P", products: { create: { productKey: KEY } } } });
    await prisma.subscriptionPayment.create({ data: { id: "pay_cmone", businessId: other, productKey: KEY, planId: pro.id, interval: "MONTHLY", amount: 2700, gstPercent: 18, gstAmount: 486, total: 3186, status: "PAID", couponId: one.id, couponDiscount: 300 } });
    await expect(startAutoPayCheckout({ ...monthly(biz, pro.id, "CM-ONE"), buyer })).rejects.toThrow("This coupon has been used up.");
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz } })).toBe(0);
    expect(calls.filter((c) => c.path === "/subscriptions")).toHaveLength(0);
    await expect(findUsableCoupon({ code: "CM-ONE", productKey: KEY, businessId: biz, now: new Date() })).rejects.toThrow("used up");
  });
});

async function setup2() {
  const pro = await prisma.plan.findFirstOrThrow({ where: { productKey: KEY, code: "pro" } });
  const id = newBiz();
  await prisma.business.create({ data: { id, name: "CpnMonthly Second", ownerEmail: "q@example.test", ownerPhone: "9845671204", ownerName: "Q", products: { create: { productKey: KEY } } } });
  return { pro, biz: id };
}
