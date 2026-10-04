import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadSaasReport } from "../saas-report";

const orgIds: string[] = [];
const planIds: string[] = [];

afterEach(async () => {
  await prisma.subscriptionPayment.deleteMany({ where: { subscriptionPlanId: { in: planIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  orgIds.length = planIds.length = 0;
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

async function kitchen(name: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `saas-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  return org;
}

describe("loadSaasReport (Chunk 24.2)", () => {
  it("reads paid plan payments and trials from the database; only paid payments earn money", async () => {
    const plan = await prisma.subscriptionPlan.create({ data: { code: `saas-${crypto.randomUUID()}`, name: "Saas Test Plan" } });
    const trialPlan = await prisma.subscriptionPlan.create({ data: { code: `saas-t-${crypto.randomUUID()}`, name: "Saas Test Trial", isTrial: true } });
    planIds.push(plan.id, trialPlan.id);
    const payer = await kitchen("Payer");
    const yearly = await kitchen("Yearly");
    const lapsed = await kitchen("Lapsed");
    const trialer = await kitchen("Trialer");

    const payment = (organizationId: string, interval: "MONTHLY" | "ANNUAL", amount: number, status: "PAID" | "FAILED" | "PENDING", startOffset: number, endOffset: number) =>
      prisma.subscriptionPayment.create({
        data: { organizationId, subscriptionPlanId: plan.id, interval, amount, gstPercent: 18, gstAmount: amount * 0.18, total: amount * 1.18, status, paidAt: status === "PAID" ? day(startOffset) : null, periodStart: day(startOffset), periodEnd: day(endOffset) },
      });
    await payment(payer.id, "MONTHLY", 1000, "PAID", -5, 25);
    await payment(yearly.id, "ANNUAL", 12000, "PAID", -30, 335);
    await payment(lapsed.id, "MONTHLY", 1000, "PAID", -40, -10);
    await payment(lapsed.id, "MONTHLY", 999, "FAILED", -9, 21);
    await payment(payer.id, "MONTHLY", 777, "PENDING", -1, 29);
    await prisma.subscription.create({ data: { organizationId: trialer.id, subscriptionPlanId: trialPlan.id, status: "TRIALING", startDate: day(-3), trialEndsAt: day(4) } });

    const report = await loadSaasReport({ from: null, to: null });
    const mine = report.mrrByPlan.find((p) => p.planId === plan.id);
    expect(mine).toMatchObject({ planName: "Saas Test Plan", kitchens: 2, mrr: 2000 }); // payer 1,000 + yearly 12,000 / 12
    const revenue = report.revenueByPlan.find((p) => p.planId === plan.id);
    expect(revenue).toMatchObject({ payments: 3, revenue: 14000 }); // the failed and the pending payment earn nothing
    expect(report.failedPayments).toBeGreaterThanOrEqual(1);
    expect(report.lapsedNow).toBeGreaterThanOrEqual(1);
    expect(report.trials.runningNow).toBeGreaterThanOrEqual(1);
  });
});
