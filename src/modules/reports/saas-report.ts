import "server-only";
import { prisma } from "@/lib/db";
import { dateFilter, type ReportRange } from "./reports";
import { computeSaas, type SaasPayment, type SaasTrial } from "./saas-math";

/**
 * Chunk 24.2 — loads what the Super Admin Subscriptions report is built from: every paid plan payment, every trial
 * subscription and the failed payments in the period. Platform-wide, so only Super Admin pages call it. The figures
 * come from `saas-math.ts`.
 */
export async function loadSaasReport(range: ReportRange, now: Date = new Date()) {
  const created = dateFilter(range, "ist");
  const [paid, trialRows, failedPayments] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: { status: "PAID", paidAt: { not: null } },
      select: { organizationId: true, subscriptionPlanId: true, subscriptionPlan: { select: { name: true } }, interval: true, amount: true, gstAmount: true, paidAt: true, periodStart: true, periodEnd: true },
    }),
    prisma.subscription.findMany({ where: { subscriptionPlan: { isTrial: true } }, select: { organizationId: true, startDate: true, trialEndsAt: true } }),
    prisma.subscriptionPayment.count({ where: { status: "FAILED", ...(created ? { createdAt: created } : {}) } }),
  ]);
  const payments: SaasPayment[] = paid.map((p) => ({
    organizationId: p.organizationId,
    planId: p.subscriptionPlanId,
    planName: p.subscriptionPlan.name,
    interval: p.interval,
    amount: Number(p.amount),
    gstAmount: Number(p.gstAmount),
    paidAt: p.paidAt!,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
  }));
  const trials: SaasTrial[] = trialRows;
  return computeSaas({ payments, trials, failedPayments, period: range, now });
}
