import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, requestTarget, signedHeaders } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { POST as openPOST } from "@/app/api/platform/account-deletions/route";
import { POST as statusPOST } from "@/app/api/platform/account-deletions/status/route";
import { POST as withdrawPOST } from "@/app/api/platform/account-deletions/withdraw/route";
import { POST as erasedPOST } from "@/app/api/platform/account-deletions/erased/route";
import { anonymiseBusinessRecords, scrubRazorpayCustomer, approveAccountDeletion, declineAccountDeletion, requestAccountErasure, restoreAccountDeletion } from "../account-deletions";

// The Platform opens a deletion request when a person asks on My Profile; staff decide; the Platform asks for the decision.
const SECRET = "platform-billing-secret-0123456789abcdef0123";
const BASE = "http://ops.localhost:3200";
const saved: Record<string, string | undefined> = {};
const ids: string[] = [];

beforeAll(() => { saved.PLATFORM_BILLING_SECRETS = process.env.PLATFORM_BILLING_SECRETS; });
beforeEach(() => { process.env.PLATFORM_BILLING_SECRETS = SECRET; });
afterEach(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { in: ids.map((i) => `account.deletion:${i}`) } } });
  await prisma.accountDeletionRequest.deleteMany({ where: { requestId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "account_deletion." }, subject: { in: ids } } });
});
afterAll(() => {
  if (saved.PLATFORM_BILLING_SECRETS === undefined) delete process.env.PLATFORM_BILLING_SECRETS;
  else process.env.PLATFORM_BILLING_SECRETS = saved.PLATFORM_BILLING_SECRETS;
});

const body = (over: Record<string, unknown> = {}) => {
  const requestId = `del-${crypto.randomUUID()}`;
  ids.push(requestId);
  return { requestId, subject: "sub-1", name: "Asha Rao", email: "asha@example.com", phone: "+919800000123", businessId: null, businessName: null, products: [], reason: "closing down", requestedAt: new Date().toISOString(), ...over };
};
const call = (handler: (r: Request) => Promise<Response>, path: string, payload: unknown, secret: string | null = SECRET) => {
  const text = JSON.stringify(payload);
  const url = `${BASE}${path}`;
  const id = newId("command");
  return handler(new Request(url, { method: "POST", body: text, headers: { "content-type": "application/json", ...(secret ? signedHeaders(secret, id, text, { target: requestTarget("POST", url) }) : {}) } }));
};
const open = (b: Record<string, unknown>) => call(openPOST, "/api/platform/account-deletions", b);
const status = async (requestId: string) => (await call(statusPOST, "/api/platform/account-deletions/status", { requestId })).json();
const idOf = async (requestId: string) => (await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { requestId } })).id;

describe("account deletion requests (Platform to Ops)", () => {
  it("opens a request, notifies staff once, and a repeat changes nothing", async () => {
    const b = body();
    const res = await open(b);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requestId: b.requestId, created: true });
    expect(await prisma.notification.count({ where: { dedupeKey: `account.deletion:${b.requestId}` } })).toBe(1);
    expect(await (await open(b)).json()).toEqual({ requestId: b.requestId, created: false });
    expect(await prisma.accountDeletionRequest.count({ where: { requestId: b.requestId } })).toBe(1);
    expect(await status(b.requestId)).toMatchObject({ status: "PENDING", declineReason: null });
  });

  it("refuses an unsigned call and a malformed request, and answers 404 for an unknown id", async () => {
    expect((await call(openPOST, "/api/platform/account-deletions", body(), null)).status).toBe(401);
    expect((await open(body({ email: "not-an-email" }))).status).toBe(400);
    expect((await call(statusPOST, "/api/platform/account-deletions/status", { requestId: "nope" })).status).toBe(404);
  });

  it("lets the person withdraw only while it is pending", async () => {
    const a = body();
    await open(a);
    expect(await (await call(withdrawPOST, "/api/platform/account-deletions/withdraw", { requestId: a.requestId })).json()).toEqual({ requestId: a.requestId, status: "WITHDRAWN" });
    const b = body();
    await open(b);
    await approveAccountDeletion(await idOf(b.requestId), null);
    expect(await (await call(withdrawPOST, "/api/platform/account-deletions/withdraw", { requestId: b.requestId })).json()).toEqual({ requestId: b.requestId, status: "APPROVED" });
  });

  it("approves (a retention end date is set), then restores", async () => {
    const b = body();
    await open(b);
    const id = await idOf(b.requestId);
    const now = new Date("2026-11-20T00:00:00Z");
    await approveAccountDeletion(id, null, now);
    expect(await status(b.requestId)).toMatchObject({ status: "APPROVED", eraseAfter: "2026-12-20T00:00:00.000Z" });
    await expect(approveAccountDeletion(id, null)).rejects.toThrow(/no longer pending/);
    await restoreAccountDeletion(id, null);
    expect(await status(b.requestId)).toMatchObject({ status: "RESTORED", eraseAfter: null });
  });

  it("declines only with a reason, and passes that reason on", async () => {
    const b = body();
    await open(b);
    const id = await idOf(b.requestId);
    await expect(declineAccountDeletion(id, "   ", null)).rejects.toThrow(/reason/);
    await declineAccountDeletion(id, "Please finish your open invoices first.", null);
    expect(await status(b.requestId)).toMatchObject({ status: "DECLINED", declineReason: "Please finish your open invoices first." });
    await expect(restoreAccountDeletion(id, null)).rejects.toThrow(/approved/);
  });
});

describe("final erasure (staff Erase now)", () => {
  it("needs an approved request and the person's email typed exactly; the Platform then sees it and its report closes the request with the details wiped", async () => {
    const b = body();
    await open(b);
    const id = await idOf(b.requestId as string);
    await expect(requestAccountErasure(id, "asha@example.com", null)).rejects.toThrow("Only an approved request can be erased.");
    await approveAccountDeletion(id, null);
    await expect(requestAccountErasure(id, "someone@else.com", null)).rejects.toThrow("Type the person's email exactly");
    expect((await status(b.requestId as string)).eraseRequested).toBe(false);
    // The Platform may not report an erase staff never asked for.
    expect((await call(erasedPOST, "/api/platform/account-deletions/erased", { requestId: b.requestId })).status).toBe(409);

    await requestAccountErasure(id, " ASHA@example.com ", null);
    await expect(requestAccountErasure(id, "asha@example.com", null)).rejects.toThrow("already started");
    expect((await status(b.requestId as string)).eraseRequested).toBe(true);
    expect((await call(erasedPOST, "/api/platform/account-deletions/erased", { requestId: b.requestId }, null)).status).toBe(401);
    const done = await call(erasedPOST, "/api/platform/account-deletions/erased", { requestId: b.requestId });
    expect(await done.json()).toEqual({ requestId: b.requestId, status: "ERASED" });
    expect(await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { requestId: b.requestId as string } })).toMatchObject({ status: "ERASED", name: "Erased", email: "erased", phone: "", reason: "" });
    // Reporting twice changes nothing.
    expect((await call(erasedPOST, "/api/platform/account-deletions/erased", { requestId: b.requestId })).status).toBe(200);
  });

  it("anonymises a business: the people go, the invoices stay without contact details", async () => {
    const businessId = `biz_${crypto.randomUUID().replace(/-/g, "")}`;
    const plan = await prisma.plan.findFirstOrThrow({});
    const product = { key: plan.productKey };
    await prisma.business.create({ data: { id: businessId, name: "Spice Route", ownerName: "Asha Rao", ownerEmail: "asha@example.com", ownerPhone: "+919800000123" } });
    try {
      await prisma.productBillingProfile.create({ data: { businessId, productKey: product.key, name: "Spice Route", source: "account", contactEmail: "asha@example.com" } });
      const buyer = { name: "Spice Route", city: "Pune", gstin: "27AAPFU0939F1ZV", contactName: "Asha Rao", contactEmail: "asha@example.com", contactPhone: "+919800000123" };
      await prisma.subscriptionPayment.create({ data: { id: `pay_${crypto.randomUUID()}`, businessId, productKey: product.key, planId: plan.id, interval: "ANNUAL", amount: 100, gstPercent: 18, gstAmount: 18, total: 118, status: "PAID", invoiceNumber: `ERASE-${crypto.randomUUID()}`, buyer, invoiceSnapshot: { seller: { name: "Platterly" }, buyer } } });
      await anonymiseBusinessRecords(businessId);
      expect(await prisma.productBillingProfile.count({ where: { businessId } })).toBe(0);
      expect(await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).toMatchObject({ ownerName: null, ownerEmail: null, ownerPhone: null });
      const pay = await prisma.subscriptionPayment.findFirstOrThrow({ where: { businessId } });
      expect(pay.buyer).toEqual({ name: "Spice Route", city: "Pune", gstin: "27AAPFU0939F1ZV" });
      expect(pay.invoiceSnapshot).toEqual({ seller: { name: "Platterly" }, buyer: { name: "Spice Route", city: "Pune", gstin: "27AAPFU0939F1ZV" } });
      expect(pay.status).toBe("PAID");
    } finally {
      await prisma.subscriptionPayment.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
  });
});

describe("erase gaps closed (Razorpay record, stand orders)", () => {
  const mk = async () => {
    const businessId = `biz_${crypto.randomUUID().replace(/-/g, "")}`;
    await prisma.business.create({ data: { id: businessId, name: "Gap Kitchen", ownerName: "Ravi", ownerEmail: "ravi@example.com", ownerPhone: "+919800000999" } });
    return businessId;
  };
  const cleanup = async (businessId: string) => {
    await prisma.standOrder.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  };

  it("stand orders lose delivery address, contact person and logo; amounts, invoice and legal buyer stay", async () => {
    const businessId = await mk();
    try {
      const buyer = { name: "Gap Kitchen", gstin: "27AAPFU0939F1ZV", contactName: "Ravi", contactEmail: "ravi@example.com", contactPhone: "+919800000999" };
      await prisma.standOrder.create({ data: { id: `so_${crypto.randomUUID()}`, businessId, productKey: "catering", quantity: 1, unitAmount: 100, amount: 100, gstPercent: 18, gstAmount: 18, total: 118, paymentStatus: "PAID", fulfilment: "DELIVERED", invoiceNumber: `SO-${crypto.randomUUID()}`, invoiceSnapshot: { buyer }, shipTo: { name: "Ravi", line1: "12 MG Road", phone: "+919800000999" }, buyer, kitchenName: "Gap Kitchen", kitchenLogoUrl: "http://x/logo.png", linkUrl: "http://x/l" } });
      await anonymiseBusinessRecords(businessId);
      const row = await prisma.standOrder.findFirstOrThrow({ where: { businessId } });
      expect(row.shipTo).toEqual({ erased: true });
      expect(row.buyer).toEqual({ name: "Gap Kitchen", gstin: "27AAPFU0939F1ZV" });
      expect(row.invoiceSnapshot).toEqual({ buyer: { name: "Gap Kitchen", gstin: "27AAPFU0939F1ZV" } });
      expect(row.kitchenLogoUrl).toBeNull();
      expect(Number(row.total)).toBe(118);
    } finally { await cleanup(businessId); }
  });

  it("Razorpay: saved tokens are deleted and the customer is overwritten with placeholders; a 404 is fine; nothing happens without keys", async () => {
    const businessId = await mk();
    const prev = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
    try {
      await prisma.razorpayCustomer.create({ data: { businessId, customerId: `cust_${businessId.slice(-8)}` } });
      await prisma.paymentMethod.create({ data: { id: `pm_${crypto.randomUUID()}`, businessId, kind: "CARD", label: "Visa ending 4366", razorpayTokenId: `token_${businessId.slice(-8)}` } });
      const calls: string[] = [];
      const fetchImpl = (async (url: string, init: RequestInit) => {
        calls.push(`${init.method} ${new URL(url).pathname}`);
        if (init.method === "DELETE") return new Response("{}", { status: 404 });
        return new Response(JSON.stringify({ id: "c" }), { status: 200 });
      }) as never;
      delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
      await scrubRazorpayCustomer(businessId, fetchImpl);
      expect(calls).toEqual([]);
      process.env.RAZORPAY_KEY_ID = "rzp_test_x"; process.env.RAZORPAY_KEY_SECRET = "s";
      await scrubRazorpayCustomer(businessId, fetchImpl);
      expect(calls).toEqual([`DELETE /v1/customers/cust_${businessId.slice(-8)}/tokens/token_${businessId.slice(-8)}`, `PUT /v1/customers/cust_${businessId.slice(-8)}`]);
      // Razorpay down: the erase must stop.
      await expect(scrubRazorpayCustomer(businessId, (async () => new Response("{}", { status: 500 })) as never)).rejects.toThrow(/Razorpay refused/);
    } finally {
      if (prev.id === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = prev.id;
      if (prev.secret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = prev.secret;
      await prisma.paymentMethod.deleteMany({ where: { businessId } });
      await prisma.razorpayCustomer.deleteMany({ where: { businessId } });
      await cleanup(businessId);
    }
  });

  it("refuses to erase while a paid printed-stand order is not delivered, and nothing is erased", async () => {
    const businessId = await mk();
    try {
      await prisma.standOrder.create({ data: { id: `so_${crypto.randomUUID()}`, businessId, productKey: "catering", quantity: 1, unitAmount: 100, amount: 100, gstPercent: 18, gstAmount: 18, total: 118, paymentStatus: "PAID", fulfilment: "PRINTING", shipTo: { line1: "12 MG Road" }, buyer: {}, kitchenName: "Gap Kitchen", linkUrl: "http://x/l" } });
      const b = body({ businessId, businessName: "Gap Kitchen" });
      await open(b);
      const id = await idOf(b.requestId as string);
      await approveAccountDeletion(id, null);
      await expect(requestAccountErasure(id, "asha@example.com", null)).rejects.toThrow(/printed-stand order has not been delivered/);
      expect((await prisma.standOrder.findFirstOrThrow({ where: { businessId } })).shipTo).toEqual({ line1: "12 MG Road" });
      expect((await prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id } })).eraseRequestedAt).toBeNull();
    } finally { await cleanup(businessId); }
  });
});
