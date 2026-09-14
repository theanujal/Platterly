import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createEventType,
  updateEventType,
  deleteEventType,
  reorderEventTypes,
  listEventTypes,
  getEventType,
  EventTypeInUseError,
} from "@/modules/events/event-type";
import { createMenu } from "@/modules/menus/menu";
import { createCustomer } from "@/modules/customers/customer";
import { createEvent } from "@/modules/events/event";

const cleanupOrgIds: string[] = [];
const cleanupUserIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.eventTypeMenu.deleteMany({ where: { eventType: { organizationId: { in: cleanupOrgIds } } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.menu.deleteMany({ where: { organizationId: { in: cleanupOrgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: cleanupOrgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
  cleanupOrgIds.length = 0;
  cleanupUserIds.length = 0;
});

async function makeOrg() {
  const org = await prisma.organization.create({
    data: { id: crypto.randomUUID(), name: "Event Type Test Org", slug: `evt-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() },
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

describe("EventType CRUD (pulled forward from Chunk 9 §9.1, 2026-09-14)", () => {
  it("createEventType stores fields and assigns menus, writing an AuditLog row", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Wedding Menu", menuType: "VEGETARIAN", pricePerPlate: 300 }, actor.id);

    const eventType = await createEventType(
      org.id,
      { name: "Wedding Event", description: "Full wedding catering", minGuests: 50, menuIds: [menu.id] },
      actor.id,
    );

    expect(eventType.name).toBe("Wedding Event");
    expect(eventType.minGuests).toBe(50);

    const fetched = await getEventType(org.id, eventType.id);
    expect(fetched!.menus.map((m) => m.menuId)).toEqual([menu.id]);

    const log = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "event_type.create" } });
    expect(log).not.toBeNull();
  });

  it("updateEventType replaces the menu assignment wholesale", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menuA = await createMenu(org.id, { name: "Menu A", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const menuB = await createMenu(org.id, { name: "Menu B", menuType: "NON_VEGETARIAN", pricePerPlate: 300 }, actor.id);
    const eventType = await createEventType(org.id, { name: "Corporate Lunch", menuIds: [menuA.id] }, actor.id);

    await updateEventType(org.id, eventType.id, { name: "Corporate Lunch", menuIds: [menuB.id] }, actor.id);
    const fetched = await getEventType(org.id, eventType.id);

    expect(fetched!.menus.map((m) => m.menuId)).toEqual([menuB.id]);
  });

  it("deleteEventType hard-deletes without touching its Menus", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const menu = await createMenu(org.id, { name: "Survives", menuType: "VEGETARIAN", pricePerPlate: 200 }, actor.id);
    const eventType = await createEventType(org.id, { name: "Temp Event", menuIds: [menu.id] }, actor.id);

    await deleteEventType(org.id, eventType.id, actor.id);

    expect(await getEventType(org.id, eventType.id)).toBeNull();
    expect(await prisma.menu.findUnique({ where: { id: menu.id } })).not.toBeNull();
  });

  it("listEventTypes is tenant-isolated", async () => {
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    const actor = await makeActor();
    const eventTypeA = await createEventType(orgA.id, { name: "Org A Event" }, actor.id);
    await createEventType(orgB.id, { name: "Org B Event" }, actor.id);

    const list = await listEventTypes(orgA.id);
    expect(list.map((e) => e.id)).toEqual([eventTypeA.id]);
  });
});

describe("EventType icon/sortOrder (Chunk 9 Group 9.1, added 2026-09-15)", () => {
  it("createEventType stores an icon and auto-increments sortOrder; listEventTypes orders by it", async () => {
    const org = await makeOrg();
    const actor = await makeActor();

    const first = await createEventType(org.id, { name: "Wedding", icon: "wedding" }, actor.id);
    const second = await createEventType(org.id, { name: "Birthday", icon: "birthday" }, actor.id);

    expect(first.icon).toBe("wedding");
    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);

    const list = await listEventTypes(org.id);
    expect(list.map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it("updateEventType can change the icon", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Party", icon: "party" }, actor.id);

    const updated = await updateEventType(org.id, eventType.id, { name: "Party", icon: "celebration" }, actor.id);
    expect(updated.icon).toBe("celebration");
  });

  it("reorderEventTypes persists a new sortOrder for the tenant's full set", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const a = await createEventType(org.id, { name: "A" }, actor.id);
    const b = await createEventType(org.id, { name: "B" }, actor.id);
    const c = await createEventType(org.id, { name: "C" }, actor.id);

    await reorderEventTypes(org.id, [c.id, a.id, b.id], actor.id);

    const list = await listEventTypes(org.id);
    expect(list.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
  });

  it("reorderEventTypes rejects an orderedIds set that doesn't exactly match the tenant's current Event Types", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const a = await createEventType(org.id, { name: "A" }, actor.id);
    await createEventType(org.id, { name: "B" }, actor.id);

    await expect(reorderEventTypes(org.id, [a.id], actor.id)).rejects.toThrow();
  });

  it("deleteEventType rejects deleting an Event Type that has real Events, with a clear message", async () => {
    const org = await makeOrg();
    const actor = await makeActor();
    const eventType = await createEventType(org.id, { name: "Wedding" }, actor.id);
    const customer = await createCustomer(org.id, { name: "Asha Rao", phone: "9876543210" }, actor.id);
    await createEvent(
      org.id,
      { customerId: customer.id, eventTypeId: eventType.id, name: "Asha's Wedding", startDate: new Date(), endDate: new Date() },
      actor.id,
    );

    await expect(deleteEventType(org.id, eventType.id, actor.id)).rejects.toThrow(EventTypeInUseError);
    expect(await getEventType(org.id, eventType.id)).not.toBeNull();
  });
});
