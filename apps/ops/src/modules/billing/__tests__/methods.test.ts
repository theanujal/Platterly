import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { newSubscriptionId } from "@/modules/snapshots/issue";
import type { PlatformRazorpay } from "../razorpay";
import { chargeAutoPay, startAutoPayCheckout } from "../billing";
import { ensureRazorpayCustomer } from "../razorpay-customer";
import { listMethods, recordMethodFromPayment, removeMethod, startAddCard, startMakePrimary, verifyAddCard, verifyMakePrimary } from "../methods";

/** Saved payment methods (docs/payment-methods-design.md), Razorpay replaced by a recorded stand-in. */
const KEY = "methodstest";
const DAY = 86_400_000;
const KEY_ID = "rzp_test_key";
const KEY_SECRET = "razorpay_key_secret";
const creds: PlatformRazorpay = { keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: "razorpay_webhook_secret" };
const manifest = { contract: 1, productKey: KEY, name: "Methods Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };

type Pay = { id: string; status: string; amount: number; amount_refunded?: number; method: string; token_id?: string | null; customer_id?: string | null; card?: { last4: string; network: string } | null; vpa?: string | null };
let calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
let rz: Record<string, { status: string; current_start: number | null; current_end: number | null; notes?: Record<string, string>; customer_id?: string }> = {};
let pays: Record<string, Pay> = {};
let failPaths: string[] = [];
let counter = 0;
const realFetch = globalThis.fetch;
function fakeRazorpay(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.razorpay.com/")) return realFetch(input, init);
    const path = url.slice("https://api.razorpay.com/v1".length);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", path, body });
    if (failPaths.some((p) => path.startsWith(p))) return new Response("boom", { status: 500 });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/customers") return json({ id: `cust_T${++counter}` });
    if (path === "/orders") return json({ id: `order_T${++counter}` });
    if (path === "/plans") return json({ id: `plan_T${++counter}` });
    if (path === "/subscriptions") {
      const id = `sub_T${++counter}`;
      rz[id] = { status: "created", current_start: null, current_end: null, notes: body.notes, customer_id: body.customer_id };
      return json({ id, ...rz[id] });
    }
    const subCancel = path.match(/^\/subscriptions\/(sub_\w+)\/cancel$/);
    if (subCancel) {
      rz[subCancel[1]] = { ...(rz[subCancel[1]] ?? { current_start: null, current_end: null }), status: "cancelled" };
      return json({ id: subCancel[1], ...rz[subCancel[1]] });
    }
    const sub = path.match(/^\/subscriptions\/(sub_\w+)$/);
    if (sub && rz[sub[1]]) return json({ id: sub[1], ...rz[sub[1]] });
    const refund = path.match(/^\/payments\/(pay_\w+)\/refund$/);
    if (refund) return json({ id: `rfnd_T${++counter}`, status: "processed" });
    const pay = path.match(/^\/payments\/(pay_\w+)$/);
    if (pay && pays[pay[1]]) return json(pays[pay[1]]);
    if (path.match(/^\/customers\/cust_\w+\/tokens\/token_\w+$/) && init?.method === "DELETE") return json({ deleted: true });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const secs = (d: Date) => Math.floor(d.getTime() / 1000);
const orderSig = (orderId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${orderId}|${payId}`).digest("hex");
const subSig = (subId: string, payId: string) => createHmac("sha256", KEY_SECRET).update(`${payId}|${subId}`).digest("hex");
const card = (id: string, token: string, last4: string, customer: string | null = null): Pay => ({ id, status: "captured", amount: 500, method: "card", token_id: token, customer_id: customer, card: { last4, network: "Visa" } });

async function clean() {
  await prisma.razorpayEvent.deleteMany({ where: { businessId: { startsWith: "biz_methodstest" } } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.razorpayPlan.deleteMany({ where: { plan: { productKey: KEY } } });
  await prisma.business.deleteMany({ where: { id: { startsWith: "biz_methodstest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

let seq = 0;
/** A business on a monthly Pro plan with auto-pay `sub_OLD`, 10 days of its period left; owner email and phone set unless told otherwise. */
async function setup(owner: { email: string | null; phone: string | null } = { email: "o@example.test", phone: "9845671203" }) {
  const pro = (await prisma.plan.findFirst({ where: { productKey: KEY, code: "pro" } })) ?? await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 3000, priceAnnual: 33000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 100 } }, null);
  const id = `biz_methodstest${String(++seq).padStart(17, "0")}`;
  await prisma.business.create({ data: { id, name: "Methods Test Kitchen", ownerName: "O", ownerEmail: owner.email, ownerPhone: owner.phone, products: { create: { productKey: KEY } } } });
  const periodEnd = new Date(Date.now() + 10 * DAY);
  await prisma.subscription.create({ data: { id: newSubscriptionId(), businessId: id, productKey: KEY, planId: pro.id, status: "ACTIVE", billingInterval: "MONTHLY", currentPeriodEnd: periodEnd, razorpaySubscriptionId: "sub_OLD", autoPay: "ACTIVE" } });
  rz.sub_OLD = { status: "active", current_start: secs(new Date(Date.now() - 20 * DAY)), current_end: secs(periodEnd) };
  return { pro, biz: id, periodEnd };
}

beforeEach(async () => {
  await clean();
  calls = [];
  rz = {};
  pays = {};
  failPaths = [];
  counter = 0;
  process.env.RAZORPAY_KEY_ID = KEY_ID;
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = "razorpay_webhook_secret";
  vi.stubGlobal("fetch", fakeRazorpay());
  await registerProduct({ key: KEY, name: "Methods Test", baseUrl: "https://x.example", actorUserId: null });
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
});
afterEach(clean);
afterAll(() => vi.unstubAllGlobals());

describe("the business's Razorpay customer", () => {
  it("is made once from the owner's details and reused", async () => {
    const { biz } = await setup();
    const first = await ensureRazorpayCustomer(biz, creds);
    const second = await ensureRazorpayCustomer(biz, creds);
    expect(first).toBe("cust_T1");
    expect(second).toBe("cust_T1");
    const made = calls.filter((c) => c.path === "/customers");
    expect(made).toHaveLength(1);
    expect(made[0].body).toMatchObject({ name: "Methods Test Kitchen", email: "o@example.test", contact: "9845671203" });
  });

  it("is refused, with what is missing, when the owner has no email or phone", async () => {
    const { biz } = await setup({ email: "o@example.test", phone: null });
    await expect(ensureRazorpayCustomer(biz, creds)).rejects.toThrow(/mobile number/);
    await prisma.business.update({ where: { id: biz }, data: { ownerEmail: null, ownerPhone: "9845671203" } });
    await expect(ensureRazorpayCustomer(biz, creds)).rejects.toThrow(/email/);
    expect(calls).toHaveLength(0);
  });
});

describe("recording a method from a payment", () => {
  it("saves a card as a label with its token, once", async () => {
    const { biz } = await setup();
    pays.pay_1 = card("pay_1", "token_A", "4366");
    const row = await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    expect(row).toMatchObject({ kind: "CARD", label: "Visa ending 4366", razorpayTokenId: "token_A", razorpaySubscriptionId: "sub_OLD" });
    await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(1);
  });

  it("saves a UPI id as a label with no token", async () => {
    const { biz } = await setup();
    pays.pay_u = { id: "pay_u", status: "captured", amount: 500, method: "upi", vpa: "name@bank", token_id: null };
    const row = await recordMethodFromPayment(biz, "pay_u", "sub_OLD", creds);
    expect(row).toMatchObject({ kind: "UPI", label: "UPI name@bank", razorpayTokenId: null, razorpaySubscriptionId: "sub_OLD" });
    await recordMethodFromPayment(biz, "pay_u", "sub_OLD", creds);
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(1);
  });
});

describe("listing methods", () => {
  it("marks as primary the method whose subscription is the current auto-pay", async () => {
    const { biz } = await setup();
    pays.pay_1 = card("pay_1", "token_A", "4366");
    pays.pay_2 = card("pay_2", "token_B", "1111");
    await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    await recordMethodFromPayment(biz, "pay_2", null, creds);
    const list = await listMethods(biz, KEY);
    expect(list.map((m) => [m.label, m.isPrimary])).toEqual([["Visa ending 4366", true], ["Visa ending 1111", false]]);
  });
});

describe("adding a card", () => {
  it("opens a Rs 5 registration for the customer, then records the card and refunds the Rs 5", async () => {
    const { biz } = await setup();
    const start = await startAddCard(biz, creds);
    expect(start).toMatchObject({ keyId: KEY_ID, customerId: "cust_T1", amountPaise: 500 });
    pays.pay_new = card("pay_new", "token_N", "9999", "cust_T1");
    const row = await verifyAddCard({ businessId: biz, razorpayOrderId: start.razorpayOrderId, razorpayPaymentId: "pay_new", signature: orderSig(start.razorpayOrderId, "pay_new") }, creds);
    expect(row).toMatchObject({ label: "Visa ending 9999", razorpayTokenId: "token_N", razorpaySubscriptionId: null });
    expect(calls.find((c) => c.path === "/payments/pay_new/refund")?.body).toEqual({ amount: 500 });
  });

  it("rejects a wrong signature and a payment of another customer, saving nothing", async () => {
    const { biz } = await setup();
    const start = await startAddCard(biz, creds);
    pays.pay_x = card("pay_x", "token_X", "0001", "cust_SOMEONE_ELSE");
    await expect(verifyAddCard({ businessId: biz, razorpayOrderId: start.razorpayOrderId, razorpayPaymentId: "pay_x", signature: "bad" }, creds)).rejects.toThrow(/verify/);
    await expect(verifyAddCard({ businessId: biz, razorpayOrderId: start.razorpayOrderId, razorpayPaymentId: "pay_x", signature: orderSig(start.razorpayOrderId, "pay_x") }, creds)).rejects.toThrow(/verify/);
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(0);
  });

  it("keeps the card and tells staff when the Rs 5 cannot be refunded", async () => {
    const { biz } = await setup();
    const start = await startAddCard(biz, creds);
    pays.pay_new = card("pay_new", "token_N", "9999", "cust_T1");
    failPaths = ["/payments/pay_new/refund"];
    await verifyAddCard({ businessId: biz, razorpayOrderId: start.razorpayOrderId, razorpayPaymentId: "pay_new", signature: orderSig(start.razorpayOrderId, "pay_new") }, creds);
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(1);
    expect(await prisma.notification.count({ where: { businessId: biz, kind: "method.refund_failed" } })).toBe(1);
  });
});

describe("making a method the primary", () => {
  async function withTwoCards() {
    const base = await setup();
    pays.pay_1 = card("pay_1", "token_A", "4366");
    pays.pay_2 = card("pay_2", "token_B", "1111");
    const primary = await recordMethodFromPayment(base.biz, "pay_1", "sub_OLD", creds);
    const secondary = await recordMethodFromPayment(base.biz, "pay_2", null, creds);
    return { ...base, primary, secondary };
  }

  it("starts a new subscription for the same plan that begins when the paid period ends", async () => {
    const { biz, secondary, periodEnd } = await withTwoCards();
    const start = await startMakePrimary({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds);
    const made = calls.find((c) => c.path === "/subscriptions");
    expect(made?.body).toMatchObject({ customer_id: "cust_T1", start_at: secs(periodEnd), notes: { businessId: biz, productKey: KEY } });
    expect(start).toMatchObject({ keyId: KEY_ID, razorpaySubscriptionId: expect.stringMatching(/^sub_T/) });
  });

  it("refuses the method that is already primary, a business with no auto-pay and a period already over", async () => {
    const { biz, primary, secondary } = await withTwoCards();
    await expect(startMakePrimary({ businessId: biz, productKey: KEY, methodId: primary.id }, creds)).rejects.toThrow(/already/);
    await prisma.subscription.updateMany({ where: { businessId: biz }, data: { currentPeriodEnd: new Date(Date.now() - DAY) } });
    await expect(startMakePrimary({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds)).rejects.toThrow(/renew/i);
    await prisma.subscription.updateMany({ where: { businessId: biz }, data: { currentPeriodEnd: new Date(Date.now() + DAY), razorpaySubscriptionId: null, autoPay: null } });
    await expect(startMakePrimary({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds)).rejects.toThrow(/auto-pay/i);
  });

  it("on verify points the subscription at the new one, cancels the old one and keeps the old card as a secondary", async () => {
    const { biz, primary, secondary } = await withTwoCards();
    const start = await startMakePrimary({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds);
    rz[start.razorpaySubscriptionId].status = "authenticated";
    pays.pay_auth = card("pay_auth", "token_B", "1111", "cust_T1");
    await verifyMakePrimary({ businessId: biz, productKey: KEY, razorpaySubscriptionId: start.razorpaySubscriptionId, razorpayPaymentId: "pay_auth", signature: subSig(start.razorpaySubscriptionId, "pay_auth") }, creds);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub).toMatchObject({ razorpaySubscriptionId: start.razorpaySubscriptionId, autoPay: "ACTIVE" });
    expect(calls.some((c) => c.path === "/subscriptions/sub_OLD/cancel")).toBe(true);
    const list = await listMethods(biz, KEY);
    expect(list.map((m) => [m.id === secondary.id ? "B" : m.id === primary.id ? "A" : "?", m.isPrimary])).toEqual([["B", true], ["A", false]]);
  });

  it("changes nothing when the new method was not authorised", async () => {
    const { biz, secondary } = await withTwoCards();
    const start = await startMakePrimary({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds);
    pays.pay_auth = card("pay_auth", "token_B", "1111", "cust_T1");
    await expect(verifyMakePrimary({ businessId: biz, productKey: KEY, razorpaySubscriptionId: start.razorpaySubscriptionId, razorpayPaymentId: "pay_auth", signature: subSig(start.razorpaySubscriptionId, "pay_auth") }, creds)).rejects.toThrow(/authoris/);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { businessId: biz, endDate: null } });
    expect(sub.razorpaySubscriptionId).toBe("sub_OLD");
    expect(calls.some((c) => c.path === "/subscriptions/sub_OLD/cancel")).toBe(false);
  });

  it("refuses a subscription that this business did not start", async () => {
    const { biz } = await withTwoCards();
    rz.sub_FOREIGN = { status: "authenticated", current_start: null, current_end: null, notes: { businessId: "biz_other", productKey: KEY } };
    pays.pay_auth = card("pay_auth", "token_B", "1111", "cust_T1");
    await expect(verifyMakePrimary({ businessId: biz, productKey: KEY, razorpaySubscriptionId: "sub_FOREIGN", razorpayPaymentId: "pay_auth", signature: subSig("sub_FOREIGN", "pay_auth") }, creds)).rejects.toThrow(/verify/);
  });
});

describe("removing a method", () => {
  it("deletes a secondary's token at Razorpay and its row", async () => {
    const { biz } = await setup();
    await ensureRazorpayCustomer(biz, creds);
    pays.pay_1 = card("pay_1", "token_A", "4366");
    pays.pay_2 = card("pay_2", "token_B", "1111");
    await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    const secondary = await recordMethodFromPayment(biz, "pay_2", null, creds);
    await removeMethod({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds);
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/customers/cust_T1/tokens/token_B")).toBe(true);
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(1);
  });

  it("refuses the primary and the last method", async () => {
    const { biz } = await setup();
    await ensureRazorpayCustomer(biz, creds);
    pays.pay_1 = card("pay_1", "token_A", "4366");
    pays.pay_2 = card("pay_2", "token_B", "1111");
    const primary = await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    await expect(removeMethod({ businessId: biz, productKey: KEY, methodId: primary.id }, creds)).rejects.toThrow(/primary|last/);
    const secondary = await recordMethodFromPayment(biz, "pay_2", null, creds);
    await removeMethod({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds);
    const lone = await prisma.paymentMethod.findFirstOrThrow({ where: { businessId: biz } });
    await prisma.subscription.updateMany({ where: { businessId: biz }, data: { razorpaySubscriptionId: null, autoPay: null } });
    await expect(removeMethod({ businessId: biz, productKey: KEY, methodId: lone.id }, creds)).rejects.toThrow(/last/);
  });

  it("keeps the row when Razorpay cannot delete the token", async () => {
    const { biz } = await setup();
    await ensureRazorpayCustomer(biz, creds);
    pays.pay_1 = card("pay_1", "token_A", "4366");
    pays.pay_2 = card("pay_2", "token_B", "1111");
    await recordMethodFromPayment(biz, "pay_1", "sub_OLD", creds);
    const secondary = await recordMethodFromPayment(biz, "pay_2", null, creds);
    failPaths = ["/customers/cust_T1/tokens"];
    await expect(removeMethod({ businessId: biz, productKey: KEY, methodId: secondary.id }, creds)).rejects.toThrow();
    expect(await prisma.paymentMethod.count({ where: { businessId: biz } })).toBe(2);
  });
});

describe("renewals after a switch", () => {
  it("charges a switched subscription: no payment carries its id yet, so the last paid payment of the business is the template", async () => {
    const { pro, biz } = await setup();
    await prisma.subscriptionPayment.create({ data: { id: "pay_prev", businessId: biz, productKey: KEY, planId: pro.id, interval: "MONTHLY", amount: 3000, gstPercent: 18, gstAmount: 540, total: 3540, status: "PAID", razorpaySubscriptionId: "sub_OLD", razorpayPaymentId: "pay_old_charge", paidAt: new Date(Date.now() - 20 * DAY) } });
    await prisma.subscription.updateMany({ where: { businessId: biz }, data: { razorpaySubscriptionId: "sub_NEW" } });
    const start = new Date(Date.now() + 10 * DAY);
    const paid = await chargeAutoPay({ razorpaySubscriptionId: "sub_NEW", razorpayPaymentId: "pay_renewal", periodStart: start, periodEnd: new Date(start.getTime() + 30 * DAY) });
    expect(paid).toMatchObject({ status: "PAID", razorpayPaymentId: "pay_renewal", total: expect.anything() });
    expect(Number(paid!.total)).toBe(3540);
    expect(await prisma.subscriptionPayment.count({ where: { businessId: biz, status: "PAID" } })).toBe(2);
  });
});

describe("the first monthly purchase", () => {
  it("passes the business's Razorpay customer to the subscription so its cards can be saved and listed", async () => {
    const { pro, biz } = await setup();
    await prisma.subscription.deleteMany({ where: { businessId: biz } });
    await startAutoPayCheckout({ businessId: biz, productKey: KEY, planId: pro.id, buyer: { name: "Methods Test Kitchen", addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: null, gstin: null } });
    const made = calls.find((c) => c.path === "/subscriptions");
    expect(made?.body).toMatchObject({ customer_id: expect.stringMatching(/^cust_T/) });
    expect(calls.filter((c) => c.path === "/customers")).toHaveLength(1);
  });
});
