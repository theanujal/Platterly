import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createPlan, deactivatePlan } from "@/modules/subscriptions/plan";
import { ensureTrialPlan, TRIAL_PLAN_CODE } from "@/modules/subscriptions/trial-plan";

const cleanupPlanIds: string[] = [];

afterEach(async () => {
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: cleanupPlanIds } } });
  cleanupPlanIds.length = 0;
});

describe("Subscription plan catalog (Chunk 3 Group 3.3)", () => {
  it("createPlan creates a plan with the given limits, nulls meaning unlimited", async () => {
    const plan = await createPlan({
      code: `starter-${crypto.randomUUID().slice(0, 8)}`,
      name: "Starter",
      maxUsers: 5,
      maxEvents: 20,
    });
    cleanupPlanIds.push(plan.id);

    expect(plan.maxUsers).toBe(5);
    expect(plan.maxEvents).toBe(20);
    expect(plan.maxOrders).toBeNull();
  });

  it("ensureTrialPlan seeds exactly one Trial plan with a 7-day duration and is idempotent across repeated calls", async () => {
    const first = await ensureTrialPlan();
    const second = await ensureTrialPlan();

    expect(first.id).toBe(second.id);
    expect(first.code).toBe(TRIAL_PLAN_CODE);
    expect(first.isTrial).toBe(true);
    expect(first.trialDurationDays).toBe(7);

    const count = await prisma.subscriptionPlan.count({ where: { code: TRIAL_PLAN_CODE } });
    expect(count).toBe(1);
  });

  it("ensureTrialPlan never overwrites an existing Trial plan's already-edited fields", async () => {
    const seeded = await ensureTrialPlan();
    await prisma.subscriptionPlan.update({ where: { id: seeded.id }, data: { name: "Custom Trial Name" } });

    const afterSecondCall = await ensureTrialPlan();
    expect(afterSecondCall.name).toBe("Custom Trial Name");

    // Restore for other tests/manual runs sharing this singleton row.
    await prisma.subscriptionPlan.update({ where: { id: seeded.id }, data: { name: "Trial" } });
  });

  it("deactivatePlan sets isActive=false without deleting the row", async () => {
    const plan = await createPlan({ code: `deact-${crypto.randomUUID().slice(0, 8)}`, name: "Deactivate Me" });
    cleanupPlanIds.push(plan.id);

    const deactivated = await deactivatePlan(plan.id);
    expect(deactivated.isActive).toBe(false);

    const stillExists = await prisma.subscriptionPlan.findUnique({ where: { id: plan.id } });
    expect(stillExists).not.toBeNull();
  });
});
