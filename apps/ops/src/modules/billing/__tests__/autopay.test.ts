import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders, type Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { cancelRazorpaySubscription, createRazorpayPlan, createRazorpaySubscription, pauseRazorpaySubscription, resumeRazorpaySubscription, verifySubscriptionSignature, type PlatformRazorpay } from "../razorpay";
import { chargeAutoPay, confirmPayment, failAutoPayCheckout, startAutoPayCheckout, startCheckout, verifyAutoPayCheckout } from "../billing";

const KEY = "autopaytest";
const DAY = 86_400_000;
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const WEBHOOK_SECRET = "razorpay_webhook_secret";
const creds: PlatformRazorpay = { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET };
const manifest = { contract: 1, productKey: KEY, name: "AutoPay Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };

let server: Server;
let baseUrl = "";
let inboundSecret = "";
const savedEnv: Record<string, string | undefined> = {};
let profileBefore: Awaited<ReturnType<typeof prisma.platformBillingProfile.findUnique>>;

/** Razorpay as the tests see it: every call recorded, subscriptions kept in `rz` so a test can set their dates and status. */
let calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
let rz: Record<string, { status: string; current_start: number | null; current_end: number | null }> = {};
let counter = 0;
const realFetch = globalThis.fetch;
function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    const path = url.slice("https://api.razorpay.com/v1".length);
    calls.push({ method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (path === "/plans") return json({ id: `plan_T${++counter}` });
    if (path === "/orders") return json({ id: `order_T${++counter}` });
    if (path === "/subscriptions") {
      const id = `sub_T${++counter}`;
      rz[id] = { status: "created", current_start: null, current_end: null };
      return json({ id, ...rz[id] });
    }
    const m = path.match(/^\/subscriptions\/(sub_\w+)(?:\/(cancel|pause|resume))?$/);
    if (m && rz[m[1]]) {
      if (m[2]) rz[m[1]].status = { cancel: "cancelled", pause: "paused", resume: "active" }[m[2]]!;
      return json({ id: m[1], ...rz[m[1]] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const businessId = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.razorpayPlan.deleteMany({ where: { plan: { productKey: KEY } } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "AutoPayTest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

async function setup() {
  const pro = await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 3000, priceAnnual: 33000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
  const lite = await createPlan({ productKey: KEY, code: "lite", name: "Lite", isTrial: false, priceMonthly: 1000, priceAnnual: null, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 10 } }, null);
  const id = businessId();
  await prisma.business.create({ data: { id, name: "AutoPayTest Kitchen", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  return { pro, lite, biz: id };
}

beforeAll(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) savedEnv[k] = process.env[k];
  profileBefore = await prisma.platformBillingProfile.findUnique({ where: { id: "platform" } });
  // The product's own address: snapshots after each charge land here and are answered as delivered.
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
  if (profileBefore) await prisma.platformBillingProfile.update({ where: { id: "platform" }, data: { ...profileBefore, updatedAt: undefined } });
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
  counter = 0;
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  const { secrets } = await registerProduct({ key: KEY, name: "AutoPay Test", baseUrl, actorUserId: null });
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: { legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" } });
});
afterEach(clean);

describe("the Razorpay client", () => {
  it("makes a plan that bills every 30 days for the price with GST, and a subscription on it", async () => {
    expect(await createRazorpayPlan(creds, { name: "Pro (every 30 days)", amountPaise: 354000 })).toEqual({ id: "plan_T1" });
    expect(calls[0]).toEqual({ method: "POST", path: "/plans", body: { period: "daily", interval: 30, item: { name: "Pro (every 30 days)", amount: 354000, currency: "INR" } } });
    const startAt = new Date("2026-11-22T00:00:00Z");
    const sub = await createRazorpaySubscription(creds, { razorpayPlanId: "plan_T1", startAt, notes: { businessId: "b" } });
    expect(sub.id).toBe("sub_T2");
    expect(calls[1].body).toEqual({ plan_id: "plan_T1", total_count: 120, customer_notify: 1, start_at: secs(startAt), notes: { businessId: "b" } });
  });

  it("pauses, resumes and cancels (now or at the end of the cycle)", async () => {
    const { id } = await createRazorpaySubscription(creds, { razorpayPlanId: "plan_X", notes: {} });
    await pauseRazorpaySubscription(creds, id);
    await resumeRazorpaySubscription(creds, id);
    await cancelRazorpaySubscription(creds, id, true);
    expect(calls.slice(1).map((c) => [c.path, c.body])).toEqual([[`/subscriptions/${id}/pause`, { pause_at: "now" }], [`/subscriptions/${id}/resume`, { resume_at: "now" }], [`/subscriptions/${id}/cancel`, { cancel_at_cycle_end: 1 }]]);
  });

  it("checks the auto-pay checkout signature: HMAC of payment id | subscription id", () => {
    const signature = createHmac("sha256", KEY_SECRET).update("pay_1|sub_1").digest("hex");
    expect(verifySubscriptionSignature({ razorpaySubscriptionId: "sub_1", razorpayPaymentId: "pay_1", signature }, KEY_SECRET)).toBe(true);
    expect(verifySubscriptionSignature({ razorpaySubscriptionId: "sub_2", razorpayPaymentId: "pay_1", signature }, KEY_SECRET)).toBe(false);
  });
});

const subSig = (subId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${payId}|${subId}`).digest("hex");
/** Razorpay has charged: the subscription's current cycle is [start, start + 30 days). */
const cycle = (subId: string, start: Date) => {
  rz[subId] = { status: "active", current_start: secs(start), current_end: secs(new Date(start.getTime() + 30 * DAY)) };
  return { periodStart: new Date(secs(start) * 1000), periodEnd: new Date(rz[subId].current_end! * 1000) };
};

describe("auto-pay checkout and charges", () => {
  it("refuses auto-pay without the webhook secret (every renewal would be lost)", async () => {
    const { pro, biz } = await setup();
    process.env.RAZORPAY_WEBHOOK_SECRET = "";
    await expect(startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer })).rejects.toThrow(/Auto-pay is not switched on yet/);
    expect(calls).toHaveLength(0);
  });

  it("starts a subscription on a Razorpay plan made once per plan and price, with a PENDING payment", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(a).toMatchObject({ kind: "subscription", keyId: KEY_ID, razorpaySubscriptionId: "sub_T2", amountPaise: 354000, startsAt: null });
    await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(calls.filter((c) => c.path === "/plans")).toHaveLength(1);
    await prisma.plan.update({ where: { id: pro.id }, data: { priceMonthly: 3500 } });
    const last = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(calls.filter((c) => c.path === "/plans").map((c) => (c.body!.item as { amount: number }).amount)).toEqual([354000, 413000]);
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: last.razorpaySubscriptionId } });
    expect(payment).toMatchObject({ status: "PENDING", interval: "MONTHLY", razorpayOrderId: null });
  });

  it("verifying the first charge: one payment, one invoice, Razorpay's dates, auto-pay ACTIVE", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const { periodEnd } = cycle(a.razorpaySubscriptionId, new Date());
    await expect(verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", signature: "0".repeat(64) })).rejects.toThrow(/could not verify/);
    const paid = await verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", signature: subSig(a.razorpaySubscriptionId, "pay_1") });
    expect(paid).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_1" });
    expect(paid!.invoiceNumber).toBeTruthy();
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub).toMatchObject({ status: "ACTIVE", planId: pro.id, billingInterval: "MONTHLY", razorpaySubscriptionId: a.razorpaySubscriptionId, autoPay: "ACTIVE" });
    expect(sub.currentPeriodEnd!.getTime()).toBe(periodEnd.getTime());
  });

  it("a later charge is a new payment that renews the same subscription in place; the same charge twice changes nothing", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const first = cycle(a.razorpaySubscriptionId, new Date());
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...first });
    const second = cycle(a.razorpaySubscriptionId, first.periodEnd);
    await Promise.allSettled([
      chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_2", ...second, capturedPaise: 354000 }),
      chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_2", ...second, capturedPaise: 354000 }),
    ]);
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_2", ...second });
    const paid = await prisma.subscriptionPayment.findMany({ where: { businessId: biz, status: "PAID" }, orderBy: { paidAt: "asc" } });
    expect(paid.map((p) => p.razorpayPaymentId)).toEqual(["pay_1", "pay_2"]);
    expect(new Set(paid.map((p) => p.invoiceNumber)).size).toBe(2);
    const subs = await prisma.subscription.findMany({ where: { businessId: biz } });
    expect(subs).toHaveLength(1);
    expect(subs[0].currentPeriodEnd!.getTime()).toBe(second.periodEnd.getTime());
  });

  it("an unknown subscription or a wrong amount records nothing", async () => {
    const { pro, biz } = await setup();
    expect(await chargeAutoPay({ razorpaySubscriptionId: "sub_nope", razorpayPaymentId: "pay_9", periodStart: new Date(), periodEnd: new Date() })).toBeNull();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...cycle(a.razorpaySubscriptionId, new Date()), capturedPaise: 5 })).toBeNull();
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz, status: "PAID" } })).toBe(0);
  });

  it("a kitchen already paid once on the same plan keeps its days: Razorpay starts charging when they end", async () => {
    const { pro, biz } = await setup();
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    const once = await confirmPayment(razorpayOrderId, "pay_once");
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(a.startsAt).toBe(once!.periodEnd!.toISOString());
    expect(calls.find((c) => c.path === "/subscriptions")!.body).toMatchObject({ start_at: secs(once!.periodEnd!) });
    // Only the mandate now: Razorpay has no cycle yet.
    await verifyAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_auth", signature: subSig(a.razorpaySubscriptionId, "pay_auth") });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub).toMatchObject({ razorpaySubscriptionId: a.razorpaySubscriptionId, autoPay: "ACTIVE" });
    expect(sub.currentPeriodEnd!.getTime()).toBe(once!.periodEnd!.getTime());
    // The first real charge renews it in place with Razorpay's dates.
    const next = cycle(a.razorpaySubscriptionId, once!.periodEnd!);
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_c1", ...next });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).currentPeriodEnd!.getTime()).toBe(next.periodEnd.getTime());
  });

  it("refuses a second auto-pay on the plan it is already on", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...cycle(a.razorpaySubscriptionId, new Date()) });
    await expect(startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer })).rejects.toThrow(/already on/);
  });

  it("upgrade: the old auto-pay is cancelled only once the new first charge succeeds", async () => {
    const { pro, lite, biz } = await setup();
    const old = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: lite.id, buyer });
    await chargeAutoPay({ razorpaySubscriptionId: old.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...cycle(old.razorpaySubscriptionId, new Date()) });
    const up = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(false); // abandoned checkout: nothing touched
    await chargeAutoPay({ razorpaySubscriptionId: up.razorpaySubscriptionId, razorpayPaymentId: "pay_2", ...cycle(up.razorpaySubscriptionId, new Date()) });
    expect(calls.find((c) => c.path.endsWith("/cancel"))).toEqual({ method: "POST", path: `/subscriptions/${old.razorpaySubscriptionId}/cancel`, body: { cancel_at_cycle_end: 0 } });
    const current = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(current).toMatchObject({ planId: pro.id, razorpaySubscriptionId: up.razorpaySubscriptionId });
  });

  it("monthly to yearly: the yearly order renews on top and the monthly auto-pay stops", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...cycle(a.razorpaySubscriptionId, new Date()) });
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "ANNUAL", buyer });
    await confirmPayment(razorpayOrderId, "pay_year");
    expect(calls.some((c) => c.path === `/subscriptions/${a.razorpaySubscriptionId}/cancel`)).toBe(true);
    expect(await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } })).toMatchObject({ billingInterval: "ANNUAL", razorpaySubscriptionId: null, autoPay: null });
  });
});

describe("failed or unfinished auto-pay setup", () => {
  it("records the failure on the PENDING payment and leaves the plan and its days alone", async () => {
    const { pro, biz } = await setup();
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await confirmPayment(razorpayOrderId, "pay_once");
    const before = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const failed = await failAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, reason: "declined", detail: "Bank declined it." });
    expect(failed).toMatchObject({ status: "FAILED", failureReason: "declined", razorpaySubscriptionId: a.razorpaySubscriptionId });
    const after = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(after).toMatchObject({ id: before.id, status: "ACTIVE", razorpaySubscriptionId: null, autoPay: null });
    expect(after.currentPeriodEnd!.getTime()).toBe(before.currentPeriodEnd!.getTime());
  });

  it("ignores another business's subscription and never touches a PAID payment", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const other = businessId();
    await prisma.business.create({ data: { id: other, name: "AutoPayTest Other", ownerEmail: "p@example.test", ownerName: "P", products: { create: { productKey: KEY } } } });
    expect(await failAutoPayCheckout({ businessId: other, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, reason: "declined" })).toBeNull();
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_1", ...cycle(a.razorpaySubscriptionId, new Date()) });
    expect(await failAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, reason: "not_finished" })).toBeNull();
    expect(await prisma.subscriptionPayment.findMany({ where: { businessId: biz }, select: { status: true, failureReason: true } })).toEqual([{ status: "PAID", failureReason: null }]);
  });

  it("a charge that arrives after the failure report still pays (the kitchen tried again in the same window)", async () => {
    const { pro, biz } = await setup();
    const a = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    await failAutoPayCheckout({ businessId: biz, productKey: KEY, razorpaySubscriptionId: a.razorpaySubscriptionId, reason: "declined" });
    await chargeAutoPay({ razorpaySubscriptionId: a.razorpaySubscriptionId, razorpayPaymentId: "pay_2", ...cycle(a.razorpaySubscriptionId, new Date()) });
    expect(await prisma.subscriptionPayment.findMany({ where: { businessId: biz }, select: { status: true, razorpayPaymentId: true } })).toEqual([{ status: "PAID", razorpayPaymentId: "pay_2" }]);
  });

  it("a new checkout cancels the previous setup that was never paid, and marks it not finished", async () => {
    const { pro, biz } = await setup();
    const first = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const cancel = calls.findIndex((c) => c.path === `/subscriptions/${first.razorpaySubscriptionId}/cancel`);
    expect(calls[cancel]?.body).toEqual({ cancel_at_cycle_end: 0 });
    expect(cancel).toBeLessThan(calls.map((c) => c.path).lastIndexOf("/subscriptions"));
    expect(await prisma.subscriptionPayment.findFirstOrThrow({ where: { razorpaySubscriptionId: first.razorpaySubscriptionId } })).toMatchObject({ status: "FAILED", failureReason: "not_finished" });
  });

  it("leaves a previous setup alone once Razorpay says it went through (its charge is on the way)", async () => {
    const { pro, biz } = await setup();
    const first = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    rz[first.razorpaySubscriptionId].status = "active";
    await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(false);
  });

  it("a cancel Razorpay refuses raises an Ops alert and the new checkout still goes ahead", async () => {
    const { pro, biz } = await setup();
    const first = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    const fake = fakeRazorpay();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith("/cancel") ? new Response("no", { status: 500 }) : fake(input, init))) as typeof fetch);
    const second = await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer });
    expect(second.razorpaySubscriptionId).not.toBe(first.razorpaySubscriptionId);
    expect(await prisma.notification.count({ where: { productKey: KEY, kind: "autopay.stop_failed" } })).toBe(1);
  });
});
