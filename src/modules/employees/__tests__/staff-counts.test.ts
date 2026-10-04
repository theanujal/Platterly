import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getStaffCounts, saveStaffCounts, totalsByEvent, MAX_STAFF_COUNT } from "@/modules/employees/staff-counts";
import { STAFF_DUTIES } from "@/modules/employees/duty";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventStaffCount.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function kitchen(name: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `sc-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", firstName: "A", lastName: "B", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Cust", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: new Date(), endDate: new Date() } });
  return { org, actor, event };
}

describe("staffing as numbers (Managers 2, Serving 10)", () => {
  it("starts at zero for every duty and saves numbers per duty", async () => {
    const { org, actor, event } = await kitchen("Counts A");
    const empty = await getStaffCounts(org.id, event.id);
    expect(STAFF_DUTIES.every((d) => empty[d] === 0)).toBe(true);
    const saved = await saveStaffCounts(org.id, event.id, { EVENT_MANAGER: 2, SERVING: 10, KITCHEN: 0 }, actor.id);
    expect(saved).toMatchObject({ EVENT_MANAGER: 2, SERVING: 10, KITCHEN: 0, DELIVERY: 0 });
    expect((await totalsByEvent(org.id, [event.id])).get(event.id)).toBe(12);
  });

  it("changing a number replaces it, and zero removes the row", async () => {
    const { org, actor, event } = await kitchen("Counts B");
    await saveStaffCounts(org.id, event.id, { SERVING: 10, SETUP: 3 }, actor.id);
    await saveStaffCounts(org.id, event.id, { SERVING: 6, SETUP: 0 }, actor.id);
    expect(await getStaffCounts(org.id, event.id)).toMatchObject({ SERVING: 6, SETUP: 0 });
    expect(await prisma.eventStaffCount.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("refuses an unknown duty, a negative, a fraction, and an absurd number", async () => {
    const { org, actor, event } = await kitchen("Counts C");
    await expect(saveStaffCounts(org.id, event.id, { CHEF: 1 }, actor.id)).rejects.toThrow();
    await expect(saveStaffCounts(org.id, event.id, { SERVING: -1 }, actor.id)).rejects.toThrow();
    await expect(saveStaffCounts(org.id, event.id, { SERVING: 1.5 }, actor.id)).rejects.toThrow();
    await expect(saveStaffCounts(org.id, event.id, { SERVING: MAX_STAFF_COUNT + 1 }, actor.id)).rejects.toThrow();
    expect(await prisma.eventStaffCount.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("another kitchen cannot set or read an event's numbers", async () => {
    const a = await kitchen("Counts D1");
    const b = await kitchen("Counts D2");
    await saveStaffCounts(a.org.id, a.event.id, { SERVING: 4 }, a.actor.id);
    await expect(saveStaffCounts(b.org.id, a.event.id, { SERVING: 99 }, b.actor.id)).rejects.toThrow();
    expect((await getStaffCounts(b.org.id, a.event.id)).SERVING).toBe(0);
    expect((await getStaffCounts(a.org.id, a.event.id)).SERVING).toBe(4);
  });

  it("records who changed it in the audit log", async () => {
    const { org, actor, event } = await kitchen("Counts E");
    await saveStaffCounts(org.id, event.id, { DELIVERY: 2 }, actor.id);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "event.staff_counts_updated", recordId: event.id } })).toBe(1);
  });
});
