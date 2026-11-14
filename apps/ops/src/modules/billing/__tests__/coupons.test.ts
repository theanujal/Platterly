import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { BillingError, confirmPayment, quoteCheckout, startCheckout } from "../billing";
import { applyCoupon, createCoupon, findUsableCoupon, normalizeCode, setCouponActive } from "../coupons";

const KEY = "coupontest";
const DAY = 86_400_000;
const manifest = { contract: 1, productKey: KEY, name: "Coupon Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const buyer = { name: "Spice Route", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: null };
const newBiz = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;
const realFetch = globalThis.fetch;
let orders = 0;
let razorpayBodies: { amount: number }[] = [];
const savedEnv: Record<string, string | undefined> = {};

async function clean() {
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.coupon.deleteMany({ where: { code: { startsWith: "CT" } } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "CouponTest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: { in: [KEY, "coupontest2"] } } });
}
async function setup() {
  const pro = await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 1000, priceAnnual: 10000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
  const id = newBiz();
  await prisma.business.create({ data: { id, name: "CouponTest Spice", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  return { pro, biz: id };
}
const yearly = (biz: string, planId: string, couponCode?: string) => ({ businessId: biz, productKey: KEY, planId, interval: "ANNUAL" as const, couponCode });

beforeAll(() => {
  for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) savedEnv[k] = process.env[k];
});
afterAll(async () => {
  await clean();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await clean();
  orders = 0;
  razorpayBodies = [];
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "secret";
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    razorpayBodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `order_C${++orders}` }), { status: 200 });
  }) as typeof fetch);
  await registerProduct({ key: KEY, name: "Coupon Test", baseUrl: "https://x.example", actorUserId: null });
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
  await prisma.platformBillingProfile.upsert({ where: { id: "platform" }, create: { id: "platform", legalName: "Platterly Pvt Ltd", state: "Karnataka", stateCode: "29", gstin: "29AAAAA0000A1Z5", invoicePrefix: "FP" }, update: {} });
});
afterEach(clean);

describe("the discount arithmetic", () => {
  it("takes a percentage off the amount before GST, to paise", () => {
    expect(applyCoupon({ kind: "PERCENT", value: 10 }, 10000)).toBe(1000);
    expect(applyCoupon({ kind: "PERCENT", value: 12.5 }, 99.99)).toBe(12.5);
  });
  it("takes a fixed number of rupees off", () => {
    expect(applyCoupon({ kind: "FIXED", value: 500 }, 10000)).toBe(500);
  });
  it("never takes off more than the amount, so the price never goes below zero", () => {
    expect(applyCoupon({ kind: "FIXED", value: 20000 }, 10000)).toBe(10000);
    expect(applyCoupon({ kind: "PERCENT", value: 100 }, 10000)).toBe(10000);
    expect(applyCoupon({ kind: "FIXED", value: 5 }, 0)).toBe(0);
  });
  it("normalises a typed code", () => {
    expect(normalizeCode("  diwali 20 ")).toBe("DIWALI20");
  });
});

describe("making a coupon", () => {
  it("stores the code in capitals and refuses a duplicate, an empty code, a percentage outside 1 to 100 and a fixed amount of nothing", async () => {
    const made = await createCoupon({ code: "ct-save10", kind: "PERCENT", value: 10 });
    expect(made.code).toBe("CT-SAVE10");
    await expect(createCoupon({ code: "CT-save10", kind: "PERCENT", value: 5 })).rejects.toThrow(/already exists/i);
    await expect(createCoupon({ code: "  ", kind: "PERCENT", value: 5 })).rejects.toThrow(/code/i);
    await expect(createCoupon({ code: "CT-BAD1", kind: "PERCENT", value: 0 })).rejects.toThrow(/between 1 and 100/);
    await expect(createCoupon({ code: "CT-BAD2", kind: "PERCENT", value: 101 })).rejects.toThrow(/between 1 and 100/);
    await expect(createCoupon({ code: "CT-BAD3", kind: "FIXED", value: 0 })).rejects.toThrow(/more than zero/);
  });
});

describe("whether a coupon can be used", () => {
  it("says plainly why not: unknown, paused, expired, another product's, used up, already used by this business", async () => {
    const { pro, biz } = await setup();
    const now = new Date();
    const find = (code: string, business = biz) => findUsableCoupon({ code, productKey: KEY, businessId: business, now });
    await expect(find("CT-NOPE")).rejects.toThrow("That coupon code is not valid.");

    const ok = await createCoupon({ code: "CT-OK", kind: "FIXED", value: 100 });
    await expect(find("ct-ok")).resolves.toMatchObject({ id: ok.id });

    await createCoupon({ code: "CT-PAUSED", kind: "FIXED", value: 100 });
    await setCouponActive("CT-PAUSED", false);
    await expect(find("CT-PAUSED")).rejects.toThrow("That coupon code is not valid.");

    await createCoupon({ code: "CT-OLD", kind: "FIXED", value: 100, expiresAt: new Date(now.getTime() - DAY) });
    await expect(find("CT-OLD")).rejects.toThrow("This coupon has expired.");

    await prisma.product.create({ data: { key: "coupontest2", name: "Other", baseUrl: "https://y.example", outboundSecret: "x", inboundSecret: "y" } });
    await createCoupon({ code: "CT-OTHER", kind: "FIXED", value: 100, productKey: "coupontest2" });
    await expect(find("CT-OTHER")).rejects.toThrow("This coupon is not for this product.");

    // Used up: maxUses counts PAID payments only.
    const one = await createCoupon({ code: "CT-ONE", kind: "FIXED", value: 100, maxUses: 1 });
    const other = newBiz();
    await prisma.business.create({ data: { id: other, name: "CouponTest Other", ownerEmail: "p@example.test", ownerName: "P", products: { create: { productKey: KEY } } } });
    const pay = (businessId: string, status: "PAID" | "PENDING", n: number) =>
      prisma.subscriptionPayment.create({ data: { id: `pay_ct${n}`, businessId, productKey: KEY, planId: pro.id, interval: "ANNUAL", amount: 9900, gstPercent: 18, gstAmount: 1782, total: 11682, status, couponId: one.id, couponDiscount: 100 } });
    await pay(other, "PENDING", 1);
    await expect(find("CT-ONE")).resolves.toMatchObject({ id: one.id });
    await prisma.subscriptionPayment.deleteMany({ where: { id: "pay_ct1" } });
    await pay(other, "PAID", 2);
    await expect(find("CT-ONE")).rejects.toThrow("This coupon has been used up.");

    // A business that has already paid with a coupon cannot use the same code again (it is a first-payment offer).
    await createCoupon({ code: "CT-TWICE", kind: "FIXED", value: 100 });
    const twice = await prisma.coupon.findUniqueOrThrow({ where: { code: "CT-TWICE" } });
    await prisma.subscriptionPayment.create({ data: { id: "pay_ct3", businessId: biz, productKey: KEY, planId: pro.id, interval: "ANNUAL", amount: 9900, gstPercent: 18, gstAmount: 1782, total: 11682, status: "PAID", couponId: twice.id, couponDiscount: 100 } });
    await expect(find("CT-TWICE")).rejects.toThrow("You have already used this coupon.");
  });
});

describe("a coupon at checkout (yearly)", () => {
  it("takes the discount off before GST, so GST is charged on the lower amount", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CT-TEN", kind: "PERCENT", value: 10 });
    const plain = await quoteCheckout(yearly(biz, pro.id));
    expect(plain).toMatchObject({ amount: 10000, gstAmount: 1800, total: 11800, discount: 0, couponCode: null });
    const quote = await quoteCheckout(yearly(biz, pro.id, "ct-ten"));
    expect(quote).toMatchObject({ planPrice: 10000, discount: 1000, amount: 9000, gstAmount: 1620, total: 10620, couponCode: "CT-TEN" });
  });

  it("charges Razorpay the discounted total and records the coupon and discount on the payment; only a PAID payment uses the coupon up", async () => {
    const { pro, biz } = await setup();
    const coupon = await createCoupon({ code: "CT-FIX", kind: "FIXED", value: 2000, maxUses: 1 });
    const started = await startCheckout({ ...yearly(biz, pro.id, "CT-FIX"), buyer });
    expect(razorpayBodies.at(-1)?.amount).toBe(Math.round(8000 * 1.18 * 100));
    const payment = await prisma.subscriptionPayment.findFirstOrThrow({ where: { businessId: biz } });
    expect(payment).toMatchObject({ couponId: coupon.id, status: "PENDING" });
    expect(Number(payment.couponDiscount)).toBe(2000);
    expect(Number(payment.amount)).toBe(8000);
    // Still pending: another business can still take the one use.
    await expect(findUsableCoupon({ code: "CT-FIX", productKey: KEY, businessId: newBiz(), now: new Date() })).resolves.toBeTruthy();
    await confirmPayment((started as { razorpayOrderId: string }).razorpayOrderId, "pay_razor1");
    await expect(findUsableCoupon({ code: "CT-FIX", productKey: KEY, businessId: newBiz(), now: new Date() })).rejects.toThrow("This coupon has been used up.");
  });

  it("refuses a bad code with the plain reason, and refuses a coupon on a monthly plan until monthly is built", async () => {
    const { pro, biz } = await setup();
    await expect(quoteCheckout(yearly(biz, pro.id, "CT-NOPE"))).rejects.toThrow(BillingError);
    await createCoupon({ code: "CT-MON", kind: "PERCENT", value: 10 });
    await expect(quoteCheckout({ businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", couponCode: "CT-MON" })).rejects.toThrow(/yearly/i);
  });

  it("a coupon that would make the payment free is refused rather than starting a zero payment", async () => {
    const { pro, biz } = await setup();
    await createCoupon({ code: "CT-FREE", kind: "PERCENT", value: 100 });
    await expect(startCheckout({ ...yearly(biz, pro.id, "CT-FREE"), buyer })).rejects.toThrow(/covers this plan|contact Platterly/i);
  });
});
