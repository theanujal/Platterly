import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createPlan } from "@/modules/subscriptions/plan";
import { assignPlan, getCurrentSubscription } from "@/modules/subscriptions/subscription";
import { confirmSubscriptionPayment, getBillingState, listSellablePlans, scheduleDowngrade, startSubscriptionCheckout } from "@/modules/subscriptions/billing";
import { annualSaving, billingLockReason, periodEndFrom, priceBreakdown } from "@/modules/subscriptions/billing-math";
import { assertWithinPlanLimit } from "@/modules/subscriptions/limits";
import { createCustomer } from "@/modules/customers/customer";

const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];
const DAY = 86400000;

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.subscriptionPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = planIds.length = userIds.length = 0;
});

async function setup(planInput: Partial<Parameters<typeof createPlan>[0]> = {}) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Billing Test Org", slug: `bill-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const make = async (name: string, priceMonthly: number, extra: Partial<Parameters<typeof createPlan>[0]> = {}) => {
    const plan = await createPlan({ code: `bt-${crypto.randomUUID().slice(0, 8)}`, name, priceMonthly, priceAnnual: priceMonthly * 11, ...extra });
    planIds.push(plan.id);
    return plan;
  };
  return { org, actor, make, planInput };
}

async function payFor(orgId: string, planId: string, interval: "MONTHLY" | "ANNUAL", now = new Date()) {
  const orderId = `order_${crypto.randomUUID().slice(0, 12)}`;
  await prisma.subscriptionPayment.create({ data: { organizationId: orgId, subscriptionPlanId: planId, interval, amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, razorpayOrderId: orderId } });
  return confirmSubscriptionPayment(orderId, `pay_${crypto.randomUUID().slice(0, 8)}`, now);
}

describe("billing maths (Chunk 20)", () => {
  it("adds GST on top of the price and rounds to paise", () => {
    expect(priceBreakdown(3000, 18)).toEqual({ amount: 3000, gstPercent: 18, gstAmount: 540, total: 3540 });
    expect(priceBreakdown(999.99, 18).gstAmount).toBe(180);
    expect(priceBreakdown(1000, 0).total).toBe(1000);
  });
  it("a month buys 30 days and a year 365; the yearly saving is against twelve months", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    expect(periodEndFrom(start, "MONTHLY").getTime() - start.getTime()).toBe(30 * DAY);
    expect(periodEndFrom(start, "ANNUAL").getTime() - start.getTime()).toBe(365 * DAY);
    expect(annualSaving(3000, 33000)).toBe(3000);
    expect(annualSaving(3000, 40000)).toBe(0);
  });
  it("locks only an ended trial, an ended paid period, or a dead subscription", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const before = new Date(now.getTime() - DAY);
    const after = new Date(now.getTime() + DAY);
    expect(billingLockReason(null, now)).toBeNull();
    expect(billingLockReason({ status: "TRIALING", trialEndsAt: after, currentPeriodEnd: null }, now)).toBeNull();
    expect(billingLockReason({ status: "TRIALING", trialEndsAt: before, currentPeriodEnd: null }, now)).toBe("trial_ended");
    expect(billingLockReason({ status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: before }, now)).toBe("period_ended");
    expect(billingLockReason({ status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: after }, now)).toBeNull();
    // A plan the Super Admin assigned by hand has no period and never locks.
    expect(billingLockReason({ status: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null }, now)).toBeNull();
    expect(billingLockReason({ status: "EXPIRED", trialEndsAt: null, currentPeriodEnd: null }, now)).toBe("ended");
  });
});

describe("paying for a plan (Chunk 20)", () => {
  it("lists only active paid plans with a price, with GST worked out from the plan's own rate", async () => {
    const { make } = await setup();
    const sold = await make("Sellable", 3000, { gstPercent: 18 });
    const hidden = await make("Hidden", 5000);
    await prisma.subscriptionPlan.update({ where: { id: hidden.id }, data: { isActive: false } });
    const unpriced = await createPlan({ code: `bt-${crypto.randomUUID().slice(0, 8)}`, name: "Unpriced" });
    planIds.push(unpriced.id);
    const plans = await listSellablePlans();
    const found = plans.find((plan) => plan.id === sold.id)!;
    expect(found.monthly.total).toBe(3540);
    expect(found.annual?.amount).toBe(33000);
    expect(plans.some((plan) => plan.id === hidden.id || plan.id === unpriced.id)).toBe(false);
  });

  it("checkout says online payment is not switched on while Platterly's Razorpay keys are missing", async () => {
    const { org, actor, make } = await setup();
    const plan = await make("Pro", 3000);
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    await expect(startSubscriptionCheckout(org.id, plan.id, "MONTHLY", actor.id)).rejects.toThrow(/not switched on/);
    expect(await prisma.subscriptionPayment.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("a confirmed first payment ends the trial lock: a 30-day plan, a numbered invoice, one payment row", async () => {
    const { org, actor, make } = await setup();
    const trial = await createPlan({ code: `bt-${crypto.randomUUID().slice(0, 8)}`, name: "Trial", isTrial: true, trialDurationDays: 7 });
    planIds.push(trial.id);
    const pro = await make("Pro", 3000);
    await assignPlan(org.id, trial.id, actor.id);
    await prisma.subscription.updateMany({ where: { organizationId: org.id }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    expect((await getBillingState(org.id)).lockReason).toBe("trial_ended");

    const now = new Date();
    const paid = await payFor(org.id, pro.id, "MONTHLY", now);
    expect(paid?.status).toBe("PAID");
    expect(paid?.invoiceNumber).toMatch(/^FPBTO-\d{2}-\d{2}-\d+$/);
    expect(paid?.invoiceSnapshot).toMatchObject({ buyer: { name: "Billing Test Org" }, gst: { kind: "UNKNOWN" } });
    expect(paid?.periodEnd?.getTime()).toBe(now.getTime() + 30 * DAY);

    const state = await getBillingState(org.id);
    expect(state.locked).toBe(false);
    expect(state.subscription?.subscriptionPlanId).toBe(pro.id);
    expect(state.subscription?.status).toBe("ACTIVE");
    expect(await prisma.subscription.count({ where: { organizationId: org.id, endDate: null } })).toBe(1);
  });

  it("the same Razorpay payment confirmed twice (checkout and webhook) makes one period and one invoice", async () => {
    const { org, make } = await setup();
    const pro = await make("Pro", 3000);
    const orderId = `order_${crypto.randomUUID().slice(0, 12)}`;
    await prisma.subscriptionPayment.create({ data: { organizationId: org.id, subscriptionPlanId: pro.id, interval: "MONTHLY", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, razorpayOrderId: orderId } });
    const [a, b] = await Promise.all([confirmSubscriptionPayment(orderId, "pay_1"), confirmSubscriptionPayment(orderId, "pay_1")]);
    expect(a?.status).toBe("PAID");
    expect(b?.status).toBe("PAID");
    expect(await prisma.subscription.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.subscriptionPayment.count({ where: { organizationId: org.id, invoiceNumber: { not: null } } })).toBe(1);
  });

  it("renewing early adds a period on top of what is left; a lapsed kitchen restarts from today", async () => {
    const { org, make } = await setup();
    const pro = await make("Pro", 3000);
    const t0 = new Date();
    await payFor(org.id, pro.id, "MONTHLY", t0);
    const second = await payFor(org.id, pro.id, "MONTHLY", new Date(t0.getTime() + 5 * DAY));
    expect(second?.periodEnd?.getTime()).toBe(t0.getTime() + 60 * DAY);
    expect(await prisma.subscription.count({ where: { organizationId: org.id } })).toBe(1);

    const later = new Date(t0.getTime() + 100 * DAY);
    const third = await payFor(org.id, pro.id, "ANNUAL", later);
    expect(third?.periodEnd?.getTime()).toBe(later.getTime() + 365 * DAY);
  });

  it("an upgrade starts the new plan today; a downgrade waits until the next payment", async () => {
    const { org, actor, make } = await setup();
    const small = await make("Small", 1000);
    const big = await make("Big", 5000);
    await payFor(org.id, big.id, "MONTHLY");
    await scheduleDowngrade(org.id, small.id, "MONTHLY", actor.id);
    // Scheduling changes nothing now.
    let current = await getCurrentSubscription(org.id);
    expect(current?.subscriptionPlanId).toBe(big.id);
    expect(current?.pendingPlanId).toBe(small.id);

    // Paying for the lower plan is what moves the kitchen onto it, and clears the schedule.
    await payFor(org.id, small.id, "MONTHLY");
    current = await getCurrentSubscription(org.id);
    expect(current?.subscriptionPlanId).toBe(small.id);
    expect(current?.pendingPlanId).toBeNull();
  });
});

describe("plan limits stop usage (Chunk 20 Verify)", () => {
  it("blocks the customer past the plan's limit, with a plain message, and lets a plan with no limit through", async () => {
    const { org, actor, make } = await setup();
    const capped = await make("Capped", 1000, { maxCustomers: 1 });
    await assignPlan(org.id, capped.id, actor.id);
    await createCustomer(org.id, { name: "First", phone: "9876543210" }, actor.id);
    await expect(createCustomer(org.id, { name: "Second", phone: "9876543211" }, actor.id)).rejects.toThrow(/allows 1 customers/);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(1);

    const open = await make("Open", 2000);
    await assignPlan(org.id, open.id, actor.id);
    await expect(assertWithinPlanLimit(org.id, "maxCustomers")).resolves.toBeUndefined();
  });
});

describe("Platterly's own Razorpay webhook (Chunk 20)", () => {
  async function post(body: object, signature?: string) {
    const { POST } = await import("@/app/api/webhooks/razorpay-platform/route");
    const raw = JSON.stringify(body);
    return POST(new Request("http://catering.localhost/api/webhooks/razorpay-platform", { method: "POST", body: raw, headers: signature === undefined ? {} : { "x-razorpay-signature": signature } }));
  }
  const sign = async (raw: string, secret: string) => (await import("node:crypto")).createHmac("sha256", secret).update(raw).digest("hex");

  it("refuses everything while no webhook secret is set, and anything with a bad signature", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    expect((await post({ event: "payment.captured" }, "x")).status).toBe(401);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    expect((await post({ event: "payment.captured" }, "bad")).status).toBe(401);
    expect((await post({ event: "payment.captured" })).status).toBe(401);
  });

  it("a correctly signed 'captured' event confirms the payment and unlocks the kitchen", async () => {
    const { org, make } = await setup();
    const pro = await make("Pro", 3000);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    const orderId = `order_${crypto.randomUUID().slice(0, 12)}`;
    await prisma.subscriptionPayment.create({ data: { organizationId: org.id, subscriptionPlanId: pro.id, interval: "ANNUAL", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, razorpayOrderId: orderId } });
    const body = { event: "payment.captured", payload: { payment: { entity: { id: "pay_x1", order_id: orderId } } } };
    expect((await post(body, await sign(JSON.stringify(body), "whsec"))).status).toBe(200);
    const state = await getBillingState(org.id);
    expect(state.subscription?.billingInterval).toBe("ANNUAL");
    expect(state.locked).toBe(false);
  });
});

describe("Platterly's billing details (Chunk 20)", () => {
  it("every field is optional; bad tax numbers are refused in plain words", async () => {
    const { savePlatformBillingProfile, getPlatformBillingProfile } = await import("@/modules/subscriptions/platform-billing");
    const before = await getPlatformBillingProfile();
    const blank = { legalName: "", addressLine1: "", addressLine2: "", city: "", state: "", stateCode: "", postalCode: "", country: "", gstin: "", pan: "", sacCode: "", invoicePrefix: "FP", email: "", phone: "", website: "", invoiceNote: "" };
    try {
      await expect(savePlatformBillingProfile({ ...blank })).resolves.toMatchObject({ gstin: null, sacCode: "998314", invoicePrefix: "FP" });
      await expect(savePlatformBillingProfile({ ...blank, gstin: "BAD" })).rejects.toThrow(/GSTIN should look like/);
      await expect(savePlatformBillingProfile({ ...blank, pan: "12345" })).rejects.toThrow(/PAN should look like/);
      await expect(savePlatformBillingProfile({ ...blank, stateCode: "9" })).rejects.toThrow(/two digits/);
      await expect(savePlatformBillingProfile({ ...blank, gstin: "29ABCDE1234F1Z5", stateCode: "27" })).rejects.toThrow(/different state code/);
      await expect(savePlatformBillingProfile({ ...blank, invoicePrefix: "TOO-LONG!" })).rejects.toThrow(/Invoice prefix/);
      const ok = await savePlatformBillingProfile({ ...blank, gstin: "29abcde1234f1z5", stateCode: "29", invoicePrefix: "fp" });
      expect(ok.gstin).toBe("29ABCDE1234F1Z5");
    } finally {
      await savePlatformBillingProfile({ ...blank, legalName: before.legalName ?? "", addressLine1: before.addressLine1 ?? "", addressLine2: before.addressLine2 ?? "", city: before.city ?? "", state: before.state ?? "", stateCode: before.stateCode ?? "", postalCode: before.postalCode ?? "", country: before.country ?? "", gstin: before.gstin ?? "", pan: before.pan ?? "", sacCode: before.sacCode, invoicePrefix: before.invoicePrefix, email: before.email ?? "", phone: before.phone ?? "", website: before.website ?? "", invoiceNote: before.invoiceNote ?? "" });
    }
  });
});
