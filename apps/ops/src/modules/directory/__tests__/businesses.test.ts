import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PAGE_SIZE, getBusinessActivity, listBusinesses } from "../businesses";

const KEY = "bizlist";
const ids = [1, 2, 3, 4].map((n) => `biz_${String(n + 4).repeat(32)}`);
const DAY = 86_400_000;

async function clean() {
  await prisma.auditLog.deleteMany({ where: { subject: { in: ids } } });
  await prisma.messageLog.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { productKey: KEY } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.plan.deleteMany({ where: { productKey: KEY } });
  await prisma.product.deleteMany({ where: { key: KEY } });
}
beforeAll(async () => {
  await clean();
  await prisma.product.create({ data: { key: KEY, name: "Biz List", baseUrl: "http://127.0.0.1:1", outboundSecret: "x", inboundSecret: "x" } });
  const trial = await prisma.plan.create({ data: { productKey: KEY, code: "trial", name: "Trial", isTrial: true, trialDurationDays: 7 } });
  const pro = await prisma.plan.create({ data: { productKey: KEY, code: "pro", name: "Pro", priceMonthly: 100 } });
  const make = (id: string, name: string, over: { status?: "ACTIVE" | "SUSPENDED"; days: number; email?: string }) =>
    prisma.business.create({ data: { id, name, status: over.status ?? "ACTIVE", ownerEmail: over.email, createdAt: new Date(Date.now() - over.days * DAY), products: { create: { productKey: KEY } } } });
  await make(ids[0], "Zeta Trial Kitchen", { days: 1 });
  await make(ids[1], "Alpha Paying Kitchen", { days: 5, email: "alpha@biz.example" });
  await make(ids[2], "Mid Suspended Kitchen", { days: 3, status: "SUSPENDED" });
  await make(ids[3], "No Plan Kitchen", { days: 9 });
  await prisma.subscription.create({ data: { id: "sub_" + "7".repeat(32), businessId: ids[0], productKey: KEY, planId: trial.id, status: "TRIALING", trialEndsAt: new Date(Date.now() + 2 * DAY) } });
  await prisma.subscription.create({ data: { id: "sub_" + "8".repeat(32), businessId: ids[1], productKey: KEY, planId: pro.id, status: "ACTIVE" } });
  await prisma.subscription.create({ data: { id: "sub_" + "9".repeat(32), businessId: ids[2], productKey: KEY, planId: pro.id, status: "LOCKED" } });
});
afterAll(clean);

const names = async (opts: Parameters<typeof listBusinesses>[0]) => (await listBusinesses({ productKey: KEY, ...opts })).rows.map((b) => b.name);

describe("listBusinesses", () => {
  it("filters by plan state, status and search, within a product", async () => {
    expect(await names({ plan: "trialing" })).toEqual(["Zeta Trial Kitchen"]);
    expect(await names({ plan: "paying" })).toEqual(["Alpha Paying Kitchen"]);
    expect(await names({ plan: "locked" })).toEqual(["Mid Suspended Kitchen"]);
    expect(await names({ plan: "none" })).toEqual(["No Plan Kitchen"]);
    expect(await names({ status: "SUSPENDED" })).toEqual(["Mid Suspended Kitchen"]);
    expect(await names({ q: "alpha@biz" })).toEqual(["Alpha Paying Kitchen"]);
    expect(await names({ q: "kitchen", status: "ACTIVE", plan: "none" })).toEqual(["No Plan Kitchen"]);
  });

  it("sorts newest first by default, oldest first, or by name, and carries subscriptions for the cards", async () => {
    expect(await names({})).toEqual(["Zeta Trial Kitchen", "Mid Suspended Kitchen", "Alpha Paying Kitchen", "No Plan Kitchen"]);
    expect(await names({ sort: "oldest" })).toEqual(["No Plan Kitchen", "Alpha Paying Kitchen", "Mid Suspended Kitchen", "Zeta Trial Kitchen"]);
    expect(await names({ sort: "name" })).toEqual(["Alpha Paying Kitchen", "Mid Suspended Kitchen", "No Plan Kitchen", "Zeta Trial Kitchen"]);
    const { rows, total, pages } = await listBusinesses({ productKey: KEY, plan: "paying" });
    expect(rows[0].subscriptions[0].plan).toEqual({ name: "Pro", isTrial: false });
    expect(rows[0].products[0].product.name).toBe("Biz List");
    expect([total, pages]).toEqual([1, 1]);
    expect(PAGE_SIZE).toBe(24);
  });

  it("a product with no businesses gives an empty page", async () => {
    expect((await listBusinesses({ productKey: "no-such-product" })).total).toBe(0);
  });
});

describe("getBusinessActivity", () => {
  it("returns audit rows by subject, emails and paid payments for one business", async () => {
    await prisma.auditLog.create({ data: { action: "subscription.locked", subject: ids[2] } });
    await prisma.messageLog.create({ data: { businessId: ids[2], productKey: KEY, template: "trial_ended", variables: {}, status: "SENT", toEmail: "o@biz.example", subject: "Your trial ended" } });
    const a = await getBusinessActivity(ids[2]);
    expect(a.audit.map((x) => x.action)).toEqual(["subscription.locked"]);
    expect(a.messages.map((m) => m.template)).toEqual(["trial_ended"]);
    expect(a.payments).toEqual([]);
    const none = await getBusinessActivity(ids[0]);
    expect(none.audit).toEqual([]);
  });
});
