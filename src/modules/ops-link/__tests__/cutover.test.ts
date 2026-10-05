import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, signedHeaders, verifyRequest, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { assignPlan } from "@/modules/subscriptions/subscription";
import { createPlan, deactivatePlan, updatePlan } from "@/modules/subscriptions/plan";
import { savePlatformBillingProfile, type PlatformBillingInput } from "@/modules/subscriptions/platform-billing";
import { cancelScheduledDowngrade, getPaymentInvoice, getSubscribeData, getSubscriptionPageData, scheduleDowngrade, startCheckout, verifyCheckout } from "@/modules/subscriptions/billing-source";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { opsBillingOn } from "../config";
import { FIRST_SNAPSHOT_WINDOW_HOURS, getEntitlements, isLocked, lockedOrganizationIds } from "../entitlements";
import { storeSnapshot } from "../snapshots";

/**
 * The cutover (docs/ops-contract.md 8.3): with OPS_BILLING off the billing screens read catering's own rows; with it on they
 * ask Platterly Ops. Ops here is a small signed stand-in server, so every request's signature, path and body is checked.
 */
const EVENT_SECRET = "opssec_cutover_event";
const COMMAND_SECRET = "opssec_cutover_command";
const startedAt = new Date();
const DAY = 86_400_000;
const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];
const userIds: string[] = [];
const planIds: string[] = [];

let server: Server;
let baseUrl = "";
let requests: { method: string; path: string; body: string; headers: Record<string, string | string[] | undefined> }[] = [];
// How the stand-in answers: a map "METHOD path-prefix" -> { status, body }. Anything not listed is a 500.
let answers: Record<string, { status: number; body: unknown }> = {};
let unsigned = false;

function on() {
  process.env.OPS_BASE_URL = baseUrl;
  process.env.OPS_EVENT_SECRET = EVENT_SECRET;
  process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
  process.env.OPS_PRODUCT_KEY = "catering";
  process.env.OPS_BILLING = "1";
}
function off() {
  delete process.env.OPS_BASE_URL;
  delete process.env.OPS_BILLING;
}

beforeAll(async () => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_PRODUCT_KEY", "OPS_BILLING"]) saved[k] = process.env[k];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method!, path: req.url!, body, headers: req.headers });
      const key = Object.keys(answers).find((k) => `${req.method} ${req.url}`.startsWith(k));
      const answer = key ? answers[key] : { status: 500, body: { error: "unexpected" } };
      const text = JSON.stringify(answer.body);
      res.writeHead(answer.status, unsigned ? { "content-type": "application/json" } : signedHeaders(COMMAND_SECRET, newId("command"), text));
      res.end(text);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  requests = [];
  answers = {};
  unsigned = false;
  off();
});
afterEach(async () => {
  await prisma.opsSnapshot.deleteMany({ where: { OR: [{ organizationId: { in: orgIds } }, { receivedAt: { gte: startedAt } }] } });
  await prisma.opsPull.deleteMany({ where: { lastPulledAt: { gte: startedAt } } });
  await prisma.opsOutbox.deleteMany({ where: { createdAt: { gte: startedAt } } });
  await prisma.subscriptionPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.member.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = 0;
  userIds.length = 0;
  planIds.length = 0;
});

async function makeKitchen(opts: { sub?: "none" | "TRIALING" | "ACTIVE"; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null; createdAt?: Date; gst?: string | null } = {}) {
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(), name: "Cutover Kitchen", slug: `cut-${crypto.randomUUID().slice(0, 8)}`, createdAt: opts.createdAt ?? new Date(),
      addressLine1: "1 Main Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstNumber: opts.gst === undefined ? "29ABCDE1234F1Z5" : opts.gst,
    },
  });
  orgIds.push(org.id);
  if (opts.sub !== "none") {
    const plan = await prisma.subscriptionPlan.create({ data: { code: `cut-${crypto.randomUUID().slice(0, 8)}`, name: "Local Plan", maxCustomers: 5, maxUsers: 3, maxEvents: 9, maxOrders: 11, priceMonthly: 700, priceAnnual: 7000 } });
    planIds.push(plan.id);
    await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: opts.sub ?? "ACTIVE", trialEndsAt: opts.trialEndsAt ?? null, currentPeriodEnd: opts.currentPeriodEnd ?? null } });
  }
  return org;
}

function snapshot(businessId: string, over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    businessId, productKey: "catering", subscriptionId: newId("subscription"), version: 1, plan: { code: "pro", name: "Ops Pro" }, status: "ACTIVE", interval: "MONTHLY", currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(), trialEndsAt: null,
    entitlements: { maxCustomers: 50, maxUsers: 8, maxEvents: 80, maxOrders: 90, multiLocation: false }, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * DAY).toISOString(), ...over,
  };
}

const offer = (id: string, name: string, monthly: number, annual: number | null) => ({
  id, code: name.toLowerCase(), name, description: `${name} plan`, highlights: ["A"], monthly: { amount: monthly, gstPercent: 18, gstAmount: monthly * 0.18, total: monthly * 1.18 },
  annual: annual === null ? null : { amount: annual, gstPercent: 18, gstAmount: annual * 0.18, total: annual * 1.18 },
});
const billingView = (planId: string, over: Record<string, unknown> = {}) => ({
  onlineBillingAvailable: true,
  subscription: { id: "sub_1", status: "ACTIVE", plan: { id: planId, code: "pro", name: "Ops Pro" }, billingInterval: "MONTHLY", startDate: new Date(Date.now() - 5 * DAY).toISOString(), trialEndsAt: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(), pending: null },
  history: [{ id: "sub_0", planName: "Trial", status: "CANCELLED", startDate: new Date(Date.now() - 12 * DAY).toISOString(), endDate: new Date(Date.now() - 5 * DAY).toISOString() }, { id: "sub_1", planName: "Ops Pro", status: "ACTIVE", startDate: new Date(Date.now() - 5 * DAY).toISOString(), endDate: null }],
  payments: [{ id: "pay_1", planName: "Ops Pro", interval: "MONTHLY", total: 1180, paidAt: new Date().toISOString(), periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 30 * DAY).toISOString(), invoiceNumber: "FPCK-26-10-300" }],
  ...over,
});

describe("with OPS_BILLING off the screens read catering's own rows and never call ops", () => {
  it("the lock screen and the Settings page show the plan rows, in the one shape", async () => {
    const org = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
    process.env.OPS_BASE_URL = baseUrl; // link on, flag off: still no calls
    process.env.OPS_EVENT_SECRET = EVENT_SECRET;
    process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
    const data = await getSubscribeData(org.id);
    expect(data).toMatchObject({ locked: false, unavailable: false, subscription: { status: "ACTIVE", planName: "Local Plan", priceMonthly: 700, limits: { maxUsers: 3, maxEvents: 9, maxOrders: 11 } } });
    const page = await getSubscriptionPageData(org.id);
    expect(page).toMatchObject({ unavailable: false, historyInvoices: true, current: { planName: "Local Plan", priceAnnual: 7000 } });
    expect(page.history).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it("a locked kitchen reports why, and a paid payment's invoice is read from its own row", async () => {
    const org = await makeKitchen({ sub: "TRIALING", trialEndsAt: new Date(Date.now() - DAY) });
    expect(await getSubscribeData(org.id)).toMatchObject({ locked: true, lockReason: "trial_ended" });
    expect(await getPaymentInvoice(org.id, "pay_nope")).toBeNull();
    const plan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { id: { in: planIds } } });
    const payment = await prisma.subscriptionPayment.create({
      data: { organizationId: org.id, subscriptionPlanId: plan.id, interval: "MONTHLY", amount: 700, gstPercent: 18, gstAmount: 126, total: 826, status: "PAID", razorpayOrderId: `order_${crypto.randomUUID()}`, razorpayPaymentId: "pay_local", invoiceNumber: `FPT-${crypto.randomUUID().slice(0, 6)}`, paidAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * DAY), invoiceSnapshot: { seller: {}, buyer: { name: "X" }, gst: { kind: "UNKNOWN", lines: [] }, highlights: [] } },
    });
    expect(await getPaymentInvoice(org.id, payment.id)).toMatchObject({ planName: "Local Plan", total: 826, razorpayPaymentId: "pay_local", gstAmount: 126 });
    expect(await getPaymentInvoice("someone-else", payment.id)).toBeNull();
    expect(requests).toHaveLength(0);
  });
});

describe("with OPS_BILLING on the screens ask ops", () => {
  it("shows ops's plans and subscription, with limits from the snapshot, and signs every request", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId));
    answers = { "GET /api/products/catering/billing/plans": { status: 200, body: { plans: [offer("plan_pro", "Pro", 1000, 10000), offer("plan_lite", "Lite", 500, null)] } }, [`GET /api/products/catering/businesses/${org.businessId}/billing`]: { status: 200, body: billingView("plan_pro") } };
    const data = await getSubscribeData(org.id);
    expect(data.unavailable).toBe(false);
    expect(data.plans.map((p) => p.name)).toEqual(["Pro", "Lite"]);
    expect(data.plans[0]).toMatchObject({ monthly: { total: 1180 }, priceMonthly: 1000 });
    expect(data.subscription).toMatchObject({ status: "ACTIVE", planId: "plan_pro", planName: "Ops Pro", priceMonthly: 1000, priceAnnual: 10000, limits: { maxUsers: 8, maxEvents: 80, maxOrders: 90 } });
    expect(data).toMatchObject({ locked: false, onlineBilling: true });
    for (const r of requests) expect(verifyRequest([EVENT_SECRET], new Headers(r.headers as Record<string, string>), r.body)).toMatchObject({ ok: true });
  });

  it("the Settings page gets history without per-row PDFs, real payments with their GST, and the pending plan", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId));
    answers = {
      "GET /api/products/catering/billing/plans": { status: 200, body: { plans: [offer("plan_pro", "Ops Pro", 1000, 10000), offer("plan_lite", "Lite", 500, null)] } },
      [`GET /api/products/catering/businesses/${org.businessId}/billing`]: { status: 200, body: billingView("plan_pro", { subscription: { ...billingView("plan_pro").subscription, pending: { planId: "plan_lite", planName: "Lite", interval: "MONTHLY" } } }) },
    };
    const page = await getSubscriptionPageData(org.id);
    expect(page).toMatchObject({ unavailable: false, historyInvoices: false, current: { pendingPlanName: "Lite", pendingInterval: "MONTHLY" } });
    expect(page.history.map((h) => h.planName)).toEqual(["Trial", "Ops Pro"]);
    expect(page.payments[0]).toMatchObject({ planName: "Ops Pro", total: 1180, gstAmount: 180, invoiceNumber: "FPCK-26-10-300" });
  });

  it("says billing is unavailable (and still knows the lock) when ops is down, unsigned, or answers with garbage", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId, { status: "LOCKED" }));
    process.env.OPS_BASE_URL = "http://127.0.0.1:9";
    expect(await getSubscribeData(org.id)).toMatchObject({ unavailable: true, plans: [], locked: true });
    expect(await getSubscriptionPageData(org.id)).toMatchObject({ unavailable: true, current: null });

    process.env.OPS_BASE_URL = baseUrl;
    unsigned = true;
    answers = { "GET /api/products/catering/billing/plans": { status: 200, body: { plans: [offer("plan_evil", "Fake", 1, null)] } } };
    expect(await getSubscribeData(org.id)).toMatchObject({ unavailable: true, plans: [] });
    unsigned = false;
    answers = {};
    expect((await getSubscribeData(org.id)).unavailable).toBe(true);
  });

  it("starts a checkout with the business's own invoice details and returns Razorpay's order", async () => {
    const org = await makeKitchen({ sub: "none", gst: "29ABCDE1234F1Z5" });
    on();
    answers = { [`POST /api/products/catering/businesses/${org.businessId}/billing/checkout`]: { status: 200, body: { keyId: "rzp_k", razorpayOrderId: "order_1", amountPaise: 118000, businessName: "Cutover Kitchen", description: "Pro plan, 30 days" } } };
    expect(await startCheckout(org.id, "plan_pro", "MONTHLY", "user-1")).toMatchObject({ keyId: "rzp_k", razorpayOrderId: "order_1", amountPaise: 118000 });
    expect(JSON.parse(requests[0].body)).toEqual({ planId: "plan_pro", interval: "MONTHLY", buyer: { name: "Cutover Kitchen", addressLine1: "1 Main Rd", addressLine2: null, city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "India", gstin: "29ABCDE1234F1Z5" } });
  });

  it("shows ops's own message for a refusal, a friendly one for an unknown business, and a generic one when ops fails", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    const path = `POST /api/products/catering/businesses/${org.businessId}/billing/checkout`;
    answers = { [path]: { status: 400, body: { error: "Online payment is not switched on yet. Please contact Platterly." } } };
    await expect(startCheckout(org.id, "p", "MONTHLY", "u")).rejects.toThrow("Online payment is not switched on yet. Please contact Platterly.");
    answers = { [path]: { status: 404, body: { error: "unknown_business" } } };
    await expect(startCheckout(org.id, "p", "MONTHLY", "u")).rejects.toThrow(/could not find your billing record/);
    answers = { [path]: { status: 500, body: { error: "boom" } } };
    await expect(startCheckout(org.id, "p", "MONTHLY", "u")).rejects.toThrow(/could not be reached/);
    answers = { [path]: { status: 400, body: { error: "That plan is not available." } } };
    await expect(startCheckout(org.id, "p", "MONTHLY", "u")).rejects.toBeInstanceOf(ValidationError);
  });

  it("verifying a payment asks ops, then pulls the new snapshot so the lock lifts at once", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId, { version: 1, status: "LOCKED" }));
    expect(await isLocked(org.id)).toBe(true);
    const base = `/api/products/catering/businesses/${org.businessId}/billing`;
    answers = { [`POST ${base}/verify`]: { status: 200, body: { ok: true, status: "PAID", invoiceNumber: "FP-1" } }, [`GET /api/products/catering/snapshots/${org.businessId}`]: { status: 200, body: snapshot(org.businessId, { version: 2, status: "ACTIVE" }) } };
    await verifyCheckout(org.id, { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "a".repeat(64) });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([`POST ${base}/verify`, `GET /api/products/catering/snapshots/${org.businessId}`]);
    expect(await isLocked(org.id)).toBe(false);
  });

  it("a payment ops cannot verify stays locked and shows ops's message", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId, { status: "LOCKED" }));
    answers = { [`POST /api/products/catering/businesses/${org.businessId}/billing/verify`]: { status: 400, body: { error: "We could not verify this payment." } } };
    await expect(verifyCheckout(org.id, { razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "a".repeat(64) })).rejects.toThrow("We could not verify this payment.");
    expect(await isLocked(org.id)).toBe(true);
  });

  it("schedules and cancels a downgrade through ops", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    const path = `/api/products/catering/businesses/${org.businessId}/billing/downgrade`;
    answers = { [`POST ${path}`]: { status: 200, body: { ok: true } }, [`DELETE ${path}`]: { status: 200, body: { ok: true } } };
    await scheduleDowngrade(org.id, "plan_lite", "MONTHLY", "u");
    await cancelScheduledDowngrade(org.id, "u");
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([`POST ${path}`, `DELETE ${path}`]);
    expect(JSON.parse(requests[0].body)).toEqual({ planId: "plan_lite", interval: "MONTHLY" });
  });

  it("prints an invoice from ops's frozen copy, and answers null for an unknown payment", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    const base = `/api/products/catering/businesses/${org.businessId}/billing/payments`;
    const snap = { seller: { legalName: "Platterly" }, buyer: { name: "Cutover Kitchen" }, gst: { kind: "INTRA", lines: [{ label: "CGST (9%)", amount: 90 }] }, highlights: ["A"] };
    answers = { [`GET ${base}/pay_1`]: { status: 200, body: { invoiceNumber: "FPCK-26-10-300", planName: "Ops Pro", interval: "MONTHLY", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, paidAt: "2026-10-05T10:00:00.000Z", periodStart: "2026-10-05T10:00:00.000Z", periodEnd: "2026-11-04T10:00:00.000Z", razorpayPaymentId: "pay_rzp", snapshot: snap } }, [`GET ${base}/pay_missing`]: { status: 404, body: { error: "unknown_invoice" } } };
    expect(await getPaymentInvoice(org.id, "pay_1")).toMatchObject({ invoiceNumber: "FPCK-26-10-300", total: 1180, razorpayPaymentId: "pay_rzp", paidAt: new Date("2026-10-05T10:00:00.000Z"), snapshot: { gst: { kind: "INTRA" } } });
    expect(await getPaymentInvoice(org.id, "pay_missing")).toBeNull();
  });
});

describe("entitlements with OPS_BILLING on and no snapshot yet", () => {
  it("a kitchen with its own subscription rows stays on them", async () => {
    const org = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 5 * DAY) });
    on();
    expect(await getEntitlements(org.id)).toMatchObject({ source: "plan", planName: "Local Plan", locked: false });
  });

  it("a brand-new kitchen runs on the manifest's trial defaults for its first 24 hours, then is locked as missing", async () => {
    const fresh = await makeKitchen({ sub: "none" });
    on();
    const view = await getEntitlements(fresh.id);
    expect(view).toMatchObject({ source: "ops", status: "TRIALING", locked: false, planName: "Trial", lockReason: null });
    expect(view.values.multiLocation).toBe(false);
    expect(view.trialEndsAt!.getTime() - fresh.createdAt.getTime()).toBe(7 * DAY);

    const old = await makeKitchen({ sub: "none", createdAt: new Date(Date.now() - (FIRST_SNAPSHOT_WINDOW_HOURS + 1) * 3_600_000) });
    expect(await getEntitlements(old.id)).toMatchObject({ source: "ops", status: "LOCKED", locked: true, lockReason: "ended" });
  });

  it("the moment a snapshot arrives it takes over", async () => {
    const org = await makeKitchen({ sub: "none" });
    on();
    await storeSnapshot(org.id, snapshot(org.businessId, { status: "TRIALING", trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString(), currentPeriodEnd: null }));
    expect(await getEntitlements(org.id)).toMatchObject({ source: "ops", status: "TRIALING", planName: "Ops Pro", locked: false });
  });

  it("with the flag off a kitchen with no subscription is open, as it always was", async () => {
    const org = await makeKitchen({ sub: "none", createdAt: new Date(Date.now() - 400 * DAY) });
    expect(await getEntitlements(org.id)).toMatchObject({ source: "plan", locked: false });
    expect(opsBillingOn()).toBe(false);
  });

  it("answers for many kitchens at once: snapshot, own rows, new and old", async () => {
    const withSnap = await makeKitchen({ sub: "none" });
    const own = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() - DAY) });
    const fresh = await makeKitchen({ sub: "none" });
    const stale = await makeKitchen({ sub: "none", createdAt: new Date(Date.now() - 3 * DAY) });
    on();
    await storeSnapshot(withSnap.id, snapshot(withSnap.businessId));
    const ownSub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: own.id }, include: { subscriptionPlan: true } });
    const locked = await lockedOrganizationIds([
      { id: withSnap.id, createdAt: withSnap.createdAt, subscription: null },
      { id: own.id, createdAt: own.createdAt, subscription: ownSub },
      { id: fresh.id, createdAt: fresh.createdAt, subscription: null },
      { id: stale.id, createdAt: stale.createdAt, subscription: null },
    ]);
    expect([...locked].sort()).toEqual([own.id, stale.id].sort());
  });
});

describe("plans and billing details are refused in catering once ops owns them", () => {
  const profile: PlatformBillingInput = { legalName: "X", addressLine1: "", addressLine2: "", city: "", state: "", stateCode: "", postalCode: "", country: "", gstin: "", pan: "", sacCode: "", invoicePrefix: "FP", email: "", phone: "", website: "", invoiceNote: "" };
  const planInput = () => ({ code: `g-${crypto.randomUUID().slice(0, 8)}`, name: "Guard Plan", isTrial: false, priceMonthly: 100, priceAnnual: null, gstPercent: 18, highlights: [] as string[], multiLocation: false } as never);

  it("with the flag on, creating, editing and retiring a plan, assigning one, and saving the seller details all refuse", async () => {
    const org = await makeKitchen({ sub: "none" });
    const plan = await prisma.subscriptionPlan.create({ data: { code: `g-${crypto.randomUUID().slice(0, 8)}`, name: "G" } });
    planIds.push(plan.id);
    on();
    await expect(createPlan(planInput())).rejects.toThrow(/managed in Platterly Ops/);
    await expect(updatePlan(plan.id, planInput())).rejects.toThrow(/managed in Platterly Ops/);
    await expect(deactivatePlan(plan.id)).rejects.toThrow(/managed in Platterly Ops/);
    await expect(assignPlan(org.id, plan.id, "u")).rejects.toThrow(/managed in Platterly Ops/);
    await expect(savePlatformBillingProfile(profile)).rejects.toThrow(/managed in Platterly Ops/);
    expect(await prisma.subscription.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("with the flag off they work exactly as before", async () => {
    const created = await createPlan(planInput());
    planIds.push(created.id);
    expect(created.name).toBe("Guard Plan");
    await deactivatePlan(created.id);
  });
});

describe("sign-up", () => {
  async function newUser() {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Asha Rao", firstName: "Asha", lastName: "Rao", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    return user;
  }

  it("with the flag on a new kitchen gets no local subscription (ops starts its trial), and ops is told about it", async () => {
    on();
    answers = { "POST /api/products/events": { status: 200, body: { ok: true } } };
    const user = await newUser();
    const { organizationId } = await provisionTenantForNewUser(user.id);
    orgIds.push(organizationId!);
    expect(await prisma.subscription.count({ where: { organizationId: organizationId! } })).toBe(0);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId! } });
    const events = requests.filter((r) => r.path === "/api/products/events").map((r) => JSON.parse(r.body));
    expect(events.find((e) => e.type === "business.signed_up" && e.businessId === org.businessId)).toMatchObject({ data: { ownerEmail: user.email } });
    // It can still use the product while ops catches up.
    expect(await isLocked(organizationId!)).toBe(false);
  });

  it("with the flag off a new kitchen still starts its own 7-day trial", async () => {
    const user = await newUser();
    const { organizationId } = await provisionTenantForNewUser(user.id);
    orgIds.push(organizationId!);
    expect(await prisma.subscription.count({ where: { organizationId: organizationId!, status: "TRIALING" } })).toBe(1);
    await prisma.subscriptionPlan.deleteMany({ where: { id: { in: [] } } });
  });
});
