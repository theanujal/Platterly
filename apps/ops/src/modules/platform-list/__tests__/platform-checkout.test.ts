import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, platformCheckoutPath, requestTarget, signedHeaders, verifyRequest, type Buyer, type PlatformBillingAction } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { unusedCredit } from "@/modules/billing/math";
import { failPayment } from "@/modules/billing/billing";
import { renderPaymentInvoice } from "@/modules/billing/invoice-pdf";
import { buildBusinessBilling } from "./../platform-plans";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { POST as checkoutPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/checkout/route";
import { POST as verifyPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/verify/route";
import { POST as quotePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/quote/route";
import { POST as downgradePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/downgrade/route";
import { POST as undoDowngradePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/undo-downgrade/route";
import { POST as cancelPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/cancel/route";
import { POST as reactivatePOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/reactivate/route";

// The Store's buy calls (Platform to Ops). Runs against the dev database with its own product and business, removed afterwards; Razorpay is a stand-in.
const KEY = "plrbuy";
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const BILLING_SECRET = "platform-billing-secret-0123456789abcdef0123";
const READER_LIKE_SECRET = "platform-reader-secret-0123456789abcdef01234";
const manifest = { contract: 1, productKey: KEY, name: "Bill Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };

let server: Server;
let baseUrl = "";
let inboundSecret = "";
let razorpayCounter = 0;
const savedEnv: Record<string, string | undefined> = {};
let profileBefore: Awaited<ReturnType<typeof prisma.platformBillingProfile.findUnique>>;
const realFetch = globalThis.fetch;
const BIZ = `biz_${"e".repeat(32)}`;
const OTHER = `biz_${"f".repeat(32)}`;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "PlrBuy" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    return new Response(JSON.stringify({ id: `order_P${++razorpayCounter}` }), { status: 200 });
  }) as typeof fetch;
}

const call = (action: PlatformBillingAction, biz: string, body: unknown, secret: string | null = BILLING_SECRET, key = KEY) => {
  const text = JSON.stringify(body);
  const url = `http://127.0.0.1:3200${platformCheckoutPath(biz, key, action)}`;
  const request = new Request(url, { method: "POST", headers: secret === null ? {} : signedHeaders(secret, newId("command"), text, { target: requestTarget("POST", url) }), body: text });
  const handler = { checkout: checkoutPOST, verify: verifyPOST, quote: quotePOST, downgrade: downgradePOST, "undo-downgrade": undoDowngradePOST, cancel: cancelPOST, reactivate: reactivatePOST }[action];
  return handler(request, { params: Promise.resolve({ businessId: biz, productKey: key }) });
};
const razorpaySig = (orderId: string, paymentId: string) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

beforeAll(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "PLATFORM_BILLING_SECRETS"]) savedEnv[k] = process.env[k];
  profileBefore = await prisma.platformBillingProfile.findUnique({ where: { id: "platform" } });
  server = createServer((req, res) => {
    req.on("data", () => {});
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
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.PLATFORM_BILLING_SECRETS = BILLING_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  const { secrets } = await registerProduct({ key: KEY, name: "Plr Buy", baseUrl, actorUserId: null });
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: { legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" } });
  await prisma.business.create({ data: { id: BIZ, name: "PlrBuy Spice Route", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  await createPlan({ productKey: KEY, code: "max", name: "Max", isTrial: false, priceMonthly: 2000, priceAnnual: 20000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 1000 } }, null);
  await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 1000, priceAnnual: 10000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
});
afterEach(clean);

const planIdOf = async (code: string) => (await prisma.plan.findFirstOrThrow({ where: { productKey: KEY, code } })).id;
const planId = async () => (await prisma.plan.findFirstOrThrow({ where: { productKey: KEY, code: "pro" } })).id;

describe("Store buy calls: who may make them", () => {
  it("answers 401 to an unsigned call, a call signed with the wrong secret (including a read-only-style secret), and when no billing secret is set", async () => {
    const body = { planId: await planId(), interval: "ANNUAL", buyer };
    expect((await call("checkout", BIZ, body, null)).status).toBe(401);
    expect((await call("checkout", BIZ, body, READER_LIKE_SECRET)).status).toBe(401);
    process.env.PLATFORM_BILLING_SECRETS = "too-short";
    expect((await call("checkout", BIZ, body)).status).toBe(401);
    delete process.env.PLATFORM_BILLING_SECRETS;
    expect((await call("checkout", BIZ, body)).status).toBe(401);
    expect(await prisma.subscriptionPayment.count({ where: { productKey: KEY } })).toBe(0);
  });

  it("a signature made for one business's route does not work on another's", async () => {
    const text = JSON.stringify({ planId: await planId(), interval: "ANNUAL", buyer });
    const signedForOther = new Request(`http://127.0.0.1:3200${platformCheckoutPath(BIZ, KEY, "checkout")}`, {
      method: "POST",
      headers: signedHeaders(BILLING_SECRET, newId("command"), text, { target: requestTarget("POST", `http://127.0.0.1:3200${platformCheckoutPath(OTHER, KEY, "checkout")}`) }),
      body: text,
    });
    expect((await checkoutPOST(signedForOther, { params: Promise.resolve({ businessId: BIZ, productKey: KEY }) })).status).toBe(401);
  });

  it("a business that is not registered for the product is 404, not someone else's checkout", async () => {
    const res = await call("checkout", OTHER, { planId: await planId(), interval: "ANNUAL", buyer });
    expect(res.status).toBe(404);
    expect(await prisma.subscriptionPayment.count({ where: { productKey: KEY } })).toBe(0);
  });
});

describe("Store buy calls: checkout and verify", () => {
  it("checkout creates a Razorpay order and a pending payment, and the signed answer carries the request's id", async () => {
    const body = { planId: await planId(), interval: "ANNUAL", buyer };
    const text = JSON.stringify(body);
    const url = `http://127.0.0.1:3200${platformCheckoutPath(BIZ, KEY, "checkout")}`;
    const id = newId("command");
    const res = await checkoutPOST(new Request(url, { method: "POST", headers: signedHeaders(BILLING_SECRET, id, text, { target: requestTarget("POST", url) }), body: text }), { params: Promise.resolve({ businessId: BIZ, productKey: KEY }) });
    expect(res.status).toBe(200);
    const answer = (await res.json()) as { kind: string; keyId: string; razorpayOrderId: string; amountPaise: number };
    expect(answer).toMatchObject({ kind: "order", keyId: KEY_ID, amountPaise: 1180000 });
    const pending = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: answer.razorpayOrderId } });
    expect(pending).toMatchObject({ businessId: BIZ, productKey: KEY, status: "PENDING", interval: "ANNUAL" });
    expect((pending.buyer as unknown as Buyer).name).toBe(buyer.name);
  });

  it("a monthly request with autoPay set is still a one-time order (auto-pay is not offered in the Store yet)", async () => {
    const res = await call("checkout", BIZ, { planId: await planId(), interval: "MONTHLY", buyer, autoPay: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { kind: string }).kind).toBe("order");
  });

  it("verify confirms a real Razorpay signature once, issues the invoice and makes the plan ACTIVE; a wrong signature changes nothing", async () => {
    const checkout = (await (await call("checkout", BIZ, { planId: await planId(), interval: "ANNUAL", buyer })).json()) as { razorpayOrderId: string };
    const orderId = checkout.razorpayOrderId;
    const bad = await call("verify", BIZ, { razorpayOrderId: orderId, razorpayPaymentId: "pay_1", signature: "0".repeat(64) });
    expect(bad.status).toBe(400);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: orderId } })).status).toBe("PENDING");

    const ok = await call("verify", BIZ, { razorpayOrderId: orderId, razorpayPaymentId: "pay_1", signature: razorpaySig(orderId, "pay_1") });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "PAID" });
    expect((await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } })).status).toBe("ACTIVE");
    const again = await call("verify", BIZ, { razorpayOrderId: orderId, razorpayPaymentId: "pay_1", signature: razorpaySig(orderId, "pay_1") });
    expect(again.status).toBe(200);
    expect(await prisma.subscriptionPayment.count({ where: { productKey: KEY, status: "PAID" } })).toBe(1);
  });

  it("an order cannot be verified under another business", async () => {
    await prisma.business.create({ data: { id: OTHER, name: "PlrBuy Other", ownerEmail: "p@example.test", ownerName: "P", products: { create: { productKey: KEY } } } });
    const checkout = (await (await call("checkout", BIZ, { planId: await planId(), interval: "ANNUAL", buyer })).json()) as { razorpayOrderId: string };
    const res = await call("verify", OTHER, { razorpayOrderId: checkout.razorpayOrderId, razorpayPaymentId: "pay_2", signature: razorpaySig(checkout.razorpayOrderId, "pay_2") });
    expect(res.status).toBe(400);
    expect(await prisma.subscriptionPayment.count({ where: { productKey: KEY, status: "PAID" } })).toBe(0);
  });

  it("a bad body is a plain 400", async () => {
    expect((await call("checkout", BIZ, { planId: "x" })).status).toBe(400);
    expect((await call("verify", BIZ, { nonsense: true })).status).toBe(400);
  });
});

const DAYS = 86_400_000;
/** Pays for a plan through the Store's own calls, as the Store does. */
async function pay(code: string, interval: "MONTHLY" | "ANNUAL", paymentId: string) {
  const checkout = (await (await call("checkout", BIZ, { planId: await planIdOf(code), interval, buyer })).json()) as { razorpayOrderId: string };
  const ok = await call("verify", BIZ, { razorpayOrderId: checkout.razorpayOrderId, razorpayPaymentId: paymentId, signature: razorpaySig(checkout.razorpayOrderId, paymentId) });
  expect(ok.status).toBe(200);
  return checkout.razorpayOrderId;
}

describe("upgrade credit: the arithmetic", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const end = new Date(start.getTime() + 365 * DAYS);
  it("values the unused days of what was paid, never more than was paid and never below zero", () => {
    const at = (daysUsed: number) => unusedCredit({ paidAmount: 10000, periodStart: start, periodEnd: end, currentPeriodEnd: end, now: new Date(start.getTime() + daysUsed * DAYS) });
    expect(at(0)).toEqual({ credit: 10000, daysLeft: 365 });
    expect(at(292)).toEqual({ credit: 2000, daysLeft: 73 });
    expect(at(365)).toEqual({ credit: 0, daysLeft: 0 });
    expect(at(400)).toEqual({ credit: 0, daysLeft: 0 });
    expect(at(-30).credit).toBe(10000);
    expect(unusedCredit({ paidAmount: 0, periodStart: start, periodEnd: end, currentPeriodEnd: end, now: start })).toEqual({ credit: 0, daysLeft: 0 });
  });
  it("rounds to paise", () => {
    const r = unusedCredit({ paidAmount: 999.99, periodStart: start, periodEnd: end, currentPeriodEnd: end, now: new Date(start.getTime() + 100 * DAYS) });
    expect(r.credit).toBe(Math.round(r.credit * 100) / 100);
    expect(r.credit).toBeLessThan(999.99);
  });
});

describe("Store buy calls: upgrade credit, downgrade, cancel", () => {
  it("a first purchase has no credit: the quote is the plan's own price with GST", async () => {
    const res = await call("quote", BIZ, { planId: await planIdOf("pro"), interval: "ANNUAL" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ planName: "Pro", planPrice: 10000, credit: 0, creditDays: 0, creditLabel: null, amount: 10000, gstAmount: 1800, total: 11800 });
  });

  it("an upgrade part-way through a paid year takes the unused days off before GST, charges the net, and freezes the credit on the invoice", async () => {
    await pay("pro", "ANNUAL", "pay_a");
    const quote = (await (await call("quote", BIZ, { planId: await planIdOf("max"), interval: "ANNUAL" })).json()) as { planPrice: number; credit: number; creditDays: number; creditLabel: string; amount: number; gstAmount: number; total: number };
    // Paid a moment ago for a full year: nearly all of the 10,000 comes back as credit.
    expect(quote.planPrice).toBe(20000);
    expect(quote.credit).toBeGreaterThan(9990);
    expect(quote.credit).toBeLessThanOrEqual(10000);
    expect(quote.creditDays).toBeGreaterThanOrEqual(364);
    expect(quote.creditLabel).toMatch(/^Credit for \d+ unused days of Pro$/);
    expect(quote.amount).toBeCloseTo(20000 - quote.credit, 2);
    expect(quote.gstAmount).toBeCloseTo(quote.amount * 0.18, 2);
    expect(quote.total).toBeCloseTo(quote.amount * 1.18, 2);

    const orderId = await pay("max", "ANNUAL", "pay_b");
    const paid = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: orderId } });
    expect(Number(paid.creditAmount)).toBeGreaterThan(9990);
    expect(Number(paid.amount) + Number(paid.creditAmount)).toBeCloseTo(20000, 2);
    expect(Number(paid.total)).toBeCloseTo(Number(paid.amount) * 1.18, 2);
    const credit = (paid.invoiceSnapshot as { credit?: { planPrice: number; amount: number; label: string } }).credit;
    expect(credit).toMatchObject({ planPrice: 20000, label: "Credit for unused days of Pro" });
    expect(credit!.amount).toBe(Number(paid.creditAmount));
  });

  // Two early renewals stack: the second year starts when the first ends. The rows are moved to "day 100 of the first year" so the numbers are exact.
  const stackTwoYearsAtDay100 = async () => {
    await pay("pro", "ANNUAL", "pay_s1");
    await pay("pro", "ANNUAL", "pay_s2");
    const now = Date.now();
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } });
    const rows = await prisma.subscriptionPayment.findMany({ where: { businessId: BIZ, productKey: KEY, status: "PAID" }, orderBy: { periodStart: "asc" } });
    expect(rows).toHaveLength(2);
    const startDay = now - 100 * DAYS;
    await prisma.subscription.update({ where: { id: sub.id }, data: { startDate: new Date(startDay), currentPeriodEnd: new Date(startDay + 730 * DAYS) } });
    await prisma.subscriptionPayment.update({ where: { id: rows[0].id }, data: { periodStart: new Date(startDay), periodEnd: new Date(startDay + 365 * DAYS) } });
    await prisma.subscriptionPayment.update({ where: { id: rows[1].id }, data: { periodStart: new Date(startDay + 365 * DAYS), periodEnd: new Date(startDay + 730 * DAYS) } });
    return { sub, rows, startDay };
  };
  const creditQuote = async () => (await (await call("quote", BIZ, { planId: await planIdOf("max"), interval: "ANNUAL" })).json()) as { credit: number; creditDays: number; amount: number; total: number };

  it("an upgrade after two stacked yearly payments credits the rest of the first year and the whole second year", async () => {
    await stackTwoYearsAtDay100();
    const quote = await creditQuote();
    // 265 days left of year one (10000 x 265 / 365 = 7260.27) plus all of year two (10000), valued at what was paid.
    expect(quote.credit).toBeCloseTo(17260.27, 1);
    expect(quote.creditDays).toBe(630);
    expect(quote.amount).toBeCloseTo(20000 - quote.credit, 1);
    expect(quote.total).toBeCloseTo(quote.amount * 1.18, 1);
  });

  it("a payment from an earlier subscription of the same plan is not counted again", async () => {
    const { rows, startDay } = await stackTwoYearsAtDay100();
    const before = await creditQuote();
    // An older payment for the same plan whose period reaches past today, but that belongs to a subscription that ended before this one began.
    const { id: _id, razorpayOrderId: _o, razorpayPaymentId: _p, invoiceNumber: _i, ...rest } = rows[0];
    await prisma.subscriptionPayment.create({
      data: { ...rest, id: `pay_${"9".repeat(32)}`, razorpayOrderId: "order_old_one", razorpayPaymentId: "pay_old_one", invoiceNumber: null, buyer: rest.buyer ?? undefined, invoiceSnapshot: rest.invoiceSnapshot ?? undefined, periodStart: new Date(startDay - 200 * DAYS), periodEnd: new Date(startDay + 300 * DAYS) },
    });
    expect((await creditQuote()).credit).toBeCloseTo(before.credit, 1);
  });

  it("the same plan again (a renewal) and a cheaper plan get no credit", async () => {
    await pay("max", "ANNUAL", "pay_c");
    for (const code of ["max", "pro"]) expect(((await (await call("quote", BIZ, { planId: await planIdOf(code), interval: "ANNUAL" })).json()) as { credit: number }).credit, code).toBe(0);
  });

  it("a bad quote or downgrade body is a plain 400, and an unknown plan is refused", async () => {
    expect((await call("quote", BIZ, { planId: "x" })).status).toBe(400);
    expect((await call("quote", BIZ, { planId: "nope", interval: "ANNUAL" })).status).toBe(400);
    expect((await call("downgrade", BIZ, { interval: "ANNUAL" })).status).toBe(400);
  });

  it("a downgrade is scheduled for the end of the paid period and can be undone; it needs a paid plan", async () => {
    expect((await call("downgrade", BIZ, { planId: await planIdOf("pro"), interval: "ANNUAL" })).status).toBe(400);
    await pay("max", "ANNUAL", "pay_d");
    const ok = await call("downgrade", BIZ, { planId: await planIdOf("pro"), interval: "ANNUAL" });
    expect(ok.status).toBe(200);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } });
    expect(sub).toMatchObject({ status: "ACTIVE", pendingPlanId: await planIdOf("pro"), pendingInterval: "ANNUAL" });
    expect(sub.planId).toBe(await planIdOf("max"));
    expect((await call("undo-downgrade", BIZ, {})).status).toBe(200);
    expect((await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } })).pendingPlanId).toBeNull();
  });

  it("cancel keeps the plan ACTIVE to the end of its paid days and stops the reminders; reactivate takes it back; paying again clears it too", async () => {
    expect((await call("cancel", BIZ, {})).status).toBe(400);
    await pay("pro", "ANNUAL", "pay_e");
    expect((await call("reactivate", BIZ, {})).status).toBe(400);
    expect((await call("cancel", BIZ, {})).status).toBe(200);
    expect((await call("cancel", BIZ, {})).status).toBe(200);
    let sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.cancelledAt).not.toBeNull();
    const { sendRenewalReminders, sendGraceNotices } = await import("@/modules/subscriptions/subscriptions");
    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() + 5 * DAYS) } });
    expect(await sendRenewalReminders(new Date(), KEY)).toBe(0);
    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - 1 * DAYS) } });
    expect(await sendGraceNotices(new Date(), KEY)).toBe(0);
    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() + 100 * DAYS) } });

    expect((await call("reactivate", BIZ, {})).status).toBe(200);
    sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } });
    expect(sub.cancelledAt).toBeNull();

    await call("cancel", BIZ, {});
    await pay("max", "ANNUAL", "pay_f");
    expect((await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } })).cancelledAt).toBeNull();
  });

  it("a cancel whose paid days have already run out cannot be reactivated", async () => {
    await pay("pro", "ANNUAL", "pay_g");
    await call("cancel", BIZ, {});
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: BIZ, productKey: KEY, endDate: null } });
    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - DAYS) } });
    expect((await call("reactivate", BIZ, {})).status).toBe(400);
  });

  it("the billing view tells the Store about a cancel (which also drops a scheduled downgrade)", async () => {
    const { getBillingView } = await import("@/modules/billing/billing");
    await pay("max", "ANNUAL", "pay_h");
    await call("downgrade", BIZ, { planId: await planIdOf("pro"), interval: "ANNUAL" });
    await call("cancel", BIZ, {});
    const view = await getBillingView(BIZ, KEY);
    expect(view.subscription?.cancelledAt).not.toBeNull();
    expect(view.subscription?.pending).toBeNull();
  });
});

describe("Platform reads: invoice PDF and unfinished payments", () => {
  const pdfText = (bytes: ArrayBuffer) => Buffer.from(bytes).subarray(0, 5).toString("latin1");

  it("renders a paid invoice as a PDF named by its number, only for its own business and product", async () => {
    const orderId = await pay("pro", "ANNUAL", "pay_i1");
    const paid = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: orderId } });
    const invoice = await renderPaymentInvoice(paid.id, { businessId: BIZ, productKey: KEY });
    expect(invoice?.fileName).toBe(`${paid.invoiceNumber}.pdf`);
    expect(pdfText(invoice!.bytes)).toBe("%PDF-");
    expect(await renderPaymentInvoice(paid.id, { businessId: OTHER, productKey: KEY })).toBeNull();
    expect(await renderPaymentInvoice(paid.id, { businessId: BIZ, productKey: "other" })).toBeNull();
    expect(await renderPaymentInvoice("pay_unknown", { businessId: BIZ, productKey: KEY })).toBeNull();
  });

  it("an upgrade invoice with a credit renders, and is longer than the same invoice without the credit line", async () => {
    await pay("pro", "ANNUAL", "pay_i2");
    const upgraded = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: await pay("max", "ANNUAL", "pay_i3") } });
    expect(Number(upgraded.creditAmount)).toBeGreaterThan(0);
    const withCredit = await renderPaymentInvoice(upgraded.id, { businessId: BIZ, productKey: KEY });
    expect(pdfText(withCredit!.bytes)).toBe("%PDF-");
    const snapshot = upgraded.invoiceSnapshot as { credit?: unknown };
    await prisma.subscriptionPayment.update({ where: { id: upgraded.id }, data: { invoiceSnapshot: { ...snapshot, credit: undefined } as never } });
    const without = await renderPaymentInvoice(upgraded.id, { businessId: BIZ, productKey: KEY });
    expect(withCredit!.bytes.byteLength).toBeGreaterThan(without!.bytes.byteLength);
  });

  it("the Platform's billing read lists unfinished payments: a started one as PENDING, a failed one as FAILED, and a paid one not at all", async () => {
    const started = (await (await call("checkout", BIZ, { planId: await planId(), interval: "ANNUAL", buyer })).json()) as { razorpayOrderId: string };
    const failed = (await (await call("checkout", BIZ, { planId: await planId(), interval: "MONTHLY", buyer })).json()) as { razorpayOrderId: string };
    await failPayment(failed.razorpayOrderId);
    await pay("pro", "ANNUAL", "pay_i4");
    const billing = await buildBusinessBilling(BIZ);
    const attempts = billing!.products.find((p) => p.productKey === KEY)!.attempts!;
    const byOrder = async (orderId: string) => (await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: orderId } })).id;
    expect(attempts.map((a) => a.status).sort()).toEqual(["FAILED", "PENDING"]);
    expect(attempts.find((a) => a.status === "PENDING")).toMatchObject({ id: await byOrder(started.razorpayOrderId), planName: "Pro", interval: "ANNUAL", total: 11800 });
    expect(attempts.find((a) => a.status === "FAILED")).toMatchObject({ id: await byOrder(failed.razorpayOrderId), interval: "MONTHLY", total: 1180 });
    expect(billing!.products[0].billing.payments).toHaveLength(1);
  });
});
