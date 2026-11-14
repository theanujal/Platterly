import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { registerProduct } from "@/modules/registry/products";
import { createPlan } from "@/modules/plans/plans";
import { BillingError } from "../billing-error";
import { approveRefund, listRefundHistory, listRefundQueue, rejectRefund, requestRefund } from "../refunds";
import { newSubscriptionId } from "@/modules/snapshots/issue";
import { renderCreditNote } from "../invoice-pdf";
import { refundable, splitRefund } from "../refund-math";

const KEY = "refundtest";
const manifest = { contract: 1, productKey: KEY, name: "Refund Test", version: "1", baseUrl: "https://x.example", entitlements: [{ key: "maxCustomers", type: "limit", label: "Customers" }], trial: { days: 7, entitlements: {} } };
const creds = { keyId: "k", keySecret: "s", webhookSecret: "" };
const newBiz = () => `biz_${Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32)}`;
let calls: { url: string; body: { amount: number } }[] = [];
let razorpayFails = false;
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
  return razorpayFails ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ id: `rfnd_${calls.length}_${Math.random().toString(16).slice(2)}`, status: "processed" }), { status: 200 });
}) as typeof fetch;

async function clean() {
  await prisma.messageLog.deleteMany({ where: { productKey: KEY } });
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.refund.deleteMany({ where: { payment: { productKey: KEY } } });
  await prisma.refundRequest.deleteMany({ where: { payment: { productKey: KEY } } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { name: { startsWith: "RefundTest" } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
async function setup(over: Partial<{ status: "PAID" | "PENDING"; razorpayPaymentId: string | null; importedFrom: string | null; paidAt: Date; subscription: boolean }> = {}) {
  const plan = await createPlan({ productKey: KEY, code: "pro", name: "Pro", isTrial: false, priceMonthly: 100, priceAnnual: 1000, gstPercent: 18, highlights: [], entitlements: { maxCustomers: 10 } }, null);
  const businessId = newBiz();
  await prisma.business.create({ data: { id: businessId, name: "RefundTest Spice", ownerEmail: "o@example.test", ownerName: "O", products: { create: { productKey: KEY } } } });
  const payment = await prisma.subscriptionPayment.create({
    data: { id: `pay_${Math.random().toString(16).slice(2)}`, businessId, productKey: KEY, planId: plan.id, interval: "ANNUAL", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, status: over.status ?? "PAID", razorpayPaymentId: over.razorpayPaymentId === undefined ? `pay_rzp_${Math.random().toString(16).slice(2)}` : over.razorpayPaymentId, importedFrom: over.importedFrom ?? null, paidAt: over.paidAt ?? new Date(), invoiceNumber: "RT-26-11-1", periodStart: new Date(), periodEnd: new Date(Date.now() + 365 * 86_400_000), invoiceSnapshot: { seller: { legalName: "Platterly Pvt Ltd", addressLine1: null, addressLine2: null, city: "Bengaluru", state: "Karnataka", stateCode: "29", postalCode: null, country: "India", gstin: "29AAAAA0000A1Z5", pan: null, sacCode: "998314", email: null, phone: null, website: null, note: null }, buyer: { name: "RefundTest Spice", addressLine1: "1 Main", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India", gstin: null }, gst: { kind: "INTER", lines: [{ label: "IGST (18%)", amount: 180 }] }, highlights: ["Menus"] } },
  });
  if (over.subscription) await prisma.subscription.create({ data: { id: newSubscriptionId(), businessId, productKey: KEY, planId: plan.id, status: "ACTIVE", billingInterval: "ANNUAL", currentPeriodEnd: new Date(Date.now() + 300 * 86_400_000) } });
  return { businessId, payment };
}

beforeEach(async () => {
  await clean();
  calls = [];
  razorpayFails = false;
  await registerProduct({ key: KEY, name: "Refund Test", baseUrl: "https://x.example", actorUserId: null });
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
});
afterEach(clean);

describe("refund arithmetic", () => {
  it("a full refund gives back exactly the payment's figures", () => {
    expect(splitRefund({ total: 1180, gstAmount: 180 }, 1180)).toEqual({ amount: 1000, gstAmount: 180, total: 1180 });
  });
  it("a partial refund carries the same GST share and always adds up", () => {
    expect(splitRefund({ total: 1180, gstAmount: 180 }, 590)).toEqual({ amount: 500, gstAmount: 90, total: 590 });
    const s = splitRefund({ total: 1180, gstAmount: 180 }, 333.33);
    expect(Math.round((s.amount + s.gstAmount) * 100)).toBe(33333);
  });
  it("what is left is what was paid less refunds, never negative", () => {
    expect(refundable(1180, 0)).toBe(1180);
    expect(refundable(1180, 500.5)).toBe(679.5);
    expect(refundable(1180, 2000)).toBe(0);
  });
});

describe("requesting a refund", () => {
  it("records a pending request for a paid payment", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "  Closed the business " });
    expect(r.status).toBe("PENDING");
    expect(r.reason).toBe("Closed the business");
  });
  it("needs a reason, a paid payment of the same business, and refuses a second open request", async () => {
    const { businessId, payment } = await setup();
    await expect(requestRefund({ paymentId: payment.id, businessId, reason: " " })).rejects.toThrow(BillingError);
    await expect(requestRefund({ paymentId: payment.id, businessId: newBiz(), reason: "x" })).rejects.toThrow("not found");
    await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    await expect(requestRefund({ paymentId: payment.id, businessId, reason: "y" })).rejects.toThrow("already waiting");
  });
  it("refuses an unpaid or imported payment", async () => {
    const a = await setup({ status: "PENDING", razorpayPaymentId: null });
    await expect(requestRefund({ paymentId: a.payment.id, businessId: a.businessId, reason: "x" })).rejects.toThrow("Only a paid payment");
    await clean();
    await registerProduct({ key: KEY, name: "Refund Test", baseUrl: "https://x.example", actorUserId: null });
  await prisma.product.update({ where: { key: KEY }, data: { manifest } });
    const b = await setup({ importedFrom: "catering:1" });
    await expect(requestRefund({ paymentId: b.payment.id, businessId: b.businessId, reason: "x" })).rejects.toThrow("before the move");
  });
});

describe("deciding a refund", () => {
  it("approving a partial refund calls Razorpay in paise, records the GST split and a credit note, and closes the request", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    const refund = await approveRefund({ requestId: r.id, totalRupees: 590, endMode: "KEEP_TO_PERIOD_END", actorUserId: null, now: new Date("2026-11-15T10:00:00Z") }, fakeFetch, creds);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://api.razorpay.com/v1/payments/${payment.razorpayPaymentId}/refund`);
    expect(calls[0].body.amount).toBe(59000);
    expect([Number(refund.amount), Number(refund.gstAmount), Number(refund.total)]).toEqual([500, 90, 590]);
    expect(refund.creditNoteNumber).toMatch(/^[A-Z0-9]+CN[A-Z0-9]+-26-11-1$/);
    expect((await prisma.refundRequest.findUnique({ where: { id: r.id } }))?.status).toBe("APPROVED");
  });
  it("cannot refund more than is left, across several refunds, and credit notes run 1, 2", async () => {
    const { businessId, payment } = await setup();
    const r1 = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    const f1 = await approveRefund({ requestId: r1.id, totalRupees: 1000, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds);
    const r2 = await requestRefund({ paymentId: payment.id, businessId, reason: "again" });
    await expect(approveRefund({ requestId: r2.id, totalRupees: 200, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds)).rejects.toThrow("Rs 180.00");
    const f2 = await approveRefund({ requestId: r2.id, totalRupees: 180, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds);
    expect(f1.creditNoteNumber.endsWith("-1")).toBe(true);
    expect(f2.creditNoteNumber.endsWith("-2")).toBe(true);
    await expect(requestRefund({ paymentId: payment.id, businessId, reason: "z" })).rejects.toThrow("refunded in full");
  });
  it("a failed Razorpay refund records nothing and leaves the request pending", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    razorpayFails = true;
    await expect(approveRefund({ requestId: r.id, totalRupees: 100, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds)).rejects.toThrow();
    expect((await prisma.refundRequest.findUnique({ where: { id: r.id } }))?.status).toBe("PENDING");
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0);
  });
  it("an amount of zero or none is refused before Razorpay is called; a request cannot be decided twice", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    await expect(approveRefund({ requestId: r.id, totalRupees: 0, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds)).rejects.toThrow("Enter an amount");
    expect(calls).toHaveLength(0);
    await rejectRefund({ requestId: r.id, note: " not eligible ", actorUserId: null });
    expect((await prisma.refundRequest.findUnique({ where: { id: r.id } }))?.rejectionNote).toBe("not eligible");
    await expect(rejectRefund({ requestId: r.id, actorUserId: null })).rejects.toThrow("not waiting");
    await expect(approveRefund({ requestId: r.id, totalRupees: 100, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds)).rejects.toThrow("not waiting");
  });
});

describe("the 7-day window", () => {
  it("refuses a request for a payment older than 7 days, and accepts one on the 7th day", async () => {
    const old = await setup({ paidAt: new Date(Date.now() - 8 * 86_400_000) });
    await expect(requestRefund({ paymentId: old.payment.id, businessId: old.businessId, reason: "x" })).rejects.toThrow("within 7 days");
    await clean();
    await registerProduct({ key: KEY, name: "Refund Test", baseUrl: "https://x.example", actorUserId: null });
    await prisma.product.update({ where: { key: KEY }, data: { manifest } });
    const fresh = await setup({ paidAt: new Date(Date.now() - 6.9 * 86_400_000) });
    expect((await requestRefund({ paymentId: fresh.payment.id, businessId: fresh.businessId, reason: "x" })).status).toBe("PENDING");
  });
});

describe("what approval does to the plan, and who is told", () => {
  it("END_NOW locks the kitchen at once and the owner is emailed the refund", async () => {
    const { businessId, payment } = await setup({ subscription: true });
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    await approveRefund({ requestId: r.id, totalRupees: 1180, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds);
    expect((await prisma.subscription.findFirst({ where: { businessId, productKey: KEY } }))?.status).toBe("LOCKED");
    const all = await prisma.messageLog.findMany({ where: { businessId, template: "refund_approved" } });
    expect(all.map((m) => m.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
    const mails = all.filter((m) => m.channel === "EMAIL");
    expect(mails[0].variables).toMatchObject({ amount: 1180, endMode: "END_NOW" });
  });
  it("KEEP_TO_PERIOD_END keeps the plan active but stops renewal", async () => {
    const { businessId, payment } = await setup({ subscription: true });
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    await approveRefund({ requestId: r.id, totalRupees: 500, endMode: "KEEP_TO_PERIOD_END", actorUserId: null }, fakeFetch, creds);
    const sub = await prisma.subscription.findFirst({ where: { businessId, productKey: KEY } });
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.cancelledAt).not.toBeNull();
  });
  it("declining emails the owner with the staff note and leaves the plan alone", async () => {
    const { businessId, payment } = await setup({ subscription: true });
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    await rejectRefund({ requestId: r.id, note: "Past our policy", actorUserId: null });
    expect((await prisma.subscription.findFirst({ where: { businessId, productKey: KEY } }))?.status).toBe("ACTIVE");
    const mails = await prisma.messageLog.findMany({ where: { businessId, template: "refund_declined", channel: "EMAIL" } });
    expect(mails[0]?.variables).toMatchObject({ note: "Past our policy" });
  });
  it("asking for a refund tells staff", async () => {
    const { businessId, payment } = await setup();
    await requestRefund({ paymentId: payment.id, businessId, reason: "Closing" });
    expect(await prisma.notification.count({ where: { productKey: KEY, kind: "refund.requested" } })).toBe(1);
  });
});

describe("the Refunds page data and the credit note", () => {
  it("the queue shows the open request with what can still be refunded; decided ones move to the history with their credit note", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    const queue = (await listRefundQueue()).filter((q) => q.id === r.id);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ total: 1180, refundable: 1180 });
    const refund = await approveRefund({ requestId: r.id, totalRupees: 590, endMode: "KEEP_TO_PERIOD_END", actorUserId: null }, fakeFetch, creds);
    expect((await listRefundQueue()).some((q) => q.id === r.id)).toBe(false);
    const done = (await listRefundHistory()).find((h) => h.id === r.id);
    expect(done?.refund).toMatchObject({ total: 590, creditNoteNumber: refund.creditNoteNumber });
  });
  it("the credit note PDF renders from the invoice's snapshot", async () => {
    const { businessId, payment } = await setup();
    const r = await requestRefund({ paymentId: payment.id, businessId, reason: "x" });
    const refund = await approveRefund({ requestId: r.id, totalRupees: 590, endMode: "END_NOW", actorUserId: null }, fakeFetch, creds);
    const pdf = await renderCreditNote(refund.id);
    expect(pdf?.fileName).toBe(`${refund.creditNoteNumber}.pdf`);
    expect(Buffer.from(pdf!.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await renderCreditNote("rf_missing")).toBeNull();
  });
});
