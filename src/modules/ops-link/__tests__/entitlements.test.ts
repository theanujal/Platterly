import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newId, type EntitlementSnapshot } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { POST as commandsPOST } from "@/app/api/ops/commands/route";
import { signedHeaders } from "@platterly/contract";
import { assertMultiLocationPlan, assertWithinPlanLimit, hasMultiLocationPlan, PlanLimitError } from "@/modules/subscriptions/limits";
import { getSeatUsage } from "@/modules/team/team";
import { getPublishedTenantBySlug, listPublishedTenantSlugs } from "@/modules/tenants/tenant";
import { flagOf, getEntitlements, isLocked, limitOf, lockedOrganizationIds, viewFromPlan, viewFromSnapshot } from "../entitlements";

const DAY = 86_400_000;
const COMMAND_SECRET = "opssec_entitlements_test";
const saved: Record<string, string | undefined> = {};
const orgIds: string[] = [];
const planIds: string[] = [];

function linkOn() {
  process.env.OPS_BASE_URL = "http://127.0.0.1:9";
  process.env.OPS_EVENT_SECRET = "opssec_event_x";
  process.env.OPS_COMMAND_SECRETS = COMMAND_SECRET;
  process.env.OPS_BILLING = "1";
}
function linkOff() {
  delete process.env.OPS_BASE_URL;
  delete process.env.OPS_BILLING;
}

beforeAll(() => {
  for (const k of ["OPS_BASE_URL", "OPS_EVENT_SECRET", "OPS_COMMAND_SECRETS", "OPS_BILLING"]) saved[k] = process.env[k];
});
beforeEach(linkOff);
afterEach(async () => {
  await prisma.opsSnapshot.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.opsCommand.deleteMany({ where: { businessId: { in: (await prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { businessId: true } })).map((o) => o.businessId) } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = 0;
  planIds.length = 0;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function makeKitchen(opts: { plan?: Partial<{ maxCustomers: number | null; maxUsers: number | null; multiLocation: boolean; isTrial: boolean }>; sub?: "none" | "TRIALING" | "ACTIVE" | "EXPIRED"; trialEndsAt?: Date | null; currentPeriodEnd?: Date | null; published?: boolean } = {}) {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Entitlement Kitchen", slug: `ent-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date(), slugChangeCount: opts.published ? 1 : 0 },
  });
  orgIds.push(org.id);
  let plan = null;
  if (opts.sub !== "none") {
    plan = await prisma.subscriptionPlan.create({ data: { code: `ent-${crypto.randomUUID().slice(0, 8)}`, name: "Ent Plan", isTrial: false, maxCustomers: 2, maxUsers: 3, multiLocation: false, ...opts.plan } });
    planIds.push(plan.id);
    await prisma.subscription.create({ data: { organizationId: org.id, subscriptionPlanId: plan.id, status: opts.sub ?? "ACTIVE", trialEndsAt: opts.trialEndsAt ?? null, currentPeriodEnd: opts.currentPeriodEnd ?? null } });
  }
  return org;
}

function snapshot(businessId: string, over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    businessId, productKey: "catering", subscriptionId: newId("subscription"), version: 1, plan: { code: "ops-pro", name: "Ops Pro" }, status: "ACTIVE", interval: "MONTHLY",
    currentPeriodEnd: null, trialEndsAt: null, entitlements: { maxCustomers: 1, maxUsers: 9, multiLocation: true }, issuedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 7 * DAY).toISOString(), ...over,
  };
}

async function push(businessId: string, snap: EntitlementSnapshot) {
  const body = JSON.stringify({ commandId: newId("command"), businessId, type: "snapshot.push", payload: { snapshot: snap } });
  const res = await commandsPOST(new Request("http://127.0.0.1:3000/api/ops/commands", { method: "POST", headers: signedHeaders(COMMAND_SECRET, newId("command"), body), body }));
  return { status: res.status, body: await res.json() };
}

describe("entitlements from the plan rows (unchanged behaviour)", () => {
  it("an active paid plan is open and carries the plan's limits and flag", async () => {
    const org = await makeKitchen({ plan: { maxCustomers: 5, maxUsers: null, multiLocation: true }, sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() + DAY) });
    const view = await getEntitlements(org.id);
    expect(view).toMatchObject({ source: "plan", status: "ACTIVE", locked: false, stale: false, planName: "Ent Plan" });
    expect(limitOf(view, "maxCustomers")).toBe(5);
    expect(limitOf(view, "maxUsers")).toBeNull();
    expect(flagOf(view, "multiLocation")).toBe(true);
  });

  it("a running trial is TRIALING and open; an ended trial, an ended paid period and a cancelled plan lock", async () => {
    const trial = await makeKitchen({ sub: "TRIALING", trialEndsAt: new Date(Date.now() + DAY) });
    expect(await getEntitlements(trial.id)).toMatchObject({ status: "TRIALING", locked: false });
    const trialEnded = await makeKitchen({ sub: "TRIALING", trialEndsAt: new Date(Date.now() - DAY) });
    expect(await getEntitlements(trialEnded.id)).toMatchObject({ status: "LOCKED", locked: true });
    const periodEnded = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() - DAY) });
    expect(await getEntitlements(periodEnded.id)).toMatchObject({ status: "LOCKED", locked: true });
    const cancelled = await makeKitchen({ sub: "EXPIRED" });
    expect(await getEntitlements(cancelled.id)).toMatchObject({ status: "CANCELLED", locked: true });
  });

  it("a plan assigned by hand (no period end) never locks, and a kitchen with no subscription stays open without multiple locations", async () => {
    const manual = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: null });
    expect((await getEntitlements(manual.id)).locked).toBe(false);
    const none = await makeKitchen({ sub: "none" });
    const view = await getEntitlements(none.id);
    expect(view).toMatchObject({ source: "plan", locked: false, planName: null });
    expect(limitOf(view, "maxCustomers")).toBeNull();
    expect(flagOf(view, "multiLocation")).toBe(false);
  });

  it("limits, the seat limit and the multi-location check keep working from the plan rows", async () => {
    const org = await makeKitchen({ plan: { maxCustomers: 1, maxUsers: 2, multiLocation: false } });
    await assertWithinPlanLimit(org.id, "maxCustomers");
    await prisma.customer.create({ data: { organizationId: org.id, name: "A Customer", phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` } });
    await expect(assertWithinPlanLimit(org.id, "maxCustomers")).rejects.toThrow(PlanLimitError);
    expect((await getSeatUsage(org.id)).limit).toBe(2);
    expect(await hasMultiLocationPlan(org.id)).toBe(false);
    await expect(assertMultiLocationPlan(org.id)).rejects.toThrow(/does not include multiple locations/);
  });

  it("viewFromPlan needs no database", () => {
    expect(viewFromPlan(null)).toMatchObject({ status: "ACTIVE", locked: false });
  });
});

describe("entitlements from an ops snapshot", () => {
  it("a pushed snapshot wins over the plan rows: it can lock a kitchen whose plan row is active, and change its limits", async () => {
    linkOn();
    const org = await makeKitchen({ plan: { maxCustomers: 50, maxUsers: 50, multiLocation: false }, sub: "ACTIVE" });
    expect((await getEntitlements(org.id)).source).toBe("plan");

    expect((await push(org.businessId, snapshot(org.businessId, { version: 1 }))).body).toMatchObject({ applied: true });
    const view = await getEntitlements(org.id);
    expect(view).toMatchObject({ source: "ops", status: "ACTIVE", locked: false, planName: "Ops Pro" });
    expect(limitOf(view, "maxCustomers")).toBe(1);
    expect((await getSeatUsage(org.id)).limit).toBe(9);
    expect(await hasMultiLocationPlan(org.id)).toBe(true);

    await push(org.businessId, snapshot(org.businessId, { version: 2, status: "LOCKED" }));
    expect(await isLocked(org.id)).toBe(true);
    // The plan row still says ACTIVE; ops's explicit lock is what counts.
    expect((await prisma.subscription.findFirstOrThrow({ where: { organizationId: org.id } })).status).toBe("ACTIVE");
  });

  it("limits come from the snapshot: one customer allowed means the second is refused", async () => {
    linkOn();
    const org = await makeKitchen({ plan: { maxCustomers: 99 } });
    await push(org.businessId, snapshot(org.businessId));
    await assertWithinPlanLimit(org.id, "maxCustomers");
    await prisma.customer.create({ data: { organizationId: org.id, name: "A Customer", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
    await expect(assertWithinPlanLimit(org.id, "maxCustomers")).rejects.toThrow(/Ops Pro plan allows 1 customers/);
  });

  it("an older snapshot version never replaces a newer one", async () => {
    linkOn();
    const org = await makeKitchen();
    await push(org.businessId, snapshot(org.businessId, { version: 5, status: "LOCKED" }));
    expect((await push(org.businessId, snapshot(org.businessId, { version: 4, status: "ACTIVE" }))).body).toMatchObject({ applied: false });
    expect(await isLocked(org.id)).toBe(true);
  });

  it("is ignored while OPS_BILLING is off, even with the link on and a snapshot stored (the plan rows stay the source)", async () => {
    linkOn();
    const org = await makeKitchen({ plan: { maxCustomers: 7 } });
    await push(org.businessId, snapshot(org.businessId, { status: "LOCKED" }));
    delete process.env.OPS_BILLING;
    expect(await getEntitlements(org.id)).toMatchObject({ source: "plan", locked: false });
    expect(await isLocked(org.id)).toBe(false);
    process.env.OPS_BILLING = "1";
    expect(await isLocked(org.id)).toBe(true);
  });

  it("is ignored while the link is off, and a damaged stored snapshot falls back to the plan rows", async () => {
    linkOn();
    const org = await makeKitchen({ plan: { maxCustomers: 7 } });
    await push(org.businessId, snapshot(org.businessId, { status: "LOCKED" }));
    expect((await getEntitlements(org.id)).locked).toBe(true);
    linkOff();
    expect(await getEntitlements(org.id)).toMatchObject({ source: "plan", locked: false });

    linkOn();
    await prisma.opsSnapshot.update({ where: { organizationId: org.id }, data: { data: { nonsense: true } } });
    expect(await getEntitlements(org.id)).toMatchObject({ source: "plan", locked: false });
  });

  it("keeps working for 5 days after validUntil when ops is silent, then locks; an explicit lock never gets grace", () => {
    const base = snapshot(newId("business"), { validUntil: new Date(Date.now() - 2 * DAY).toISOString(), issuedAt: new Date(Date.now() - 9 * DAY).toISOString() });
    expect(viewFromSnapshot(base)).toMatchObject({ locked: false, stale: true });
    expect(viewFromSnapshot({ ...base, validUntil: new Date(Date.now() - 6 * DAY).toISOString() })).toMatchObject({ locked: true, stale: false });
    expect(viewFromSnapshot({ ...base, status: "LOCKED" }).locked).toBe(true);
    expect(viewFromSnapshot({ ...base, validUntil: new Date(Date.now() + DAY).toISOString(), status: "PAST_DUE" })).toMatchObject({ locked: false, status: "PAST_DUE" });
  });
});

describe("the lock in the public storefront", () => {
  it("hides a locked kitchen's storefront and sitemap entry, from the plan rows or from a snapshot", async () => {
    const open = await makeKitchen({ sub: "ACTIVE", published: true });
    const lockedByPlan = await makeKitchen({ sub: "ACTIVE", currentPeriodEnd: new Date(Date.now() - DAY), published: true });
    expect(await getPublishedTenantBySlug(open.slug)).not.toBeNull();
    expect(await getPublishedTenantBySlug(lockedByPlan.slug)).toBeNull();
    const slugs = (await listPublishedTenantSlugs()).map((s) => s.slug);
    expect(slugs).toContain(open.slug);
    expect(slugs).not.toContain(lockedByPlan.slug);

    linkOn();
    await push(open.businessId, snapshot(open.businessId, { status: "LOCKED" }));
    expect(await getPublishedTenantBySlug(open.slug)).toBeNull();
    expect((await listPublishedTenantSlugs()).map((s) => s.slug)).not.toContain(open.slug);
  });

  it("lockedOrganizationIds answers for many kitchens with one snapshot query", async () => {
    linkOn();
    const a = await makeKitchen({ sub: "ACTIVE" });
    const b = await makeKitchen({ sub: "ACTIVE" });
    await push(b.businessId, snapshot(b.businessId, { status: "CANCELLED" }));
    const locked = await lockedOrganizationIds([{ id: a.id, createdAt: new Date(), subscription: null }, { id: b.id, createdAt: new Date(), subscription: null }]);
    expect([...locked]).toEqual([b.id]);
  });
});
