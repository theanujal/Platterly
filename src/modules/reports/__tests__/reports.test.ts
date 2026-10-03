import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createQuotation } from "@/modules/quotations/quotation";
import { createEventType } from "@/modules/events/event-type";
import { loadEventsReport, loadSalesReport, loadSignupsByMonth } from "../reports";

let orgA = "";
let orgB = "";
const userIds: string[] = [];
const orgIds: string[] = [];
const day = (iso: string) => new Date(iso);

async function seed(label: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `Reports ${label}`, slug: `rep-${label}-${crypto.randomUUID().slice(0, 6)}`, createdAt: new Date() } });
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `rep-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  orgIds.push(org.id);
  userIds.push(user.id);
  return { org, user };
}

beforeAll(async () => {
  const a = await seed("a");
  const b = await seed("b");
  [orgA, orgB] = [a.org.id, b.org.id];

  const wedding = await createEventType(orgA, { name: "Wedding" }, a.user.id);
  const asha = await createCustomer(orgA, { name: "Asha Rao", phone: "9876500101" }, a.user.id);
  await createCustomer(orgA, { name: "Lead Only", phone: "9876500102" }, a.user.id); // enquired, never ordered
  const mk = (customerId: string, date: string, price: number, status?: "CANCELLED") =>
    createOrder(orgA, { customerId, eventTypeId: wedding.id, eventStartDate: day(date), eventEndDate: day(date), totalParticipants: 50, individualPricingEnabled: true, mealPlanEntries: [{ date: day(date), mealType: "DINNER", price }], ...(status ? { status } : {}) } as never, a.user.id);
  await mk(asha.id, "2027-01-10", 4000);
  await mk(asha.id, "2027-02-14", 6000);
  await mk(asha.id, "2027-02-20", 9999, "CANCELLED");
  await createQuotation(orgA, { customerId: asha.id, eventStartDate: day("2027-03-01"), eventEndDate: day("2027-03-01"), totalParticipants: 20, individualPricingEnabled: true, mealPlanEntries: [{ date: day("2027-03-01"), mealType: "DINNER", price: 700 }] } as never, a.user.id);

  const rival = await createCustomer(orgB, { name: "Other Kitchen's Customer", phone: "9876500103" }, b.user.id);
  await createOrder(orgB, { customerId: rival.id, eventStartDate: day("2027-01-12"), eventEndDate: day("2027-01-12"), totalParticipants: 10, individualPricingEnabled: true, mealPlanEntries: [{ date: day("2027-01-12"), mealType: "DINNER", price: 123456 }] } as never, b.user.id);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("kitchen reports", () => {
  it("sales: only this kitchen's figures, cancelled orders left out, enquiries and conversion counted", async () => {
    const sales = await loadSalesReport({ organizationId: orgA }, { from: null, to: null });
    expect(sales.orders).toBe(2);
    expect(sales.revenue).toBe(10000);
    expect(sales.averageOrderValue).toBe(5000);
    expect(sales.enquiries).toBe(2);
    expect(sales.converted).toBe(1);
    expect(sales.conversionRate).toBe(50);
    expect(sales.quotationsSent).toBe(0); // the one quotation is still a draft
    expect(sales.kitchens).toEqual([]); // the per-kitchen table is platform-only
    expect(JSON.stringify(sales)).not.toContain("123456");
  });

  it("events: grouped by month and type from this kitchen only", async () => {
    const events = await loadEventsReport({ organizationId: orgA }, { from: null, to: null });
    expect(events.events).toBe(2);
    expect(events.guests).toBe(100);
    expect(events.byMonth.map((m) => [m.month, m.count, m.revenue])).toEqual([["2027-01", 1, 4000], ["2027-02", 1, 6000]]);
    expect(events.byType).toEqual([{ name: "Wedding", count: 2, guests: 100, revenue: 10000 }]);
    expect(events.topEvents.map((e) => e.total)).toEqual([6000, 4000]);
  });

  it("the events date range is by event date and includes both end dates", async () => {
    const jan = await loadEventsReport({ organizationId: orgA }, { from: day("2027-01-01"), to: day("2027-01-31") });
    expect(jan.events).toBe(1);
    const onTheDay = await loadEventsReport({ organizationId: orgA }, { from: day("2027-02-14"), to: day("2027-02-14") });
    expect(onTheDay.events).toBe(1);
    const none = await loadEventsReport({ organizationId: orgA }, { from: day("2030-01-01"), to: day("2030-12-31") });
    expect(none.events).toBe(0);
  });

  it("the sales date range is by when the order was placed", async () => {
    const future = await loadSalesReport({ organizationId: orgA }, { from: day("2031-01-01"), to: day("2031-12-31") });
    expect(future.orders).toBe(0);
    const today = new Date();
    const thisYear = await loadSalesReport({ organizationId: orgA }, { from: day(`${today.getUTCFullYear()}-01-01`), to: day(`${today.getUTCFullYear()}-12-31`) });
    expect(thisYear.orders).toBe(2);
  });
});

describe("platform reports (Super Admin)", () => {
  it("add up every kitchen and rank them", async () => {
    const sales = await loadSalesReport({ all: true }, { from: null, to: null });
    const mine = sales.kitchens.filter((k) => [orgA, orgB].includes(k.kitchenId));
    expect(mine.map((k) => [k.kitchenName, k.orders, k.revenue])).toEqual([["Reports b", 1, 123456], ["Reports a", 2, 10000]]);
    expect(sales.orders).toBeGreaterThanOrEqual(3);
    const signups = await loadSignupsByMonth({ from: null, to: null });
    expect(signups.total).toBeGreaterThanOrEqual(2);
    expect(signups.byMonth.at(-1)!.count).toBeGreaterThanOrEqual(2);
  });
});
