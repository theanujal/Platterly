import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createEvent, updateEvent, deleteEvent, listEvents, getEvent, listKitchens } from "@/modules/events/event";
import { createEventType } from "@/modules/events/event-type";
import { createCustomer } from "@/modules/customers/customer";
import { createInventoryItem } from "@/modules/inventory/inventory";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventRequiredInventory.deleteMany({ where: { event: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.kitchen.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.branch.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Event Test Org", slug: `event-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
  });
  cleanupOrgIds.push(org.id);
  return org;
}

async function makeActor() {
  const actor = await prisma.user.create({
    data: { id: crypto.randomUUID(), name: "Owner", email: `owner-${crypto.randomUUID()}@example.test`, emailVerified: true },
  });
  cleanupUserIds.push(actor.id);
  return actor;
}

async function makeKitchen(organizationId: string, name = "Main Kitchen", isDefault = true) {
  const branch = await prisma.branch.create({ data: { organizationId, name: "Main Branch" } });
  return prisma.kitchen.create({ data: { organizationId, branchId: branch.id, name, isDefault } });
}

describe("Event CRUD (Chunk 9 Group 9.4)", () => {
  it("createEvent stores the date range, defaults status to PENDING, and writes an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210" }, actor.id);

    const event = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Asha's Wedding", startDate: new Date("2026-12-01"), endDate: new Date("2026-12-02") },
      actor.id,
    );
    expect(event.status).toBe("PENDING");
    expect(event.startDate.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(event.endDate.toISOString().slice(0, 10)).toBe("2026-12-02");

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "event.create", recordId: event.id } });
    expect(log).not.toBeNull();
  });

  it("createEvent persists the required-inventory link with quantities (Verify line, dev plans/chunk-09-crm-core.md)", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Priya Nair", phone: "9000000000" }, actor.id);
    const rice = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg" }, actor.id, 100);
    const oil = await createInventoryItem(org.id, { name: "Oil", category: "Oils", unit: "ltr" }, actor.id, 50);

    const event = await createEvent(
      org.id,
      {
        customerId: customer.id,
        eventTypeId: eventType.id,
        name: "Priya's Wedding",
        startDate: new Date(),
        endDate: new Date(),
        requiredInventory: [
          { inventoryId: rice.id, quantity: 20 },
          { inventoryId: oil.id, quantity: 5 },
        ],
      },
      actor.id,
    );

    const fetched = await getEvent(org.id, event.id);
    expect(fetched!.requiredInventory).toHaveLength(2);
    const byItem = new Map(fetched!.requiredInventory.map((r) => [r.inventory.name, Number(r.quantity)]));
    expect(byItem.get("Rice")).toBe(20);
    expect(byItem.get("Oil")).toBe(5);
  });

  it("updateEvent fully replaces the required-inventory list", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Ravi Kumar", phone: "9111111111" }, actor.id);
    const rice = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg" }, actor.id, 100);
    const sugar = await createInventoryItem(org.id, { name: "Sugar", category: "Grocery", unit: "kg" }, actor.id, 50);

    const event = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Event", startDate: new Date(), endDate: new Date(), requiredInventory: [{ inventoryId: rice.id, quantity: 10 }] },
      actor.id,
    );

    await updateEvent(
      org.id,
      event.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Event", startDate: new Date(), endDate: new Date(), requiredInventory: [{ inventoryId: sugar.id, quantity: 3 }] },
      actor.id,
    );

    const fetched = await getEvent(org.id, event.id);
    expect(fetched!.requiredInventory.map((r) => r.inventory.name)).toEqual(["Sugar"]);
  });

  it("deleteEvent hard-deletes and cascades its required-inventory rows, without touching the Customer/EventType/Inventory", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Zoya Khan", phone: "9222222222" }, actor.id);
    const rice = await createInventoryItem(org.id, { name: "Rice", category: "Grains", unit: "kg" }, actor.id, 100);
    const event = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Temp Event", startDate: new Date(), endDate: new Date(), requiredInventory: [{ inventoryId: rice.id, quantity: 5 }] },
      actor.id,
    );

    await deleteEvent(org.id, event.id, actor.id);

    expect(await getEvent(org.id, event.id)).toBeNull();
    expect(await prisma.eventRequiredInventory.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    expect(await prisma.eventType.findUnique({ where: { id: eventType.id } })).not.toBeNull();
    expect(await prisma.inventory.findUnique({ where: { id: rice.id } })).not.toBeNull();
  });

  it("listEvents filters by status, location (assignedKitchenId), and search, and is tenant-isolated", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Customer", phone: "9333333333" }, actor.id);
    const kitchenA = await makeKitchen(org.id, "Kitchen A", true);
    const kitchenB = await makeKitchen(org.id, "Kitchen B", false);

    const pending = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, assignedKitchenId: kitchenA.id, name: "Pending Wedding", startDate: new Date(), endDate: new Date() },
      actor.id,
    );
    const completed = await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, assignedKitchenId: kitchenB.id, name: "Finished Party", startDate: new Date(), endDate: new Date(), status: "COMPLETED" },
      actor.id,
    );

    expect((await listEvents(org.id, { status: "COMPLETED" })).map((e) => e.id)).toEqual([completed.id]);
    expect((await listEvents(org.id, { assignedKitchenId: kitchenA.id })).map((e) => e.id)).toEqual([pending.id]);
    expect((await listEvents(org.id, { search: "wedding" })).map((e) => e.id)).toEqual([pending.id]);
  });

  it("is tenant-isolated end to end (get/list)", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const eventTypeA = await createEventType(orgA.id, { name: "A Type" }, actor.id);
    const customerA = await createCustomer(orgA.id, { name: "A Customer", phone: "1" }, actor.id);
    const eventA = await createEvent(orgA.id, { customerId: customerA.id, eventTypeId: eventTypeA.id, name: "A Event", startDate: new Date(), endDate: new Date() }, actor.id);

    expect(await getEvent(orgB.id, eventA.id)).toBeNull();
    expect((await listEvents(orgB.id)).length).toBe(0);
  });
});

describe("listKitchens (Chunk 9 — feeds the Events Dashboard location filter and the Event form)", () => {
  it("orders the default Kitchen first, then by name, and is tenant-isolated", async () => {
    const org = await makeOrg();
    await makeKitchen(org.id, "Zeta Kitchen", false);
    const main = await makeKitchen(org.id, "Main Kitchen", true);
    await makeKitchen(org.id, "Alpha Kitchen", false);

    const list = await listKitchens(org.id);
    expect(list[0].id).toBe(main.id);
    expect(list.map((k) => k.name).slice(1)).toEqual(["Alpha Kitchen", "Zeta Kitchen"]);
  });
});
