import "server-only";
import { prisma } from "@/lib/db";
import { computeSaas, monthKeyIst, monthLabelOf, type SaasPayment, type SaasTrial } from "./saas-math";

/**
 * What the Subscriptions report is built from, read from ops's own tables (payments, subscriptions): every paid payment, every
 * trial and the failed payments in the period, for one product or all of them. The figures come from `saas-math.ts`.
 */
export async function loadSaasReport(range: { from: Date | null; to: Date | null }, productKey?: string, now: Date = new Date()) {
  const where = productKey ? { productKey } : {};
  const created = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: new Date(range.to.getTime() + 86_400_000) } : {}) } : undefined;
  const [paid, trialRows, failedPayments] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { ...where, status: "PAID", paidAt: { not: null } }, select: { businessId: true, planId: true, plan: { select: { name: true } }, interval: true, amount: true, gstAmount: true, paidAt: true, periodStart: true, periodEnd: true } }),
    prisma.subscription.findMany({ where: { ...where, plan: { isTrial: true } }, select: { businessId: true, startDate: true, trialEndsAt: true } }),
    prisma.subscriptionPayment.count({ where: { ...where, status: "FAILED", ...(created ? { createdAt: created } : {}) } }),
  ]);
  const payments: SaasPayment[] = paid.map((p) => ({ businessId: p.businessId, planId: p.planId, planName: p.plan.name, interval: p.interval, amount: Number(p.amount), gstAmount: Number(p.gstAmount), paidAt: p.paidAt!, periodStart: p.periodStart, periodEnd: p.periodEnd }));
  const trials: SaasTrial[] = trialRows;
  return computeSaas({ payments, trials, failedPayments, period: range, now });
}

/** New businesses by month (India time) and in total, from ops's directory. */
export async function loadSignupsByMonth(range: { from: Date | null; to: Date | null }, productKey?: string) {
  const link = productKey ? { products: { some: { productKey } } } : {};
  const created = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: new Date(range.to.getTime() + 86_400_000) } : {}) } : undefined;
  const [rows, total] = await Promise.all([prisma.business.findMany({ where: { ...link, ...(created ? { createdAt: created } : {}) }, select: { createdAt: true } }), prisma.business.count({ where: link })]);
  const months = new Map<string, number>();
  for (const { createdAt } of rows) months.set(monthKeyIst(createdAt), (months.get(monthKeyIst(createdAt)) ?? 0) + 1);
  return { total, inRange: rows.length, byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, label: monthLabelOf(month), count })) };
}
