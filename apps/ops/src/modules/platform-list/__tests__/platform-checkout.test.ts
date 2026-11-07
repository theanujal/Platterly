import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, platformCheckoutPath, requestTarget, signedHeaders, verifyRequest, type Buyer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { POST as checkoutPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/checkout/route";
import { POST as verifyPOST } from "@/app/api/platform/businesses/[businessId]/products/[productKey]/billing/verify/route";

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

const call = (action: "checkout" | "verify", biz: string, body: unknown, secret: string | null = BILLING_SECRET, key = KEY) => {
  const text = JSON.stringify(body);
  const url = `http://127.0.0.1:3200${platformCheckoutPath(biz, key, action)}`;
  const request = new Request(url, { method: "POST", headers: secret === null ? {} : signedHeaders(secret, newId("command"), text, { target: requestTarget("POST", url) }), body: text });
  const handler = action === "checkout" ? checkoutPOST : verifyPOST;
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
  await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 1000, priceAnnual: 10000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
});
afterEach(clean);

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
