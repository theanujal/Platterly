import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { newId, signedHeaders, type Buyer, type StandCheckoutRequest, requestTarget } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { BillingError } from "@/modules/billing/billing";
import { advanceStandOrder, confirmStandPayment, failStandPayment, getStandInvoice, getStandOffer, listStandOrders, setStandPricing, startStandCheckout, verifyStandCheckout } from "../stand";
import { buildStandPrintFile, STAND_PAGE } from "../print-file";
import { GET as offerGET } from "@/app/api/products/[productKey]/stand/offer/route";
import { POST as ordersPOST, GET as ordersGET } from "@/app/api/products/[productKey]/businesses/[businessId]/stand/orders/route";
import { POST as verifyPOST } from "@/app/api/products/[productKey]/businesses/[businessId]/stand/orders/verify/route";
import { POST as webhookPOST } from "@/app/api/webhooks/razorpay/route";

const KEY = "standtest";
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const WEBHOOK_SECRET = "razorpay_webhook_secret";
const manifest = { contract: 1, productKey: KEY, name: "Stand Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer: Buyer = { name: "Spice Route Caterers", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" };
const shipTo = { name: "Asha Rao", phone: "+919876543210", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India" };
const request = (quantity = 2): StandCheckoutRequest => ({ quantity, shipTo, buyer, kitchenName: "Spice Route", kitchenLogoUrl: null, linkUrl: "https://catering.platterly.in/spice-route" });

let inboundSecret = "";
let profileBefore: Awaited<ReturnType<typeof prisma.platformBillingProfile.findUnique>>;
const savedEnv: Record<string, string | undefined> = {};
let razorpayCalls: { body: { amount: number; notes: Record<string, string> } }[] = [];
let razorpayCounter = 0;
const realFetch = globalThis.fetch;

const businessId = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.standOrder.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "StandTest" } } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    razorpayCalls.push({ body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: `order_S${++razorpayCounter}` }), { status: 200 });
  }) as typeof fetch;
}

async function setup(price: number | null = 500) {
  const id = businessId();
  await prisma.business.create({ data: { id, name: "StandTest Spice Route", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  await setStandPricing(KEY, { price, gstPercent: 18 }, null);
  return id;
}

const razorpaySig = (orderId: string, paymentId: string) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const route = (path: string, method: string, body?: unknown) => {
  const text = body === undefined ? "" : JSON.stringify(body);
  const url = `http://127.0.0.1:3200${path}`;
  return new Request(url, { method, headers: signedHeaders(inboundSecret, newId("command"), text, { target: requestTarget(method, url) }), body: text || undefined });
};
const webhook = (event: string, orderId: string, paymentId: string, amountPaise: number) => {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise } } } });
  return new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex") } });
};

/** Orders and pays for a stand through checkout verification. */
async function paidOrder(biz: string, quantity = 2) {
  const started = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(quantity) });
  const order = await verifyStandCheckout({ businessId: biz, productKey: KEY, razorpayOrderId: started.razorpayOrderId, razorpayPaymentId: "pay_1", signature: razorpaySig(started.razorpayOrderId, "pay_1") });
  return { started, order: order! };
}

beforeAll(async () => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) savedEnv[k] = process.env[k];
  profileBefore = await prisma.platformBillingProfile.findUnique({ where: { id: "platform" } });
});
afterAll(async () => {
  await clean();
  if (profileBefore) await prisma.platformBillingProfile.update({ where: { id: "platform" }, data: { ...profileBefore, updatedAt: undefined } });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await clean();
  razorpayCalls = [];
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.stubGlobal("fetch", fakeRazorpay());
  const { secrets } = await registerProduct({ key: KEY, name: "Stand Test", baseUrl: "http://127.0.0.1:1", actorUserId: null });
  inboundSecret = secrets.inbound;
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: { legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" } });
});
afterEach(clean);

describe("price and offer", () => {
  it("is not on sale until staff set a price, then shows one stand with GST", async () => {
    await setup(null);
    expect(await getStandOffer(KEY)).toMatchObject({ available: false, maxPerOrder: 3 });
    await setStandPricing(KEY, { price: 500, gstPercent: 18 }, null);
    expect(await getStandOffer(KEY)).toEqual({ available: true, unitAmount: 500, gstPercent: 18, unitGst: 90, unitTotal: 590, maxPerOrder: 3 });
  });

  it("is not on sale while Razorpay is not set up", async () => {
    await setup();
    delete process.env.RAZORPAY_KEY_ID;
    expect((await getStandOffer(KEY)).available).toBe(false);
  });

  it("prints the stand's own HSN / SAC code on the invoice when staff set one, else the seller's SAC code", async () => {
    const biz = await setup();
    const first = await paidOrder(biz, 1);
    expect((await getStandInvoice(biz, KEY, first.order.id)).seller.sacCode).toBe("998314"); // the Billing default
    await setStandPricing(KEY, { price: 500, gstPercent: 18, hsnCode: " 392690 " }, null);
    const second = await paidOrder(biz, 1);
    expect((await getStandInvoice(biz, KEY, second.order.id)).seller.sacCode).toBe("392690");
    expect((await getStandInvoice(biz, KEY, first.order.id)).seller.sacCode).toBe("998314"); // frozen: an old invoice never changes
    await setStandPricing(KEY, { price: 500, gstPercent: 18, hsnCode: "" }, null); // empty goes back to Billing's code
    expect((await prisma.product.findUniqueOrThrow({ where: { key: KEY } })).standHsnCode).toBeNull();
  });

  it("refuses an HSN / SAC code that is not 4 to 8 digits", async () => {
    await setup();
    await expect(setStandPricing(KEY, { price: 500, gstPercent: 18, hsnCode: "12" }, null)).rejects.toThrow(/4 to 8 digits/);
    await expect(setStandPricing(KEY, { price: 500, gstPercent: 18, hsnCode: "ABCD12" }, null)).rejects.toThrow(/4 to 8 digits/);
  });

  it("refuses a bad price or GST", async () => {
    await setup();
    await expect(setStandPricing(KEY, { price: 0, gstPercent: 18 }, null)).rejects.toThrow(BillingError);
    await expect(setStandPricing(KEY, { price: 500, gstPercent: 90 }, null)).rejects.toThrow(BillingError);
  });
});

describe("checkout", () => {
  it("prices quantity x the unit price plus GST, in paise, and keeps the print details", async () => {
    const biz = await setup();
    const started = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(3) });
    expect(started).toMatchObject({ amountPaise: 177000, description: "Order QR stand x 3" });
    expect(razorpayCalls[0].body.amount).toBe(177000);
    const row = await prisma.standOrder.findUniqueOrThrow({ where: { id: started.orderId } });
    expect(row).toMatchObject({ paymentStatus: "PENDING", fulfilment: "PLACED", quantity: 3, kitchenName: "Spice Route", linkUrl: "https://catering.platterly.in/spice-route" });
    expect(Number(row.amount)).toBe(1500);
    expect(Number(row.gstAmount)).toBe(270);
    expect(Number(row.total)).toBe(1770);
  });

  it("refuses 0 or 4 stands, a stand that is off sale, and another product's business", async () => {
    const biz = await setup();
    await expect(startStandCheckout({ businessId: biz, productKey: KEY, ...request(4) })).rejects.toThrow(/1 to 3/);
    await expect(startStandCheckout({ businessId: biz, productKey: KEY, ...request(0) })).rejects.toThrow(/1 to 3/);
    await expect(startStandCheckout({ businessId: businessId(), productKey: KEY, ...request(1) })).rejects.toThrow("unknown_business");
    await setStandPricing(KEY, { price: null, gstPercent: 18 }, null);
    await expect(startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) })).rejects.toThrow(/not on sale/);
  });
});

describe("payment", () => {
  it("one payment is one order, one GST invoice and one 'placed' email, even when checkout and the webhook both confirm", async () => {
    const biz = await setup();
    const { started, order } = await paidOrder(biz);
    expect(order).toMatchObject({ paymentStatus: "PAID", fulfilment: "PLACED" });
    expect(order.invoiceNumber).toMatch(/-\d{2}-\d{2}-\d+$/);

    const again = await confirmStandPayment(started.razorpayOrderId, "pay_1", new Date(), 118000);
    expect(again?.invoiceNumber).toBe(order.invoiceNumber);
    expect(await prisma.messageLog.count({ where: { productKey: KEY, template: "stand_placed" } })).toBe(1);
    expect(await prisma.notification.count({ where: { productKey: KEY, kind: "stand.ordered" } })).toBe(1);

    const invoice = await getStandInvoice(biz, KEY, order.id);
    expect(invoice).toMatchObject({ quantity: 2, amount: 1000, gstAmount: 180, total: 1180, razorpayPaymentId: "pay_1" });
    expect(invoice.gst.lines.map((l) => l.label)).toEqual(["CGST (9%)", "SGST (9%)"]); // same state as Platterly
  });

  it("refuses a bad signature, and a payment made for another business's order", async () => {
    const biz = await setup();
    const started = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) });
    await expect(verifyStandCheckout({ businessId: biz, productKey: KEY, razorpayOrderId: started.razorpayOrderId, razorpayPaymentId: "pay_1", signature: "0".repeat(64) })).rejects.toThrow(/verify/);
    const other = businessId();
    await prisma.business.create({ data: { id: other, name: "StandTest Other", products: { create: { productKey: KEY } } } });
    await expect(verifyStandCheckout({ businessId: other, productKey: KEY, razorpayOrderId: started.razorpayOrderId, razorpayPaymentId: "pay_1", signature: razorpaySig(started.razorpayOrderId, "pay_1") })).rejects.toThrow(/verify/);
    expect((await prisma.standOrder.findUniqueOrThrow({ where: { id: started.orderId } })).paymentStatus).toBe("PENDING");
  });

  it("the webhook confirms a stand order, ignores a wrong captured amount, and marks a failed payment", async () => {
    const biz = await setup();
    const a = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) });
    expect((await webhookPOST(webhook("payment.captured", a.razorpayOrderId, "pay_9", 1))).status).toBe(200);
    expect((await prisma.standOrder.findUniqueOrThrow({ where: { id: a.orderId } })).paymentStatus).toBe("PENDING");
    expect((await webhookPOST(webhook("payment.captured", a.razorpayOrderId, "pay_9", a.amountPaise))).status).toBe(200);
    expect((await prisma.standOrder.findUniqueOrThrow({ where: { id: a.orderId } })).paymentStatus).toBe("PAID");

    const b = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) });
    await webhookPOST(webhook("payment.failed", b.razorpayOrderId, "pay_x", b.amountPaise));
    expect((await prisma.standOrder.findUniqueOrThrow({ where: { id: b.orderId } })).paymentStatus).toBe("FAILED");
    expect(await failStandPayment("order_unknown")).toBe(false);
  });

  it("a retry that succeeds after a failed attempt on the same Razorpay order is still paid and invoiced (issue 75)", async () => {
    const biz = await setup();
    const c = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) });
    await webhookPOST(webhook("payment.failed", c.razorpayOrderId, "pay_first", c.amountPaise));
    expect((await webhookPOST(webhook("payment.captured", c.razorpayOrderId, "pay_retry", c.amountPaise))).status).toBe(200);
    const row = await prisma.standOrder.findUniqueOrThrow({ where: { id: c.orderId } });
    expect(row).toMatchObject({ paymentStatus: "PAID", razorpayPaymentId: "pay_retry" });
    expect(row.invoiceNumber).toBeTruthy();
  });

  it("a kitchen sees only its own paid orders", async () => {
    const biz = await setup();
    await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) }); // never paid
    const { order } = await paidOrder(biz);
    const list = await listStandOrders(biz, KEY);
    expect(list.map((o) => o.id)).toEqual([order.id]);
    expect(list[0]).toMatchObject({ fulfilment: "PLACED", paymentStatus: "PAID", quantity: 2 });
    await expect(getStandInvoice(businessId(), KEY, order.id)).rejects.toThrow("unknown_business");
  });
});

describe("printing and shipping", () => {
  it("moves forward one step at a time, emails once when shipped, and cannot skip or go back", async () => {
    const biz = await setup();
    const { order } = await paidOrder(biz);
    expect(await advanceStandOrder(order.id, {}, null)).toBe("PRINTING");
    expect(await prisma.messageLog.count({ where: { productKey: KEY, template: "stand_shipped" } })).toBe(0);
    expect(await advanceStandOrder(order.id, { trackingNote: "  Courier ABC 123 " }, null)).toBe("SHIPPED");
    const shipped = await prisma.messageLog.findMany({ where: { productKey: KEY, template: "stand_shipped" } });
    expect(shipped).toHaveLength(1);
    expect(JSON.stringify(shipped[0].variables)).toContain("Courier ABC 123");
    expect(await advanceStandOrder(order.id, {}, null)).toBe("DELIVERED");
    await expect(advanceStandOrder(order.id, {}, null)).rejects.toThrow(/already delivered/);
    const row = await prisma.standOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.printingAt && row.shippedAt && row.deliveredAt).toBeTruthy();
    expect(row.trackingNote).toBe("Courier ABC 123");
  });

  it("an unpaid order cannot move", async () => {
    const biz = await setup();
    const started = await startStandCheckout({ businessId: biz, productKey: KEY, ...request(1) });
    await expect(advanceStandOrder(started.orderId, {}, null)).rejects.toThrow(/not paid/);
  });

  it("draws an A6 PDF with the kitchen's QR, even when the logo cannot be fetched", async () => {
    const png = await sharp({ create: { width: 200, height: 80, channels: 3, background: "#ff6900" } }).png().toBuffer();
    const fetchImpl = (async (url: string) => (String(url).includes("logo") ? new Response(png) : new Response("no", { status: 404 }))) as unknown as typeof fetch;
    const withLogo = new Uint8Array(await buildStandPrintFile({ kitchenName: "Spice Route", kitchenLogoUrl: "https://x.example/logo.png", linkUrl: "https://catering.platterly.in/spice-route" }, fetchImpl));
    const without = new Uint8Array(await buildStandPrintFile({ kitchenName: "Spice Route", kitchenLogoUrl: "https://x.example/missing.png", linkUrl: "https://catering.platterly.in/spice-route" }, fetchImpl));
    for (const bytes of [withLogo, without]) {
      const head = Buffer.from(bytes.slice(0, 5)).toString();
      expect(head).toBe("%PDF-");
      expect(Buffer.from(bytes).toString("latin1")).toContain(`MediaBox [0 0 ${STAND_PAGE.widthPt}. ${STAND_PAGE.heightPt}.]`); // 288 x 432 pt = 4 x 6 in
    }
    expect(withLogo.length).toBeGreaterThan(without.length);
  });
});

describe("the signed API", () => {
  it("serves the offer and the list, takes a checkout with a validated address, and verifies a payment", async () => {
    const biz = await setup();
    const offer = await offerGET(route(`/api/products/${KEY}/stand/offer`, "GET"), params({ productKey: KEY }));
    expect(offer.status).toBe(200);
    expect(await offer.json()).toMatchObject({ available: true, unitTotal: 590 });

    const path = `/api/products/${KEY}/businesses/${biz}/stand/orders`;
    const bad = await ordersPOST(route(path, "POST", { ...request(1), shipTo: { ...shipTo, postalCode: "" } }), params({ productKey: KEY, businessId: biz }));
    expect(bad.status).toBe(400);
    const tooMany = await ordersPOST(route(path, "POST", request(9)), params({ productKey: KEY, businessId: biz }));
    expect(tooMany.status).toBe(400);

    const good = await ordersPOST(route(path, "POST", request(1)), params({ productKey: KEY, businessId: biz }));
    expect(good.status).toBe(200);
    const started = await good.json();
    const verified = await verifyPOST(route(`${path}/verify`, "POST", { razorpayOrderId: started.razorpayOrderId, razorpayPaymentId: "pay_77", signature: razorpaySig(started.razorpayOrderId, "pay_77") }), params({ productKey: KEY, businessId: biz }));
    expect(verified.status).toBe(200);
    const list = await ordersGET(route(path, "GET"), params({ productKey: KEY, businessId: biz }));
    expect((await list.json()).orders).toHaveLength(1);
  });

  it("refuses an unsigned request", async () => {
    await setup();
    const response = await offerGET(new Request("http://127.0.0.1:3200/x", { method: "GET" }), params({ productKey: KEY }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
