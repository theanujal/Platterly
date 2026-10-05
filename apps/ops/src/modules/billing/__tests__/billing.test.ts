import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { assignPlan } from "@/modules/subscriptions/subscriptions";
import { BillingError, cancelScheduledDowngrade, confirmPayment, failPayment, getBillingView, getInvoice, listSellablePlans, scheduleDowngrade, startCheckout, verifyCheckout } from "../billing";
import { formatInvoiceNumber, gstKind, gstLines, invoiceInitials, periodEndFrom, priceBreakdown } from "../math";
import { saveProfile, ProfileError, type ProfileInput } from "../profile";
import { createRazorpayOrder, RazorpayError, verifyCheckoutSignature, verifyWebhookSignature } from "../razorpay";
import { GET as plansGET } from "@/app/api/products/[productKey]/billing/plans/route";
import { GET as billingGET } from "@/app/api/products/[productKey]/businesses/[businessId]/billing/route";
import { POST as checkoutPOST } from "@/app/api/products/[productKey]/businesses/[businessId]/billing/checkout/route";
import { POST as verifyPOST } from "@/app/api/products/[productKey]/businesses/[businessId]/billing/verify/route";
import { POST as downgradePOST, DELETE as downgradeDELETE } from "@/app/api/products/[productKey]/businesses/[businessId]/billing/downgrade/route";
import { GET as invoiceGET } from "@/app/api/products/[productKey]/businesses/[businessId]/billing/payments/[paymentId]/route";
import { POST as webhookPOST } from "@/app/api/webhooks/razorpay/route";

const KEY = "billtest";
const DAY = 86_400_000;
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const WEBHOOK_SECRET = "razorpay_webhook_secret";
const manifest = { contract: 1, productKey: KEY, name: "Bill Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };

let server: Server;
let baseUrl = "";
let outboundSecret = "";
let inboundSecret = "";
let commands: Record<string, unknown>[] = [];
let profileBefore: Awaited<ReturnType<typeof prisma.platformBillingProfile.findUnique>>;
const savedEnv: Record<string, string | undefined> = {};
let razorpayCalls: { url: string; headers: Record<string, string>; body: { amount: number; currency: string; notes: Record<string, string> } }[] = [];
let razorpayCounter = 0;

const businessId = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "BillTest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

/** A Razorpay stand-in: records the call and answers with an order id. Anything else goes to the real fetch. */
function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    razorpayCalls.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: `order_T${++razorpayCounter}` }), { status: 200 });
  }) as typeof fetch;
}
const realFetch = globalThis.fetch;

async function setup() {
  const proPlan = await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 1000, priceAnnual: 10000, gstPercent: 18, highlights: ["A", "B"], entitlements: { maxCustomers: 100 } }, null);
  const lite = await createPlan({ productKey: KEY, code: "lite", name: "Lite", isTrial: false, priceMonthly: 500, priceAnnual: null, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 10 } }, null);
  const trial = await createPlan({ productKey: KEY, code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7, priceMonthly: null, priceAnnual: null, gstPercent: 18, highlights: [], entitlements: {} }, null);
  const id = businessId();
  await prisma.business.create({ data: { id, name: "BillTest Spice Route", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  return { pro: proPlan, lite, trial, biz: id };
}

const sign = (secret: string, id: string, body: string) => signedHeaders(secret, id, body);
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const route = (path: string, method: string, body?: unknown, secret = inboundSecret) => {
  const text = body === undefined ? "" : JSON.stringify(body);
  return new Request(`http://127.0.0.1:3200${path}`, { method, headers: sign(secret, newId("command"), text), body: text || undefined });
};
const razorpaySig = (orderId: string, paymentId: string) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const webhook = (event: string, orderId: string, paymentId: string, amountPaise: number, secret = WEBHOOK_SECRET) => {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise } } } });
  return new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", secret).update(body).digest("hex") } });
};

beforeAll(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) savedEnv[k] = process.env[k];
  profileBefore = await prisma.platformBillingProfile.findUnique({ where: { id: "platform" } });
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      commands.push(JSON.parse(body));
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
  // Shared state goes back exactly as it was: the seller profile. (Invoice numbers are per product, so the test product's counter goes with it.)
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
  commands = [];
  razorpayCalls = [];
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  const { secrets } = await registerProduct({ key: KEY, name: "Bill Test", baseUrl, actorUserId: null });
  outboundSecret = secrets.outbound;
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  // A known seller (Karnataka), so GST splits are predictable.
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: { legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" } });
});
afterEach(clean);

describe("the arithmetic", () => {
  it("adds GST on top of the price and rounds to paise", () => {
    expect(priceBreakdown(1000, 18)).toEqual({ amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180 });
    expect(priceBreakdown(999.5, 18)).toMatchObject({ gstAmount: 179.91, total: 1179.41 });
  });
  it("a monthly period is 30 days and an annual one 365", () => {
    const start = new Date("2026-10-05T00:00:00Z");
    expect(periodEndFrom(start, "MONTHLY").getTime() - start.getTime()).toBe(30 * DAY);
    expect(periodEndFrom(start, "ANNUAL").getTime() - start.getTime()).toBe(365 * DAY);
  });
  it("splits GST by state: same state CGST + SGST, another IGST, unknown one plain line", () => {
    expect(gstKind({ stateCode: "29" }, { gstin: "29ABCDE1234F1Z5" })).toBe("INTRA");
    expect(gstKind({ stateCode: "29" }, { gstin: "27ABCDE1234F1Z5" })).toBe("INTER");
    expect(gstKind({ state: "Karnataka" }, { state: " karnataka " })).toBe("INTRA");
    expect(gstKind({}, { state: "Kerala" })).toBe("UNKNOWN");
    expect(gstLines("INTRA", 18, 180)).toEqual([{ label: "CGST (9%)", amount: 90 }, { label: "SGST (9%)", amount: 90 }]);
    expect(gstLines("INTRA", 18, 179.91)).toEqual([{ label: "CGST (9%)", amount: 89.96 }, { label: "SGST (9%)", amount: 89.95 }]);
    expect(gstLines("INTER", 18, 180)).toEqual([{ label: "IGST (18%)", amount: 180 }]);
    expect(gstLines("UNKNOWN", 18, 180)).toEqual([{ label: "GST (18%)", amount: 180 }]);
  });
  it("numbers invoices as prefix, initials, Indian year-month and the running number", () => {
    expect(invoiceInitials("ABC Caterer")).toBe("AC");
    expect(invoiceInitials("!!!")).toBe("X");
    expect(formatInvoiceNumber("FP", "ABC Caterer", new Date("2026-10-05T10:00:00Z"), 7)).toBe("FPAC-26-10-7");
    // 20:00 UTC on 30 September is already 1 October in India.
    expect(formatInvoiceNumber("FP", "ABC Caterer", new Date("2026-09-30T20:00:00Z"), 8)).toBe("FPAC-26-10-8");
  });
  it("checks Razorpay's two signatures", () => {
    const sig = razorpaySig("order_1", "pay_1");
    expect(verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: sig }, KEY_SECRET)).toBe(true);
    expect(verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_2", signature: sig }, KEY_SECRET)).toBe(false);
    expect(verifyWebhookSignature("{}", createHmac("sha256", "s").update("{}").digest("hex"), "s")).toBe(true);
    expect(verifyWebhookSignature("{}", "bad", "s")).toBe(false);
  });
});

describe("checkout and confirmation", () => {
  it("lists only sellable plans (active, paid, priced) with GST worked out", async () => {
    const { lite } = await setup();
    const plans = await listSellablePlans(KEY);
    expect(plans.map((p) => p.code)).toEqual(["lite", "pro"]);
    expect(plans[1]).toMatchObject({ monthly: { amount: 1000, gstAmount: 180, total: 1180 }, annual: { total: 11800 }, highlights: ["A", "B"] });
    expect(plans[0].annual).toBeNull();
    await prisma.plan.update({ where: { id: lite.id }, data: { isActive: false } });
    expect((await listSellablePlans(KEY)).map((p) => p.code)).toEqual(["pro"]);
  });

  it("says plainly that online payment is off when Razorpay keys are not set", async () => {
    const { pro, biz } = await setup();
    delete process.env.RAZORPAY_KEY_ID;
    await expect(startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer })).rejects.toThrow(/not switched on yet/);
    expect((await getBillingView(biz, KEY)).onlineBillingAvailable).toBe(false);
  });

  it("starts a checkout: the order is for the total with GST in paise, uses Platterly's keys, and a PENDING payment is written first", async () => {
    const { pro, biz } = await setup();
    const answer = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "ANNUAL", buyer });
    expect(answer).toMatchObject({ keyId: KEY_ID, amountPaise: 1180000, businessName: "BillTest Spice Route", description: "Pro plan, 1 year" });
    expect(razorpayCalls).toHaveLength(1);
    expect(razorpayCalls[0].body).toMatchObject({ amount: 1180000, currency: "INR", notes: { businessId: biz, productKey: KEY, planId: pro.id, interval: "ANNUAL" } });
    expect(razorpayCalls[0].headers.Authorization).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`);
    const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: answer.razorpayOrderId } });
    expect(payment).toMatchObject({ status: "PENDING", businessId: biz, productKey: KEY, interval: "ANNUAL" });
    expect(Number(payment.total)).toBe(11800);
    expect(payment.buyer).toMatchObject({ name: "Spice Route Caterers", gstin: "29ABCDE1234F1Z5" });
  });

  it("refuses an unavailable plan, the trial plan, an annual price a plan does not have, and a business not on the product", async () => {
    const { lite, trial, biz } = await setup();
    await expect(startCheckout({ businessId: biz, productKey: KEY, planId: "nope", interval: "MONTHLY", buyer })).rejects.toThrow(/not available/);
    await expect(startCheckout({ businessId: biz, productKey: KEY, planId: trial.id, interval: "MONTHLY", buyer })).rejects.toThrow(/not available/);
    await expect(startCheckout({ businessId: biz, productKey: KEY, planId: lite.id, interval: "ANNUAL", buyer })).rejects.toThrow(/not sold yearly/);
    await expect(startCheckout({ businessId: businessId(), productKey: KEY, planId: lite.id, interval: "MONTHLY", buyer })).rejects.toThrow(BillingError);
    expect(razorpayCalls).toHaveLength(0);
  });

  it("surfaces a Razorpay refusal without leaving a payment behind", async () => {
    const { pro, biz } = await setup();
    vi.stubGlobal("fetch", (async () => new Response("no", { status: 400 })) as typeof fetch);
    await expect(startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer }, fetch)).rejects.toThrow(RazorpayError);
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz } })).toBe(0);
  });

  it("verifying a checkout confirms it once: ACTIVE for 30 days, one invoice with the GST split, a snapshot pushed to the product", async () => {
    const { pro, biz } = await setup();
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await expect(verifyCheckout({ businessId: biz, productKey: KEY, razorpayOrderId, razorpayPaymentId: "pay_x", signature: "0".repeat(64) })).rejects.toThrow(/could not verify/);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId } })).status).toBe("PENDING");

    const paid = await verifyCheckout({ businessId: biz, productKey: KEY, razorpayOrderId, razorpayPaymentId: "pay_x", signature: razorpaySig(razorpayOrderId, "pay_x") });
    expect(paid).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_x" });
    // The product's own prefix (derived from its key "billtest"), not the seller profile's fallback "FP".
    expect(paid!.invoiceNumber).toMatch(/^BILSRC-\d{2}-\d{2}-1$/);
    expect(paid!.periodEnd!.getTime() - paid!.periodStart!.getTime()).toBe(30 * DAY);

    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub).toMatchObject({ status: "ACTIVE", planId: pro.id, billingInterval: "MONTHLY" });
    expect(sub.currentPeriodEnd!.getTime()).toBe(paid!.periodEnd!.getTime());

    const invoice = await getInvoice(biz, KEY, paid!.id);
    expect(invoice).toMatchObject({ invoiceNumber: paid!.invoiceNumber, amount: 1000, gstAmount: 180, total: 1180, razorpayPaymentId: "pay_x" });
    expect(invoice.snapshot.gst).toEqual({ kind: "INTRA", lines: [{ label: "CGST (9%)", amount: 90 }, { label: "SGST (9%)", amount: 90 }] });
    expect(invoice.snapshot.seller.legalName).toBe("Platterly Pvt Ltd");
    expect(invoice.snapshot.buyer).toMatchObject({ name: "Spice Route Caterers", gstin: "29ABCDE1234F1Z5" });
    expect(invoice.snapshot.highlights).toEqual(["A", "B"]);

    const pushed = commands.filter((c) => c.type === "snapshot.push").map((c) => (c.payload as { snapshot: { status: string; plan: { code: string }; currentPeriodEnd: string } }).snapshot);
    expect(pushed.at(-1)).toMatchObject({ status: "ACTIVE", plan: { code: "pro" }, currentPeriodEnd: paid!.periodEnd!.toISOString() });
  });

  it("a second confirmation (checkout plus webhook, or a retry) changes nothing: one payment, one period, one invoice", async () => {
    const { pro, biz } = await setup();
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    const first = await confirmPayment(razorpayOrderId, "pay_1");
    const again = await confirmPayment(razorpayOrderId, "pay_1");
    expect(again!.invoiceNumber).toBe(first!.invoiceNumber);
    const parallel = await Promise.all([confirmPayment(razorpayOrderId, "pay_1"), confirmPayment(razorpayOrderId, "pay_1")]);
    expect(parallel.every((p) => p!.invoiceNumber === first!.invoiceNumber)).toBe(true);
    expect(await prisma.subscription.count({ where: { businessId: biz, productKey: KEY } })).toBe(1);
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz, status: "PAID" } })).toBe(1);
    // One payment is one receipt email, however many times it is confirmed.
    const receipts = await prisma.messageLog.findMany({ where: { businessId: biz, template: "payment_received" } });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].variables).toMatchObject({ planName: pro.name, invoiceNumber: first!.invoiceNumber });
  });

  it("two payments at the same moment get different invoice numbers, in order", async () => {
    const { pro, biz } = await setup();
    const other = businessId();
    await prisma.business.create({ data: { id: other, name: "BillTest Second Kitchen", products: { create: { productKey: KEY } } } });
    const a = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    const b = await startCheckout({ businessId: other, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer: { ...buyer, name: "Second Kitchen" } });
    const [pa, pb] = await Promise.all([confirmPayment(a.razorpayOrderId, "pay_a"), confirmPayment(b.razorpayOrderId, "pay_b")]);
    const n = (p: { invoiceNumber: string | null } | null) => Number(p!.invoiceNumber!.split("-").at(-1));
    expect(new Set([pa!.invoiceNumber, pb!.invoiceNumber]).size).toBe(2);
    expect(Math.abs(n(pa) - n(pb))).toBeGreaterThanOrEqual(1);
    // This product's own counter: a fresh product starts at 1, so the two payments are numbers 1 and 2, in some order.
    expect([n(pa), n(pb)].sort()).toEqual([1, 2]);
    expect(await prisma.invoiceCounter.findUniqueOrThrow({ where: { productKey: KEY } })).toMatchObject({ lastNumber: 2 });
  });

  it("IGST for a buyer in another state, one plain GST line when the state is unknown", async () => {
    const { pro, biz } = await setup();
    const inter = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer: { ...buyer, gstin: "27ABCDE1234F1Z5", state: "Maharashtra" } });
    const paid = await confirmPayment(inter.razorpayOrderId, "pay_i");
    expect((await getInvoice(biz, KEY, paid!.id)).snapshot.gst).toEqual({ kind: "INTER", lines: [{ label: "IGST (18%)", amount: 180 }] });
    const unknown = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer: { ...buyer, gstin: null, state: null } });
    const paid2 = await confirmPayment(unknown.razorpayOrderId, "pay_u");
    expect((await getInvoice(biz, KEY, paid2!.id)).snapshot.gst.kind).toBe("UNKNOWN");
  });

  it("renewing the same plan early adds on top of what is left; a different plan starts today and ends the old one", async () => {
    const { pro, lite, biz } = await setup();
    const pay = async (planId: string, id: string, interval: "MONTHLY" | "ANNUAL" = "MONTHLY") => {
      const c = await startCheckout({ businessId: biz, productKey: KEY, planId, interval, buyer });
      return confirmPayment(c.razorpayOrderId, id);
    };
    const first = await pay(pro.id, "pay_1");
    const second = await pay(pro.id, "pay_2");
    expect(second!.periodStart!.getTime()).toBe(first!.periodEnd!.getTime());
    expect(second!.periodEnd!.getTime() - first!.periodEnd!.getTime()).toBe(30 * DAY);
    expect(await prisma.subscription.count({ where: { businessId: biz, productKey: KEY } })).toBe(1);

    const third = await pay(lite.id, "pay_3");
    expect(third!.periodStart!.getTime()).toBeLessThan(first!.periodEnd!.getTime());
    const rows = await prisma.subscription.findMany({ where: { businessId: biz, productKey: KEY }, orderBy: { startDate: "asc" } });
    expect(rows.map((r) => `${r.status}${r.endDate ? "/ended" : "/current"}`)).toEqual(["CANCELLED/ended", "ACTIVE/current"]);
    expect(rows[1].planId).toBe(lite.id);
  });

  it("a lapsed business that pays again starts a fresh period from today", async () => {
    const { pro, biz } = await setup();
    const c1 = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await confirmPayment(c1.razorpayOrderId, "pay_1");
    await prisma.subscription.updateMany({ where: { businessId: biz, endDate: null }, data: { currentPeriodEnd: new Date(Date.now() - DAY), status: "LOCKED" } });
    const c2 = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    const paid = await confirmPayment(c2.razorpayOrderId, "pay_2");
    expect(Math.abs(paid!.periodStart!.getTime() - Date.now())).toBeLessThan(5000);
    expect((await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } })).status).toBe("ACTIVE");
  });

  it("a business cannot verify another business's payment", async () => {
    const { pro, biz } = await setup();
    const other = businessId();
    await prisma.business.create({ data: { id: other, name: "BillTest Other", products: { create: { productKey: KEY } } } });
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await expect(verifyCheckout({ businessId: other, productKey: KEY, razorpayOrderId, razorpayPaymentId: "pay_x", signature: razorpaySig(razorpayOrderId, "pay_x") })).rejects.toThrow(/could not verify/);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId } })).status).toBe("PENDING");
  });

  it("an amount that does not match the order is not confirmed, and an unknown order does nothing", async () => {
    const { pro, biz } = await setup();
    const { razorpayOrderId } = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    expect(await confirmPayment(razorpayOrderId, "pay_x", new Date(), 100)).toBeNull();
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId } })).status).toBe("PENDING");
    expect(await confirmPayment("order_unknown", "pay_x")).toBeNull();
    expect(await prisma.messageLog.count({ where: { businessId: biz } })).toBe(0);
    await failPayment(razorpayOrderId);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId } })).status).toBe("FAILED");
    await failPayment(razorpayOrderId);
    // Told once, and a payment that was never confirmed gets no receipt.
    expect(await prisma.messageLog.findMany({ where: { businessId: biz }, select: { template: true } })).toEqual([{ template: "payment_failed" }]);
    await failPayment("order_unknown");
  });

  it("without the buyer details the invoice still prints the business name", async () => {
    const { pro, biz } = await setup();
    const c = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await prisma.subscriptionPayment.update({ where: { razorpayOrderId: c.razorpayOrderId }, data: { buyer: undefined } }).catch(() => undefined);
    await prisma.$executeRaw`update subscription_payment set buyer = null where "razorpayOrderId" = ${c.razorpayOrderId}`;
    const paid = await confirmPayment(c.razorpayOrderId, "pay_n");
    expect((await getInvoice(biz, KEY, paid!.id)).snapshot.buyer).toMatchObject({ name: "BillTest Spice Route", gstin: null });
  });
});

describe("downgrades and the billing view", () => {
  async function paidOnPro() {
    const s = await setup();
    const c = await startCheckout({ businessId: s.biz, productKey: KEY, planId: s.pro.id, interval: "MONTHLY", buyer });
    await confirmPayment(c.razorpayOrderId, "pay_1");
    return s;
  }

  it("schedules a downgrade that starts at the next payment, shows it, cancels it, and renewing clears it", async () => {
    const { lite, pro, biz } = await paidOnPro();
    await scheduleDowngrade({ businessId: biz, productKey: KEY, planId: lite.id, interval: "MONTHLY" });
    let view = await getBillingView(biz, KEY);
    expect(view.subscription).toMatchObject({ status: "ACTIVE", plan: { code: "pro" }, pending: { planName: "Lite", interval: "MONTHLY" } });
    await cancelScheduledDowngrade(biz, KEY);
    expect((await getBillingView(biz, KEY)).subscription!.pending).toBeNull();

    await scheduleDowngrade({ businessId: biz, productKey: KEY, planId: lite.id, interval: "MONTHLY" });
    const c = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await confirmPayment(c.razorpayOrderId, "pay_2");
    view = await getBillingView(biz, KEY);
    expect(view.subscription!.pending).toBeNull();
    expect(view.payments).toHaveLength(2);
    expect(view.history.length).toBe(1);
  });

  it("refuses a downgrade without a paid plan, to a plan that is not on sale, or yearly when the plan has no annual price", async () => {
    const { lite, trial, biz, pro } = await setup();
    await assignPlan({ businessId: biz, productKey: KEY, planId: trial.id, actorUserId: null });
    await expect(scheduleDowngrade({ businessId: biz, productKey: KEY, planId: lite.id, interval: "MONTHLY" })).rejects.toThrow(/no paid plan/);
    const c = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await confirmPayment(c.razorpayOrderId, "pay_1");
    await expect(scheduleDowngrade({ businessId: biz, productKey: KEY, planId: "nope", interval: "MONTHLY" })).rejects.toThrow(/not available/);
    await expect(scheduleDowngrade({ businessId: biz, productKey: KEY, planId: lite.id, interval: "ANNUAL" })).rejects.toThrow(/not sold yearly/);
  });

  it("the billing view for a business with no subscription is empty but valid", async () => {
    const { biz } = await setup();
    expect(await getBillingView(biz, KEY)).toMatchObject({ subscription: null, history: [], payments: [], onlineBillingAvailable: true });
  });
});

describe("the routes a product calls", () => {
  it("refuse an unsigned request, a wrong secret, and a product that is not the one named in the URL (all 401)", async () => {
    const { biz } = await setup();
    const path = `/api/products/${KEY}/businesses/${biz}/billing`;
    const unsigned = await billingGET(new Request(`http://127.0.0.1:3200${path}`), params({ productKey: KEY, businessId: biz }));
    expect(unsigned.status).toBe(401);
    expect((await billingGET(route(path, "GET", undefined, "wrong"), params({ productKey: KEY, businessId: biz }))).status).toBe(401);
    const other = await registerProduct({ key: "billtest2", name: "Other", baseUrl, actorUserId: null });
    try {
      expect((await billingGET(route(path, "GET", undefined, other.secrets.inbound), params({ productKey: KEY, businessId: biz }))).status).toBe(401);
      // Signed by the right product for itself, but this business is not on it.
      const res = await billingGET(route(`/api/products/billtest2/businesses/${biz}/billing`, "GET", undefined, other.secrets.inbound), params({ productKey: "billtest2", businessId: biz }));
      expect(res.status).toBe(404);
    } finally {
      await prisma.product.deleteMany({ where: { key: "billtest2" } });
    }
  });

  it("serve plans, then a full pay-and-invoice flow, every answer signed by ops", async () => {
    const { pro, biz } = await setup();
    const plansRes = await plansGET(route(`/api/products/${KEY}/billing/plans`, "GET"), params({ productKey: KEY }));
    expect(plansRes.status).toBe(200);
    const text = await plansRes.clone().text();
    expect(verifyRequest([outboundSecret], plansRes.headers, text).ok).toBe(true);
    expect((await plansRes.json()).plans.map((p: { code: string }) => p.code)).toEqual(["lite", "pro"]);

    const base = `/api/products/${KEY}/businesses/${biz}/billing`;
    const p = params({ productKey: KEY, businessId: biz });
    const bad = await checkoutPOST(route(`${base}/checkout`, "POST", { planId: pro.id, interval: "WEEKLY", buyer }), p);
    expect(bad.status).toBe(400);
    const started = await checkoutPOST(route(`${base}/checkout`, "POST", { planId: pro.id, interval: "MONTHLY", buyer }), p);
    expect(started.status).toBe(200);
    const answer = await started.json();
    expect(answer).toMatchObject({ keyId: KEY_ID, amountPaise: 118000 });

    expect((await verifyPOST(route(`${base}/verify`, "POST", { razorpayOrderId: answer.razorpayOrderId, razorpayPaymentId: "pay_r", signature: "0".repeat(64) }), p)).status).toBe(400);
    const verified = await verifyPOST(route(`${base}/verify`, "POST", { razorpayOrderId: answer.razorpayOrderId, razorpayPaymentId: "pay_r", signature: razorpaySig(answer.razorpayOrderId, "pay_r") }), p);
    expect(await verified.json()).toMatchObject({ ok: true, status: "PAID", invoiceNumber: expect.stringMatching(/^BIL/) });

    const view = await (await billingGET(route(base, "GET"), p)).json();
    expect(view).toMatchObject({ subscription: { status: "ACTIVE", plan: { code: "pro" } }, payments: [{ total: 1180 }] });
    const invoice = await invoiceGET(route(`${base}/payments/${view.payments[0].id}`, "GET"), params({ productKey: KEY, businessId: biz, paymentId: view.payments[0].id }));
    expect(await invoice.json()).toMatchObject({ total: 1180, snapshot: { gst: { kind: "INTRA" } } });
    expect((await invoiceGET(route(`${base}/payments/pay_nope`, "GET"), params({ productKey: KEY, businessId: biz, paymentId: "pay_nope" }))).status).toBe(404);

    expect((await downgradePOST(route(`${base}/downgrade`, "POST", { planId: "x", interval: "MONTHLY" }), p)).status).toBe(400);
    expect((await downgradeDELETE(route(`${base}/downgrade`, "DELETE"), p)).status).toBe(200);
  });
});

describe("Razorpay's webhook", () => {
  const call = (req: Request) => webhookPOST(req);

  it("answers 401 when it is not set up, unsigned or wrongly signed, and the same for all", async () => {
    const { pro, biz } = await setup();
    const c = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    expect((await call(webhook("payment.captured", c.razorpayOrderId, "pay_w", 118000, "wrong"))).status).toBe(401);
    expect((await call(new Request("http://x/api/webhooks/razorpay", { method: "POST", body: "{}" }))).status).toBe(401);
    delete process.env.RAZORPAY_KEY_ID;
    expect((await call(webhook("payment.captured", c.razorpayOrderId, "pay_w", 118000))).status).toBe(401);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: c.razorpayOrderId } })).status).toBe("PENDING");
  });

  it("a captured payment of the right amount confirms it; a wrong amount does not; a failed one is marked failed; the rest is acknowledged", async () => {
    const { pro, biz } = await setup();
    const a = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    expect((await call(webhook("payment.captured", a.razorpayOrderId, "pay_w", 5))).status).toBe(200);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: a.razorpayOrderId } })).status).toBe("PENDING");
    expect((await call(webhook("payment.captured", a.razorpayOrderId, "pay_w", 118000))).status).toBe(200);
    const paid = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: a.razorpayOrderId } });
    expect(paid.status).toBe("PAID");
    expect(paid.invoiceNumber).toBeTruthy();
    expect(await prisma.subscription.count({ where: { businessId: biz, endDate: null, status: "ACTIVE" } })).toBe(1);

    const b = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    expect((await call(webhook("payment.failed", b.razorpayOrderId, "pay_f", 118000))).status).toBe(200);
    expect((await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayOrderId: b.razorpayOrderId } })).status).toBe("FAILED");
    expect((await call(webhook("order.paid", "order_unknown", "pay_u", 1))).status).toBe(200);
    expect((await call(webhook("payment.captured", "order_unknown", "pay_u", 1))).status).toBe(200);
  });

  it("the webhook and the checkout both confirming still gives one invoice", async () => {
    const { pro, biz } = await setup();
    const c = await startCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", buyer });
    await Promise.all([call(webhook("payment.captured", c.razorpayOrderId, "pay_w", 118000)), verifyCheckout({ businessId: biz, productKey: KEY, razorpayOrderId: c.razorpayOrderId, razorpayPaymentId: "pay_w", signature: razorpaySig(c.razorpayOrderId, "pay_w") })]);
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz, status: "PAID" } })).toBe(1);
    expect(await prisma.subscription.count({ where: { businessId: biz, productKey: KEY } })).toBe(1);
  });
});

describe("the seller's billing details", () => {
  const input: ProfileInput = { legalName: " Platterly Pvt Ltd ", addressLine1: "1 MG Road", addressLine2: "", city: "Bengaluru", state: "Karnataka", stateCode: "29", postalCode: "560001", country: "India", gstin: "29abcde1234f1z5", pan: "abcde1234f", sacCode: "", invoicePrefix: "fp", email: "", phone: "", website: "", invoiceNote: "Thank you" };

  it("saves, tidies (upper case, blanks become empty, default SAC) and refuses bad values", async () => {
    const saved = await saveProfile(input, null);
    expect(saved).toMatchObject({ legalName: "Platterly Pvt Ltd", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", invoicePrefix: "FP", sacCode: "998314", addressLine2: null });
    await expect(saveProfile({ ...input, gstin: "bad" }, null)).rejects.toThrow(ProfileError);
    await expect(saveProfile({ ...input, pan: "x" }, null)).rejects.toThrow(/PAN/);
    await expect(saveProfile({ ...input, stateCode: "9" }, null)).rejects.toThrow(/two digits/);
    await expect(saveProfile({ ...input, stateCode: "27" }, null)).rejects.toThrow(/different state code/);
    await expect(saveProfile({ ...input, invoicePrefix: "TOOLONGPREFIX" }, null)).rejects.toThrow(/Invoice prefix/);
    await expect(saveProfile({ ...input, sacCode: "12" }, null)).rejects.toThrow(/SAC/);
  });

  it("creates the Razorpay order only through the injected fetch", async () => {
    const calls: string[] = [];
    const f = (async (url: RequestInfo | URL) => (calls.push(String(url)), new Response(JSON.stringify({ id: "order_X" }), { status: 200 }))) as typeof fetch;
    expect(await createRazorpayOrder({ keyId: "k", keySecret: "s", webhookSecret: "w" }, { amountRupees: 1.5, receipt: "r", notes: {} }, f)).toEqual({ razorpayOrderId: "order_X" });
    expect(calls).toEqual(["https://api.razorpay.com/v1/orders"]);
  });
});
