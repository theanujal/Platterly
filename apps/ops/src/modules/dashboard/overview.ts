import "server-only";
import { prisma } from "@/lib/db";

const DAY = 86_400_000;

/**
 * What the Overview shows (replaces the old Super Admin dashboard): how many businesses there are and in what state, how
 * many are new, how many subscriptions are trials and how many paid, which trials end soon, and one row per product with
 * the usage counts its businesses last reported. All from ops's own records.
 */
export async function getOverview(now: Date = new Date()) {
  const [byStatus, newThisWeek, trialing, paying, locked, endingSoon, products, usage] = await Promise.all([
    prisma.business.groupBy({ by: ["status"], _count: true }),
    prisma.business.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.subscription.count({ where: { status: "TRIALING", endDate: null } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endDate: null, plan: { isTrial: false } } }),
    prisma.subscription.count({ where: { status: "LOCKED", endDate: null } }),
    prisma.subscription.findMany({
      where: { status: "TRIALING", endDate: null, trialEndsAt: { not: null, lte: new Date(now.getTime() + 7 * DAY) } },
      orderBy: { trialEndsAt: "asc" },
      take: 5,
      select: { businessId: true, productKey: true, trialEndsAt: true, business: { select: { name: true } } },
    }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, select: { key: true, name: true, _count: { select: { businesses: true } } } }),
    prisma.businessProduct.findMany({ select: { productKey: true, usage: true } }),
  ]);
  const count = (status: string) => byStatus.find((s) => s.status === status)?._count ?? 0;
  const totals = new Map<string, Record<string, number>>();
  for (const row of usage) {
    const counts = (row.usage as { counts?: Record<string, number> } | null)?.counts ?? {};
    const sum = totals.get(row.productKey) ?? {};
    for (const [key, value] of Object.entries(counts)) sum[key] = (sum[key] ?? 0) + value;
    totals.set(row.productKey, sum);
  }
  return {
    businesses: { total: byStatus.reduce((n, s) => n + s._count, 0), active: count("ACTIVE"), suspended: count("SUSPENDED"), pendingDelete: count("PENDING_DELETE"), newThisWeek },
    subscriptions: { trialing, paying, locked },
    trialsEndingSoon: endingSoon.map((t) => ({ businessId: t.businessId, name: t.business.name, productKey: t.productKey, trialEndsAt: t.trialEndsAt! })),
    products: products.map((p) => ({ key: p.key, name: p.name, businesses: p._count.businesses, usage: totals.get(p.key) ?? {} })),
  };
}
