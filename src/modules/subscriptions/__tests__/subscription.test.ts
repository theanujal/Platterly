import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createPlan } from "@/modules/subscriptions/plan";
import { assignPlan, getCurrentSubscription } from "@/modules/subscriptions/subscription";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupPlanIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.subscription.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: cleanupPlanIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
  cleanupPlanIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Assign Plan Test Org", slug: `apt-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("Manual tenant plan assignment (Chunk 3 Group 3.3)", () => {
  it("assignPlan creates a TRIALING subscription with trialEndsAt = now + trialDurationDays for the Trial plan", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const plan = await createPlan({
      code: `trial-${crypto.randomUUID().slice(0, 8)}`,
      name: "Test Trial",
      isTrial: true,
      trialDurationDays: 7,
    });
    cleanupPlanIds.push(plan.id);

    const subscription = await assignPlan(org.id, plan.id, actor.id);

    expect(subscription.status).toBe("TRIALING");
    expect(subscription.trialEndsAt).not.toBeNull();
    const expectedMs = subscription.startDate.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(subscription.trialEndsAt!.getTime()).toBe(expectedMs);
  });

  it("assignPlan creates an ACTIVE subscription with no trialEndsAt for a non-trial plan", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const plan = await createPlan({ code: `paid-${crypto.randomUUID().slice(0, 8)}`, name: "Test Paid" });
    cleanupPlanIds.push(plan.id);

    const subscription = await assignPlan(org.id, plan.id, actor.id);

    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.trialEndsAt).toBeNull();
  });

  it("assignPlan ends the tenant's prior current subscription when assigning a new plan", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const planA = await createPlan({ code: `a-${crypto.randomUUID().slice(0, 8)}`, name: "Plan A" });
    const planB = await createPlan({ code: `b-${crypto.randomUUID().slice(0, 8)}`, name: "Plan B" });
    cleanupPlanIds.push(planA.id, planB.id);

    const first = await assignPlan(org.id, planA.id, actor.id);
    await assignPlan(org.id, planB.id, actor.id);

    const endedFirst = await prisma.subscription.findUniqueOrThrow({ where: { id: first.id } });
    expect(endedFirst.status).toBe("CANCELLED");
    expect(endedFirst.endDate).not.toBeNull();
  });

  it("assignPlan writes an AuditLog row scoped to the tenant's own organizationId", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const plan = await createPlan({ code: `audit-${crypto.randomUUID().slice(0, 8)}`, name: "Audit Plan" });
    cleanupPlanIds.push(plan.id);

    await assignPlan(org.id, plan.id, actor.id);

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "subscription.assign_plan" },
    });
    expect(log).not.toBeNull();
  });

  it("getCurrentSubscription returns the most recent TRIALING or ACTIVE row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const planA = await createPlan({ code: `cur-a-${crypto.randomUUID().slice(0, 8)}`, name: "Current A" });
    const planB = await createPlan({ code: `cur-b-${crypto.randomUUID().slice(0, 8)}`, name: "Current B" });
    cleanupPlanIds.push(planA.id, planB.id);

    await assignPlan(org.id, planA.id, actor.id);
    const latest = await assignPlan(org.id, planB.id, actor.id);

    const current = await getCurrentSubscription(org.id);
    expect(current?.id).toBe(latest.id);
    expect(current?.subscriptionPlan.id).toBe(planB.id);
  });
});
