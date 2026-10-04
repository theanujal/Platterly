import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getDashboardSnapshot } from "@/app/(app)/dashboard/_data";
import { getPartialPaymentsOverview } from "@/modules/orders/order";
import { getInventoryOverviewStats, listLowStockItems, createInventoryItem } from "@/modules/inventory/inventory";
import { getOrderCountsByDay } from "@/modules/orders/calendar";
import { loadEventsReport, loadSalesReport } from "@/modules/reports/reports";
import { loadFinanceReport, loadInventoryReport } from "@/modules/reports/more-reports";
import { createPurchaseOrder, listPurchaseOrders, suggestReorder } from "@/modules/purchasing/purchase-order";
import { getProductionPlan } from "@/modules/production/production";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = userIds.length = 0;
});

const NONE = { from: null, to: null };
const day = (offset: number) => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime() + offset * 86_400_000;

/** One kitchen with two locations and three orders: 1000 at North, 2000 at South, 4000 at neither. */
async function seed() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Scoped Co", slug: `sc-${crypto.randomUUID().slice(0, 8)}`, status: "ACTIVE", createdAt: new Date() } });
  orgIds.push(org.id);
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(user.id);
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Main branch", isDefault: true } });
  const north = await prisma.kitchen.create({ data: { organizationId: org.id, branchId: branch.id, name: "North", isDefault: true } });
  const south = await prisma.kitchen.create({ data: { organizationId: org.id, branchId: branch.id, name: "South" } });
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const make = async (total: number, kitchenId: string | null, status: "APPROVED" | "SENT_TO_KITCHEN" = "APPROVED", offset = 5) => {
    const order = await prisma.order.create({
      data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, eventStartDate: new Date(day(offset)), eventEndDate: new Date(day(offset)), total, subtotal: total, balance: total, status },
    });
    await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: new Date(day(offset)), endDate: new Date(day(offset)), orderId: order.id, assignedKitchenId: kitchenId } });
    return order;
  };
  return { org, user, north, south, customer, make, atNorth: await make(1000, north.id), atSouth: await make(2000, south.id), atNeither: await make(4000, null) };
}

describe("location-scoped Dashboard, Reports and Purchasing (Chunk 23)", () => {
  it("the Dashboard snapshot counts only the chosen location, and leaves quotations out", async () => {
    const { org, north, south } = await seed();
    const all = await getDashboardSnapshot(org.id);
    const atNorth = await getDashboardSnapshot(org.id, north.id);
    const atSouth = await getDashboardSnapshot(org.id, south.id);
    expect(all.totalOrders).toBe(3);
    expect(atNorth.totalOrders).toBe(1);
    expect(atSouth.totalOrders).toBe(1);
    expect(all.outstandingBalance).toBe(7000);
    expect(atNorth.outstandingBalance).toBe(1000);
    expect(atSouth.outstandingBalance).toBe(2000);
    expect(atNorth.upcomingEvents).toHaveLength(1);
    expect(atNorth.quotationsAwaitingResponse).toBe(0);
    expect(atNorth.revenueTrend.reduce((s, d) => s + d.totalValue, 0)).toBe(1000);
    expect((await getPartialPaymentsOverview(org.id, north.id)).totalOrders).toBe(1);
    expect((await getPartialPaymentsOverview(org.id)).totalOrders).toBe(3);
  });

  it("the calendar counts and the Orders Calendar follow the location", async () => {
    const { org, north } = await seed();
    const key = new Date(day(5)).toISOString().slice(0, 10);
    // Only Approved, Sent to Kitchen and Completed orders count on the calendar.
    expect((await getOrderCountsByDay(org.id, key, key))[key]).toBe(3);
    expect((await getOrderCountsByDay(org.id, key, key, north.id))[key]).toBe(1);
  });

  it("the Dashboard inventory card counts the location's items plus shared ones", async () => {
    const { org, user, north, south } = await seed();
    const item = (name: string, kitchenId: string | null) => createInventoryItem(org.id, { name, category: "Spices", unit: "kg", lowStockThreshold: 5, kitchenId }, user.id);
    await item("Shared", null);
    await item("North only", north.id);
    await item("South only", south.id);
    expect((await getInventoryOverviewStats(org.id)).totalItems).toBe(3);
    expect((await getInventoryOverviewStats(org.id, north.id)).totalItems).toBe(2);
    expect((await listLowStockItems(org.id, north.id)).map((i) => i.name).sort()).toEqual(["North only", "Shared"]);
  });

  it("Sales, Events, Finance and Inventory reports follow the location; customers, quotations, company expenses and payables are left out", async () => {
    const { org, user, north, atNorth, atSouth } = await seed();
    await prisma.expense.create({ data: { organizationId: org.id, orderId: atNorth.id, category: "FOOD", amount: 200, spentAt: new Date(day(0)) } });
    await prisma.expense.create({ data: { organizationId: org.id, orderId: atSouth.id, category: "FOOD", amount: 300, spentAt: new Date(day(0)) } });
    await prisma.expense.create({ data: { organizationId: org.id, category: "RENT", amount: 5000, spentAt: new Date(day(0)) } });

    const everywhere = { organizationId: org.id };
    const here = { organizationId: org.id, locationId: north.id };
    expect((await loadSalesReport(everywhere, NONE)).revenue).toBe(7000);
    const sales = await loadSalesReport(here, NONE);
    expect(sales.revenue).toBe(1000);
    expect(sales.orders).toBe(1);
    expect(sales.enquiries).toBe(0);
    expect((await loadEventsReport(everywhere, NONE)).events).toBe(3);
    expect((await loadEventsReport(here, NONE)).events).toBe(1);

    const finance = await loadFinanceReport(here, NONE);
    expect(finance.finance.revenue).toBe(1000);
    expect(finance.finance.expenses).toBe(200); // the company rent and South's food are not North's
    expect((await loadFinanceReport(everywhere, NONE)).finance.expenses).toBe(5500);
    expect(finance.receivables.total).toBe(1000);

    const item = (name: string, kitchenId: string | null) => createInventoryItem(org.id, { name, category: "Spices", unit: "kg", kitchenId }, user.id);
    await item("Shared", null);
    await item("North only", north.id);
    await item("Other", (await prisma.kitchen.findFirstOrThrow({ where: { organizationId: org.id, name: "South" } })).id);
    const stockCount = async (scope: { organizationId: string; locationId?: string | null }) => (await loadInventoryReport(scope, NONE)).stock.items;
    expect(await stockCount(everywhere)).toBe(3);
    expect(await stockCount(here)).toBe(2);
  });

  it("purchase orders are for a location (or none); lists, reorder suggestions and the production plan follow it", async () => {
    const { org, user, north, south, make } = await seed();
    const supplier = await prisma.supplier.create({ data: { organizationId: org.id, name: "Fresh Mart" } });
    const rice = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg", lowStockThreshold: 10 }, user.id);
    const line = [{ inventoryId: rice.id, quantity: 5, unitCost: 40 }];
    const po = (locationId: string | null) => createPurchaseOrder(org.id, { supplierId: supplier.id, items: line, locationId }, user.id);
    const atNorth = await po(north.id);
    const atSouth = await po(south.id);
    const shared = await po(null);
    expect(atNorth.kitchenId).toBe(north.id);
    expect(shared.kitchenId).toBeNull();

    const numbers = async (locationId?: string | null) => (await listPurchaseOrders(org.id, undefined, undefined, locationId)).map((p) => p.id).sort();
    expect(await numbers()).toEqual([atNorth.id, atSouth.id, shared.id].sort());
    expect(await numbers(north.id)).toEqual([atNorth.id, shared.id].sort());
    expect(await numbers(south.id)).toEqual([atSouth.id, shared.id].sort());
    await expect(createPurchaseOrder(org.id, { supplierId: supplier.id, items: line, locationId: "not-a-location" }, user.id)).rejects.toThrow(/location/i);

    expect((await suggestReorder(org.id, north.id)).map((s) => s.id)).toEqual([rice.id]);

    await make(1500, north.id, "SENT_TO_KITCHEN", 0);
    await make(1500, south.id, "SENT_TO_KITCHEN", 0);
    expect((await getProductionPlan(org.id)).orders).toHaveLength(2);
    expect((await getProductionPlan(org.id, north.id)).orders).toHaveLength(1);
  });
});
