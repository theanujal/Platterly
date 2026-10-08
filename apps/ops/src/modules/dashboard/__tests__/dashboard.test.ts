import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getDashboard, monthEnds } from "../dashboard";

const KEY = "dashkpi";
const ids = [1, 2, 3, 4].map((n) => `biz_${String(n + 4).repeat(32)}`);
const now = new Date("2026-10-15T10:00:00Z");
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);

async function clean() {
  await prisma.notification.deleteMany({ where: { productKey: KEY } });
  await prisma.subscriptionPayment.deleteMany({ where: { productKey: KEY } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
beforeAll(clean);
afterAll(clean);

describe("monthEnds", () => {
  it("gives the last moment of each month, the current month ending now", () => {
    const ends = monthEnds(now, 3);
    expect(ends.map((e) => e.label)).toEqual(["Aug 2026", "Sept 2026", "Oct 2026"]);
    expect(ends[2].at.getTime()).toBe(now.getTime());
    expect(ends[1].at.toISOString()).toBe("2026-09-30T18:29:59.999Z");
  });
});

describe("getDashboard", () => {
  it("works out the numbers, their change since the start of the range, and what needs attention, for one product", async () => {
    await prisma.product.create({ data: { key: KEY, name: "Dash KPI", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
    const trial = await prisma.plan.create({ data: { productKey: KEY, code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7 } });
    const pro = await prisma.plan.create({ data: { productKey: KEY, code: "pro", name: "Pro", priceMonthly: 1000 } });
    const make = (id: string, name: string, createdAt: Date) => prisma.business.create({ data: { id, name, createdAt, products: { create: { productKey: KEY } } } });
    await make(ids[0], "Old paying", at(100));
    await make(ids[1], "Paying since this month", at(60));
    await make(ids[2], "New trial", at(5));
    await make(ids[3], "Locked", at(50));
    const pay = (n: number, businessId: string, paidDaysAgo: number, periodDays: number) =>
      prisma.subscriptionPayment.create({ data: { id: `pay_${String(n).repeat(32)}`, businessId, productKey: KEY, planId: pro.id, interval: "MONTHLY", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, status: "PAID", paidAt: at(paidDaysAgo), periodStart: at(paidDaysAgo), periodEnd: new Date(at(paidDaysAgo).getTime() + periodDays * DAY) } });
    await pay(1, ids[0], 90, 400); // paying 90 days ago and still
    await pay(2, ids[1], 10, 30); // started paying 10 days ago
    await pay(3, ids[3], 60, 30); // paid once, lapsed 30 days ago
    await prisma.subscription.create({ data: { id: "sub_" + "5".repeat(32), businessId: ids[2], productKey: KEY, planId: trial.id, status: "TRIALING", startDate: at(5), trialEndsAt: new Date(now.getTime() + 2 * DAY) } });
    await prisma.subscription.create({ data: { id: "sub_" + "6".repeat(32), businessId: ids[3], productKey: KEY, planId: pro.id, status: "LOCKED" } });
    await prisma.subscriptionPayment.create({ data: { id: `pay_${"9".repeat(32)}`, businessId: ids[1], productKey: KEY, planId: pro.id, interval: "MONTHLY", amount: 1000, gstPercent: 18, gstAmount: 180, total: 1180, status: "FAILED", createdAt: at(3) } });
    await prisma.notification.create({ data: { productKey: KEY, kind: "payment.failed", severity: "WARNING", title: "A payment failed", body: "x" } });

    const d = await getDashboard(now, KEY, 30);
    const kpi = (key: string) => d.kpis.find((k) => k.key === key)!;
    expect(kpi("businesses").display).toBe("4");
    expect(kpi("businesses").delta).toEqual({ value: 1, pct: 33.3 }); // 3 businesses 30 days ago
    expect(kpi("paying").display).toBe("2");
    expect(kpi("paying").delta).toEqual({ value: 1, pct: 100 }); // only "Old paying" 30 days ago... plus the lapsed one ended day 30
    expect(kpi("mrr").display).toBe("₹2,000");
    expect(kpi("new").display).toBe("1");
    expect(kpi("trials").display).toBe("1");
    expect(d.growth).toHaveLength(6);
    expect(d.growth.at(-1)).toEqual({ label: "Oct 2026", total: 4, paying: 2 });
    expect(d.mrr.at(-1)).toEqual({ label: "Oct 2026", mrr: 2000 });

    expect(d.attention.map((a) => a.key)).toEqual(["trials", "failed", "locked", "unread"]);
    expect(d.attention.find((a) => a.key === "trials")!.count).toBe(1);
    expect(d.products).toEqual([{ key: KEY, name: "Dash KPI", businesses: 4, paying: 2, mrr: 2000, connection: "waiting" }]);
  });

  it("falls back to 30 days for an unknown range and shows an empty product without errors", async () => {
    const d = await getDashboard(now, "no-such-product", 7);
    expect(d.days).toBe(30);
    expect(d.kpis.find((k) => k.key === "businesses")!.display).toBe("0");
    expect(d.attention).toEqual([]);
    expect(d.products).toEqual([]);
  });
});
