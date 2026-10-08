import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { countUnread, listNotifications } from "@/modules/notifications/notifications";
import { listBusinesses } from "@/modules/directory/businesses";
import { getOverview } from "../overview";

const KEY = "dashtest";
const ids = [1, 2, 3, 4].map((n) => `biz_${String(n).repeat(32)}`);
const now = new Date("2026-10-05T10:00:00Z");
const DAY = 86_400_000;

async function clean() {
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
const baseline = async () => getOverview(now);

beforeAll(clean);
afterAll(clean);

describe("overview", () => {
  it("counts businesses by state, subscriptions by kind, trials ending soon, and sums reported usage per product", async () => {
    const before = await baseline();
    await prisma.product.create({ data: { key: KEY, name: "Dash Test", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
    const trial = await prisma.plan.create({ data: { productKey: KEY, code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7 } });
    const pro = await prisma.plan.create({ data: { productKey: KEY, code: "pro", name: "Pro", priceMonthly: 100 } });
    const make = (id: string, name: string, status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETE", usage: object, createdAt: Date) =>
      prisma.business.create({ data: { id, name, status, createdAt, products: { create: { productKey: KEY, usage } } } });
    await make(ids[0], "DashTest Trial Soon", "ACTIVE", { counts: { orders: 5, events: 2 } }, new Date(now.getTime() - DAY));
    await make(ids[1], "DashTest Paying", "ACTIVE", { counts: { orders: 10 } }, new Date(now.getTime() - 30 * DAY));
    await make(ids[2], "DashTest Suspended", "SUSPENDED", {}, new Date(now.getTime() - 40 * DAY));
    await make(ids[3], "DashTest Deleting", "PENDING_DELETE", { counts: { events: 1 } }, new Date(now.getTime() - 50 * DAY));
    await prisma.subscription.create({ data: { id: "sub_" + "1".repeat(32), businessId: ids[0], productKey: KEY, planId: trial.id, status: "TRIALING", trialEndsAt: new Date(now.getTime() + 2 * DAY) } });
    await prisma.subscription.create({ data: { id: "sub_" + "2".repeat(32), businessId: ids[1], productKey: KEY, planId: pro.id, status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 20 * DAY) } });
    await prisma.subscription.create({ data: { id: "sub_" + "3".repeat(32), businessId: ids[2], productKey: KEY, planId: pro.id, status: "LOCKED" } });

    const after = await getOverview(now);
    expect(after.businesses.total - before.businesses.total).toBe(4);
    expect(after.businesses.active - before.businesses.active).toBe(2);
    expect(after.businesses.suspended - before.businesses.suspended).toBe(1);
    expect(after.businesses.pendingDelete - before.businesses.pendingDelete).toBe(1);
    expect(after.businesses.newThisWeek - before.businesses.newThisWeek).toBe(1);
    expect(after.subscriptions.trialing - before.subscriptions.trialing).toBe(1);
    expect(after.subscriptions.paying - before.subscriptions.paying).toBe(1);
    expect(after.subscriptions.locked - before.subscriptions.locked).toBe(1);
    expect(after.trialsEndingSoon.some((t) => t.name === "DashTest Trial Soon" && t.productKey === KEY)).toBe(true);
    expect(after.products.find((p) => p.key === KEY)).toEqual({ key: KEY, name: "Dash Test", businesses: 4, usage: { orders: 15, events: 3 } });
  });

  it("scopes every figure to one product when the sidebar has one picked", async () => {
    // Left over from the test above: KEY has 4 businesses (2 active, 1 suspended, 1 pending delete), 1 trial, 1 paying, 1 locked.
    await prisma.notification.create({ data: { productKey: KEY, severity: "WARNING", kind: "dash.test", title: "DASH_TEST", body: "scoped", businessId: ids[0] } });
    const only = await getOverview(now, KEY);
    expect(only.businesses).toEqual({ total: 4, active: 2, suspended: 1, pendingDelete: 1, newThisWeek: 1 });
    expect(only.subscriptions).toEqual({ trialing: 1, paying: 1, locked: 1 });
    expect(only.products.map((p) => p.key)).toEqual([KEY]);
    expect(only.trialsEndingSoon.every((t) => t.productKey === KEY)).toBe(true);

    const none = await getOverview(now, "no-such-product");
    expect(none.businesses.total).toBe(0);
    expect(none.products).toEqual([]);

    expect((await listBusinesses({ productKey: KEY })).total).toBe(4);
    expect((await listNotifications({ productKey: KEY })).map((a) => a.title)).toEqual(["DASH_TEST"]);
    expect(await countUnread(KEY)).toBe(1);
    expect(await listNotifications({ productKey: "no-such-product" })).toEqual([]);
    expect(await countUnread("no-such-product")).toBe(0);
    await prisma.notification.deleteMany({ where: { productKey: KEY } });
  });
});
