import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newId, signedHeaders, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { assignPlan } from "@/modules/subscriptions/subscription";
import { createPlan, deactivatePlan, updatePlan } from "@/modules/subscriptions/plan";
import { savePlatformBillingProfile, type PlatformBillingInput } from "@/modules/subscriptions/platform-billing";
import { provisionTenantForNewUser } from "@/modules/tenants/auto-provision";
import { opsBillingOn } from "../config";
import { FIRST_SNAPSHOT_WINDOW_HOURS, getEntitlements, isLocked, lockedOrganizationIds } from "../entitlements";
import { storeSnapshot } from "../snapshots";

/**
 * The cutover (docs/ops-contract.md 8.3): entitlements, sign-up and the refusal of local plan editing with OPS_BILLING on and off. Caterly's own billing
 * screens (and the code behind them) were removed when billing moved to the Platterly Account and Store (AJ, 2026-11-14), so they are no longer tested here.
 * Ops here is a small signed stand-in server, so every request's signature, path and body is checked.
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
// How the stand-in answers: a map "METHOD path-prefix" -> { status, body, delayMs }. Anything not listed is a 500.
let answers: Record<string, { status: number; body: unknown; delayMs?: number }> = {};
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
    req.on("end", async () => {
      requests.push({ method: req.method!, path: req.url!, body, headers: req.headers });
      const key = Object.keys(answers).find((k) => `${req.method} ${req.url}`.startsWith(k));
      const answer = key ? answers[key] : { status: 500, body: { error: "unexpected" } };
      if (answer.delayMs) await new Promise((r) => setTimeout(r, answer.delayMs));
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
    const own = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() - 8 * DAY) });
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

  it("with the flag on a new kitchen gets no local subscription (ops starts its trial), and ops is told about it without the sign-up waiting", async () => {
    on();
    // Ops is slow to answer (it starts the trial and sends the welcome email first): sign-up must not wait for it.
    answers = { "POST /api/products/events": { status: 200, body: { ok: true }, delayMs: 2000 } };
    const user = await newUser();
    const started = Date.now();
    const { organizationId } = await provisionTenantForNewUser(user.id);
    expect(Date.now() - started).toBeLessThan(1500);
    orgIds.push(organizationId!);
    expect(await prisma.subscription.count({ where: { organizationId: organizationId! } })).toBe(0);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId! } });
    // Both still reach ops, the sign-up first and then the welcome email request.
    const events = () => requests.filter((r) => r.path === "/api/products/events").map((r) => JSON.parse(r.body));
    await vi.waitFor(() => expect(events().map((e) => e.type)).toEqual(["business.signed_up", "message.requested"]), { timeout: 8000 });
    expect(events()[0]).toMatchObject({ businessId: org.businessId, data: { ownerEmail: user.email } });
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
