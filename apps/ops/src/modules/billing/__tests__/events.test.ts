import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST as webhookPOST } from "@/app/api/webhooks/razorpay/route";

/** Counts how often the route applies an auto-pay event, can make it throw, and notes whether the event was stored first. */
const applied = vi.hoisted(() => ({ count: 0, fail: false, storedFirst: false }));
vi.mock("@/modules/billing/billing", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/billing/billing")>();
  return {
    ...real,
    autoPayEvent: async (...args: Parameters<typeof real.autoPayEvent>) => {
      applied.count++;
      applied.storedFirst = (await prisma.razorpayEvent.count({ where: { razorpaySubscriptionId: args[1].id } })) > 0;
      if (applied.fail) throw new Error("database went away");
      return real.autoPayEvent(...args);
    },
  };
});

const KEY = "eventstest";
const BIZ = `biz_${"7".repeat(32)}`;
const WEBHOOK_SECRET = "razorpay_webhook_secret";
const savedEnv: Record<string, string | undefined> = {};

const hook = (eventId: string | null, body: object, secret = WEBHOOK_SECRET) => {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = { "x-razorpay-signature": createHmac("sha256", secret).update(text).digest("hex") };
  if (eventId) headers["x-razorpay-event-id"] = eventId;
  return webhookPOST(new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body: text, headers }));
};
const pending = (subId: string) => ({ event: "subscription.pending", payload: { subscription: { entity: { id: subId, status: "pending" } } } });

async function clean() {
  const rows = await prisma.razorpayEvent.findMany({ where: { OR: [{ eventId: { startsWith: "evtest_" } }, { razorpaySubscriptionId: { startsWith: "sub_Etest" } }] }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { dedupeKey: { in: rows.map((r) => `razorpay_event_failed:${r.id}`) } } });
  await prisma.razorpayEvent.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: BIZ } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}

beforeAll(() => {
  savedEnv.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
});
afterAll(async () => {
  await clean();
  if (savedEnv.RAZORPAY_WEBHOOK_SECRET === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  else process.env.RAZORPAY_WEBHOOK_SECRET = savedEnv.RAZORPAY_WEBHOOK_SECRET;
});
beforeEach(async () => {
  await clean();
  applied.count = 0;
  applied.fail = false;
  applied.storedFirst = false;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

describe("the Razorpay payment log", () => {
  it("stores a signed webhook before applying it, with its ids and whole payload, and marks it processed", async () => {
    const body = { event: "subscription.charged", payload: { subscription: { entity: { id: "sub_Etest1", status: "active" } }, payment: { entity: { id: "pay_Etest1", order_id: "order_Etest1", amount: 354000, status: "captured" } } } };
    expect((await hook("evtest_1", body)).status).toBe(200);
    expect(applied.storedFirst).toBe(true);
    const row = await prisma.razorpayEvent.findUniqueOrThrow({ where: { eventId: "evtest_1" } });
    expect(row).toMatchObject({ source: "webhook", type: "subscription.charged", razorpaySubscriptionId: "sub_Etest1", razorpayPaymentId: "pay_Etest1", razorpayOrderId: "order_Etest1", payload: body, error: null, businessId: null });
    expect(row.processedAt).not.toBeNull();
  });

  it("stores and applies the same event id once", async () => {
    await hook("evtest_2", pending("sub_Etest2"));
    expect((await hook("evtest_2", pending("sub_Etest2"))).status).toBe(200);
    expect(await prisma.razorpayEvent.count({ where: { eventId: "evtest_2" } })).toBe(1);
    expect(applied.count).toBe(1);
  });

  it("keeps an event that could not be applied, asks Razorpay to retry, raises an alert, and applies the retry", async () => {
    applied.fail = true;
    expect((await hook("evtest_3", pending("sub_Etest3"))).status).toBe(500);
    const row = await prisma.razorpayEvent.findUniqueOrThrow({ where: { eventId: "evtest_3" } });
    expect(row).toMatchObject({ processedAt: null, error: "database went away" });
    expect(await prisma.notification.count({ where: { dedupeKey: `razorpay_event_failed:${row.id}` } })).toBe(1);
    applied.fail = false;
    expect((await hook("evtest_3", pending("sub_Etest3"))).status).toBe(200);
    expect(await prisma.razorpayEvent.findUniqueOrThrow({ where: { eventId: "evtest_3" } })).toMatchObject({ error: null, processedAt: expect.any(Date) });
  });

  it("fills the business from the payment the event matched, and keeps an event that matches nothing", async () => {
    await prisma.product.create({ data: { key: KEY, name: "Events Test", baseUrl: "https://x.example", outboundSecret: "x", inboundSecret: "x" } });
    const plan = await prisma.plan.create({ data: { productKey: KEY, code: "pro", name: "Pro" } });
    await prisma.business.create({ data: { id: BIZ, name: "EventsTest Kitchen", products: { create: { productKey: KEY } } } });
    await prisma.subscriptionPayment.create({ data: { id: "pay_eventstest", businessId: BIZ, productKey: KEY, planId: plan.id, interval: "MONTHLY", amount: 3000, gstPercent: 18, gstAmount: 540, total: 3540, razorpaySubscriptionId: "sub_Etest5" } });
    await hook("evtest_5", pending("sub_Etest5"));
    await hook("evtest_6", pending("sub_Etest6"));
    expect(await prisma.razorpayEvent.findUniqueOrThrow({ where: { eventId: "evtest_5" } })).toMatchObject({ businessId: BIZ });
    expect(await prisma.razorpayEvent.findUniqueOrThrow({ where: { eventId: "evtest_6" } })).toMatchObject({ businessId: null, processedAt: expect.any(Date) });
  });

  it("never stores a request with a bad or missing signature", async () => {
    expect((await hook("evtest_7", pending("sub_Etest7"), "wrong_secret")).status).toBe(401);
    const text = JSON.stringify(pending("sub_Etest7"));
    expect((await webhookPOST(new Request("http://127.0.0.1:3200/api/webhooks/razorpay", { method: "POST", body: text, headers: { "x-razorpay-event-id": "evtest_7" } }))).status).toBe(401);
    expect(await prisma.razorpayEvent.count({ where: { razorpaySubscriptionId: "sub_Etest7" } })).toBe(0);
  });
});
