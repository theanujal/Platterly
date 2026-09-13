import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getPlatformCounts } from "../queries";
import { createPlan } from "@/modules/subscriptions/plan";
import { assignPlan } from "@/modules/subscriptions/subscription";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupPlanIds: string[] = [];

afterEach(async () => {
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

  it("reports ordersProcessed and eventsProcessed as 0 stubs, structured as real fields for Chunk 9/10 to populate", async () => {
    const counts = await getPlatformCounts();
    expect(counts.ordersProcessed).toBe(0);
    expect(counts.eventsProcessed).toBe(0);
  });
});
