import "server-only";
import { prisma } from "@/lib/db";
import { computeSaas, monthKeyIst, monthLabelOf, recurringRevenue, type SaasPayment, type SaasTrial } from "@/modules/reports/saas-math";
import { getOverview } from "./overview";


const DAY = 86_400_000;

/** A number with how it changed since the start of the range. `pct` is empty when there was nothing to compare with. */
export interface Delta {
  value: number;
  /** Percent change against the start of the range, or null when the earlier value was 0. */
  pct: number | null;
}

export interface Kpi {
  key: string;
  label: string;
  /** Shown as the big number: already formatted for the page. */
  display: string;
  /** Only for metrics that can be worked out for an earlier day; others show `hint` instead. */
  delta: Delta | null;
  /** For churn, a fall is the good direction. */
  lowerIsBetter?: boolean;
  hint?: string;
  href: string;
}

export interface AttentionItem {
  key: string;
  count: number;
  title: string;
  detail: string;
  action: string;
  href: string;
}

export interface Dashboard {
  days: number;
  kpis: Kpi[];
  growth: { label: string; total: number; paying: number }[];
  mrr: { label: string; mrr: number }[];
  attention: AttentionItem[];
  products: { key: string; name: string; businesses: number; paying: number; mrr: number; connection: "ok" | "error" | "waiting" }[];
}

export const RANGES = [
  { days: 30, label: "Last 30 days", months: 6 },
  { days: 90, label: "Last 90 days", months: 6 },
  { days: 365, label: "Last 12 months", months: 12 },
] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const change = (now: number, then: number): Delta => ({ value: round2(now - then), pct: then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : null });

/** The last moment of each of the last `count` months (India time), the current month ending now. */
export function monthEnds(now: Date, count: number): { label: string; at: Date }[] {
  const out: { label: string; at: Date }[] = [];
  const IST = 5.5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + IST);
  for (let back = count - 1; back >= 0; back -= 1) {
    const startOfNext = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - back + 1, 1) - IST;
    const at = new Date(Math.min(startOfNext - 1, now.getTime()));
    out.push({ label: monthLabelOf(monthKeyIst(at)), at });
  }
  return out;
}

/**
 * Everything the Overview shows, for one product or all of them. Deltas compare with the start of the range (`days` ago); a
 * figure that cannot be worked out for an earlier day (it has no history) has no delta. Definitions are the Subscriptions
 * report's (saas-math.ts): paying means a paid plan payment covers the day, MRR is before GST.
 */
export async function getDashboard(now: Date = new Date(), productKey?: string, days = 30): Promise<Dashboard> {
  const range = RANGES.find((r) => r.days === days) ?? RANGES[0];
  const scope = productKey ? { productKey } : {};
  const link = productKey ? { products: { some: { productKey } } } : {};
  const start = new Date(now.getTime() - range.days * DAY);
  const before = new Date(start.getTime() - range.days * DAY);

  const [overview, businesses, paid, trialRows, activeTrials, failedRecent, lockedNow, unreadSerious, products] = await Promise.all([
    getOverview(now, productKey),
    prisma.business.findMany({ where: link, select: { createdAt: true } }),
    prisma.subscriptionPayment.findMany({ where: { ...scope, status: "PAID", paidAt: { not: null } }, select: { businessId: true, productKey: true, planId: true, plan: { select: { name: true } }, interval: true, amount: true, gstAmount: true, paidAt: true, periodStart: true, periodEnd: true } }),
    prisma.subscription.findMany({ where: { ...scope, plan: { isTrial: true } }, select: { businessId: true, startDate: true, trialEndsAt: true } }),
    prisma.subscription.findMany({ where: { ...scope, status: "TRIALING", endDate: null }, select: { trialEndsAt: true } }),
    prisma.subscriptionPayment.count({ where: { ...scope, status: "FAILED", createdAt: { gte: start } } }),
    prisma.subscription.count({ where: { ...scope, status: "LOCKED", endDate: null } }),
    prisma.notification.count({ where: { ...scope, readAt: null, severity: { in: ["WARNING", "CRITICAL"] } } }),
    prisma.product.findMany({ where: { status: "ACTIVE", ...(productKey ? { key: productKey } : {}) }, orderBy: { name: "asc" }, select: { key: true, name: true, manifestVersion: true, manifestError: true } }),
  ]);

  const payments: (SaasPayment & { productKey: string })[] = paid.map((p) => ({ businessId: p.businessId, productKey: p.productKey, planId: p.planId, planName: p.plan.name, interval: p.interval, amount: Number(p.amount), gstAmount: Number(p.gstAmount), paidAt: p.paidAt!, periodStart: p.periodStart, periodEnd: p.periodEnd }));
  const trials: SaasTrial[] = trialRows;

  const countAt = (at: Date) => businesses.filter((b) => b.createdAt.getTime() <= at.getTime()).length;
  const newIn = (from: Date, to: Date) => businesses.filter((b) => b.createdAt.getTime() > from.getTime() && b.createdAt.getTime() <= to.getTime()).length;
  const nowRev = recurringRevenue(payments, now);
  const thenRev = recurringRevenue(payments, start);
  const period = computeSaas({ payments, trials, failedPayments: 0, period: { from: start, to: now }, now });

  const kpis: Kpi[] = [
    { key: "businesses", label: "Total businesses", display: String(businesses.length), delta: change(businesses.length, countAt(start)), href: "/businesses" },
    { key: "active", label: "Active businesses", display: String(overview.businesses.active), delta: null, hint: `${overview.businesses.suspended} suspended`, href: "/businesses" },
    { key: "paying", label: "Paying businesses", display: String(nowRev.payingKitchens), delta: change(nowRev.payingKitchens, thenRev.payingKitchens), href: "/reports" },
    { key: "mrr", label: "Monthly revenue (MRR)", display: inr(nowRev.mrr), delta: change(nowRev.mrr, thenRev.mrr), href: "/reports" },
    { key: "new", label: "New businesses", display: String(newIn(start, now)), delta: change(newIn(start, now), newIn(before, start)), href: "/businesses" },
    { key: "trials", label: "Active trials", display: String(activeTrials.length), delta: null, hint: `${overview.trialsEndingSoon.length ? "some end this week" : "none ending this week"}`, href: "/businesses" },
    { key: "conversion", label: "Trial to paid", display: period.trials.conversionPercent === null ? "—" : `${period.trials.conversionPercent}%`, delta: null, hint: `${period.trials.converted} of ${period.trials.started} trials started`, href: "/reports" },
    { key: "churn", label: "Churn", display: period.churn.logoChurnPercent === null ? "—" : `${period.churn.logoChurnPercent}%`, delta: null, lowerIsBetter: true, hint: period.churn.startKitchens ? `${period.churn.churned} of ${period.churn.startKitchens} paying` : "Nobody was paying yet", href: "/reports" },
  ];

  const ends = monthEnds(now, range.months);
  const growth = ends.map(({ label, at }) => ({ label, total: countAt(at), paying: recurringRevenue(payments, at).payingKitchens }));
  const mrr = ends.map(({ label, at }) => ({ label, mrr: recurringRevenue(payments, at).mrr }));

  const soon = activeTrials.filter((t) => t.trialEndsAt && t.trialEndsAt.getTime() <= now.getTime() + 3 * DAY).length;
  const errored = products.filter((p) => p.manifestError && p.manifestVersion).length;
  const attention: AttentionItem[] = [
    { key: "trials", count: soon, title: `${soon} ${soon === 1 ? "trial ends" : "trials end"} in the next 3 days`, detail: "No paid plan yet", action: "View businesses", href: "/businesses" },
    { key: "failed", count: failedRecent, title: `${failedRecent} failed ${failedRecent === 1 ? "payment" : "payments"}`, detail: `In the last ${range.days} days`, action: "View billing", href: "/billing" },
    { key: "locked", count: lockedNow, title: `${lockedNow} ${lockedNow === 1 ? "business is" : "businesses are"} locked`, detail: "Trial or plan ended without payment", action: "View businesses", href: "/businesses" },
    { key: "errors", count: errored, title: `${errored} ${errored === 1 ? "product has" : "products have"} a connection problem`, detail: "Ops could not read what it offers", action: "View products", href: "/settings/products" },
    { key: "unread", count: unreadSerious, title: `${unreadSerious} unread ${unreadSerious === 1 ? "warning" : "warnings"}`, detail: "Raised by products or payments", action: "View notifications", href: "/notifications" },
  ].filter((item) => item.count > 0);

  return {
    days: range.days,
    kpis,
    growth,
    mrr,
    attention,
    products: products.map((p) => {
      const mine = payments.filter((x) => x.productKey === p.key);
      const rev = recurringRevenue(mine, now);
      return { key: p.key, name: p.name, businesses: overview.products.find((o) => o.key === p.key)?.businesses ?? 0, paying: rev.payingKitchens, mrr: rev.mrr, connection: p.manifestError ? "error" : p.manifestVersion ? "ok" : "waiting" };
    }),
  };
}
