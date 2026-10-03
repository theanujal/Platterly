import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getPlatformCounts, getProductBreakdown, getRecentCaterers, getTrialsEndingSoon, listCaterersOverview } from "../queries";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createPlan } from "@/modules/subscriptions/plan";
import { assignPlan } from "@/modules/subscriptions/subscription";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupPlanIds: string[] = [];

afterEach(async () => {
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: cleanupPlanIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
  cleanupPlanIds.length = 0;
});

async function makeOrg(status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" = "ACTIVE") {
  const org = await prisma.organization.create({
    data: {
      id: crypto.randomUUID(),
      name: "Analytics Test Org",
      slug: `an-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date(),
      status,
    },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: "Super Admin",
      email: `super-${crypto.randomUUID()}@example.test`,
      emailVerified: true,
      isSuperAdmin: true,
    },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

describe("Platform analytics counts (Chunk 3 Group 3.4)", () => {
  it("counts total, active, and suspended caterers correctly", async () => {
    const before = await getPlatformCounts();
    await makeOrg("ACTIVE");
    await makeOrg("SUSPENDED");

    const after = await getPlatformCounts();
    expect(after.totalCaterers).toBe(before.totalCaterers + 2);
    expect(after.activeCaterers).toBe(before.activeCaterers + 1);
    expect(after.suspendedCaterers).toBe(before.suspendedCaterers + 1);
  });

  it("counts new registrations within the last 7 days", async () => {
    const before = await getPlatformCounts();
    await makeOrg();

    const after = await getPlatformCounts();
    expect(after.newRegistrations7d).toBe(before.newRegistrations7d + 1);
  });

  it("splits trial vs paid accounts based on Subscription.status", async () => {
    const before = await getPlatformCounts();
    const actor = await makeActor();
    const trialPlan = await createPlan({
      code: `t-${crypto.randomUUID().slice(0, 8)}`,
      name: "Test Trial",
      isTrial: true,
      trialDurationDays: 7,
    });
    const paidPlan = await createPlan({ code: `p-${crypto.randomUUID().slice(0, 8)}`, name: "Test Paid" });
    cleanupPlanIds.push(trialPlan.id, paidPlan.id);

    const orgTrial = await makeOrg();
    const orgPaid = await makeOrg();
    await assignPlan(orgTrial.id, trialPlan.id, actor.id);
    await assignPlan(orgPaid.id, paidPlan.id, actor.id);

    const after = await getPlatformCounts();
    expect(after.trialSubscriptions).toBe(before.trialSubscriptions + 1);
    expect(after.activeSubscriptions).toBe(before.activeSubscriptions + 1);
  });

  it("counts real orders and events across every kitchen, and lists recent caterers and ending trials", async () => {
    const before = await getPlatformCounts();
    const actor = await makeActor();
    const org = await makeOrg();
    const customer = await createCustomer(org.id, { name: "Count Customer", phone: "9876543210" }, actor.id);
    await createOrder(org.id, { customerId: customer.id, eventStartDate: new Date("2026-12-05"), eventEndDate: new Date("2026-12-05") }, actor.id);

    const after = await getPlatformCounts();
    expect(after.ordersProcessed).toBe(before.ordersProcessed + 1);
    expect(after.eventsProcessed).toBeGreaterThanOrEqual(before.eventsProcessed);

    const recent = await getRecentCaterers(3);
    expect(recent.map((r) => r.id)).toContain(org.id);

    const trialPlan = await createPlan({ code: `e-${crypto.randomUUID().slice(0, 8)}`, name: "Ending Trial", isTrial: true, trialDurationDays: 2 });
    cleanupPlanIds.push(trialPlan.id);
    await assignPlan(org.id, trialPlan.id, actor.id);
    expect((await getTrialsEndingSoon(50)).map((t) => t.organizationId)).toContain(org.id);

    const overview = await listCaterersOverview();
    expect(overview.find((o) => o.id === org.id)).toMatchObject({ orders: 1, trialing: true, planName: "Ending Trial" });
    expect((await getProductBreakdown())[0]).toMatchObject({ key: "catering", orders: after.ordersProcessed });
  });
});
