import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder } from "@/modules/orders/order";
import { createCustomer } from "@/modules/customers/customer";
import { createEventType } from "@/modules/events/event-type";
import { createEvent } from "@/modules/events/event";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { countByDay, daysInRange, getCalendarData, getOrderCountsByDay } from "@/modules/orders/calendar";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventRequiredInventory.deleteMany({ where: { event: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.inventoryTransaction.deleteMany({ where: { inventory: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Calendar Test Org", slug: `cal-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210" }, actor.id);
  const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
  return { org, actor, customer, eventType };
}

const d = (iso: string) => new Date(iso);

describe("daysInRange / countByDay (pure)", () => {
  it("expands an inclusive range and clamps to the window", () => {
    expect(daysInRange(d("2026-10-02"), d("2026-10-04"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    // Starts before the window, ends inside it.
    expect(daysInRange(d("2026-09-29"), d("2026-10-02"), "2026-10-01", "2026-10-31")).toEqual(["2026-10-01", "2026-10-02"]);
    // Entirely outside.
    expect(daysInRange(d("2026-11-05"), d("2026-11-06"), "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("counts overlapping ranges on shared days", () => {
    const counts = countByDay(
      [
        { start: d("2026-10-05"), end: d("2026-10-05") },
        { start: d("2026-10-05"), end: d("2026-10-07") },
      ],
      "2026-10-01",
      "2026-10-31",
    );
    expect(counts).toEqual({ "2026-10-05": 2, "2026-10-06": 1, "2026-10-07": 1 });
  });
});

describe("getOrderCountsByDay / getCalendarData (Chunk 13)", () => {
  it("counts a multi-day order on every day, skips CANCELLED, and matches the Orders table exactly", async () => {
    const { org, actor, customer } = await setup();
    const make = (start: string, end: string, status?: "CANCELLED" | "APPROVED") =>
      createOrder(org.id, { customerId: customer.id, eventStartDate: d(start), eventEndDate: d(end), status }, actor.id);

    await make("2026-10-05", "2026-10-05");
    await make("2026-10-05", "2026-10-07");
    await make("2026-10-06", "2026-10-06", "CANCELLED");
    await make("2026-11-15", "2026-11-15"); // outside the window

    const counts = await getOrderCountsByDay(org.id, "2026-10-01", "2026-10-31");
    expect(counts).toEqual({ "2026-10-05": 2, "2026-10-06": 1, "2026-10-07": 1 });

    // Cross-check against the raw table: sum of per-day counts == sum of each live order's in-window days.
    const live = await prisma.order.findMany({ where: { organizationId: org.id, status: { not: "CANCELLED" } } });
    const expected = live.reduce((n, o) => n + daysInRange(o.eventStartDate, o.eventEndDate, "2026-10-01", "2026-10-31").length, 0);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(expected);
  });

  it("counts an order that starts before the window but runs into it", async () => {
    const { org, actor, customer } = await setup();
    await createOrder(org.id, { customerId: customer.id, eventStartDate: d("2026-09-29"), eventEndDate: d("2026-10-02") }, actor.id);
    const counts = await getOrderCountsByDay(org.id, "2026-10-01", "2026-10-31");
    expect(counts).toEqual({ "2026-10-01": 1, "2026-10-02": 1 });
  });

  it("is tenant-isolated", async () => {
    const a = await setup();
    const b = await setup();
    await createOrder(a.org.id, { customerId: a.customer.id, eventStartDate: d("2026-10-10"), eventEndDate: d("2026-10-10") }, a.actor.id);
    expect(await getOrderCountsByDay(b.org.id, "2026-10-01", "2026-10-31")).toEqual({});
    const data = await getCalendarData(b.org.id, "2026-10-01", "2026-10-31");
    expect(data.orders).toEqual([]);
  });

  it("returns Orders, Events (with an order link + hasEvent flag), and per-day event counts", async () => {
    const { org, actor, customer, eventType } = await setup();
    const order = await createOrder(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, eventStartDate: d("2026-10-05"), eventEndDate: d("2026-10-06"), totalParticipants: 120 },
      actor.id,
    );
    const linked = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Asha's Event", startDate: d("2026-10-05"), endDate: d("2026-10-06") },
      actor.id,
    );
    await prisma.event.update({ where: { id: linked.id }, data: { orderId: order.id } });
    await createEvent(org.id, { customerId: customer.id, eventTypeId: eventType.id, name: "Standalone", startDate: d("2026-10-20"), endDate: d("2026-10-20") }, actor.id);
    await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Cancelled one", startDate: d("2026-10-21"), endDate: d("2026-10-21"), status: "CANCELLED" },
      actor.id,
    );

    const data = await getCalendarData(org.id, "2026-10-01", "2026-10-31");
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({ id: order.id, customerName: "Asha Rao", eventTypeName: "Wedding", guests: 120, hasEvent: true, startDate: "2026-10-05", endDate: "2026-10-06" });
    expect(data.events.map((e) => e.name).sort()).toEqual(["Asha's Event", "Standalone"]);
    expect(data.events.find((e) => e.name === "Asha's Event")?.orderId).toBe(order.id);
    expect(data.eventCountsByDay).toEqual({ "2026-10-05": 1, "2026-10-06": 1, "2026-10-20": 1 });
    expect(data.orderCountsByDay).toEqual({ "2026-10-05": 1, "2026-10-06": 1 });
  });

  it("flags inventory whose total required quantity across live Events exceeds stock", async () => {
    const { org, actor, customer, eventType } = await setup();
    const chafing = await createInventoryItem(org.id, { name: "Chafing dish", category: "Equipment", unit: "pcs" }, actor.id, 10);
    const plates = await createInventoryItem(org.id, { name: "Plates", category: "Equipment", unit: "pcs" }, actor.id, 500);
    const base = { customerId: customer.id, eventTypeId: eventType.id, startDate: d("2026-10-05"), endDate: d("2026-10-05") };
    await createEvent(org.id, { ...base, name: "A", requiredInventory: [{ inventoryId: chafing.id, quantity: 6 }, { inventoryId: plates.id, quantity: 100 }] }, actor.id);
    await createEvent(org.id, { ...base, name: "B", requiredInventory: [{ inventoryId: chafing.id, quantity: 6 }] }, actor.id);

    const data = await getCalendarData(org.id, "2026-10-01", "2026-10-31");
    // 6 + 6 = 12 chafing dishes needed vs 10 in stock -> flagged; plates are fine.
    expect(data.inventoryConstraints).toEqual([{ inventoryId: chafing.id, name: "Chafing dish", unit: "pcs", required: 12, inStock: 10 }]);
  });
});
