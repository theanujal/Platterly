import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTask, updateTask, setTaskDone, deleteTask, listEventTasks, EventTaskError } from "@/modules/logistics/task";
import { saveLogistics, getLogistics, getDeliveryAddress, LogisticsError } from "@/modules/logistics/logistics";
import { setChannelMessages } from "@/modules/notifications/channel-settings";
import { createStaffMember } from "@/modules/employees/staff-member";
import { assignStaff, removeAssignment } from "@/modules/employees/assignment";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventTask.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.staffAssignment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.notification.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Log Org", slug: `lg-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Cust", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const d = new Date();
  const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "E", startDate: d, endDate: d } });
  return { org, actor, event, customer };
}

const base = { dispatchStatus: "NOT_DISPATCHED", setupStatus: "NOT_STARTED" } as const;

describe("Event tasks (Chunk 19.3)", () => {
  it("creates, edits, ticks off (stamping who and when), reopens and deletes a task", async () => {
    const { org, actor, event } = await setup();
    const t = await createTask(org.id, event.id, { title: " Load the chafing dishes ", dueDate: new Date("2026-12-01") }, actor.id);
    expect(t.title).toBe("Load the chafing dishes");
    expect((await updateTask(org.id, t.id, { title: "Load chafing dishes", notes: "12 of them" }, actor.id)).notes).toBe("12 of them");
    const done = await setTaskDone(org.id, t.id, true, actor.id);
    expect(done.done).toBe(true);
    expect(done.completedAt).not.toBeNull();
    expect(done.completedByUserId).toBe(actor.id);
    const reopened = await setTaskDone(org.id, t.id, false, actor.id);
    expect([reopened.done, reopened.completedAt, reopened.completedByUserId]).toEqual([false, null, null]);
    await deleteTask(org.id, t.id, actor.id);
    expect(await listEventTasks(org.id, event.id)).toEqual([]);
  });

  it("validates the title and notes", async () => {
    const { org, actor, event } = await setup();
    await expect(createTask(org.id, event.id, { title: "  " }, actor.id)).rejects.toThrow();
    await expect(createTask(org.id, event.id, { title: "x", notes: "n".repeat(1001) }, actor.id)).rejects.toThrow();
  });

  it("a task can be given only to someone on this event; removing them unassigns it", async () => {
    const a = await setup();
    const p = await createStaffMember(a.org.id, { name: "Ravi", defaultDuty: "SETUP" }, a.actor.id);
    const { assignment } = await assignStaff(a.org.id, a.event.id, { staffMemberId: p.id, duty: "SETUP" }, a.actor.id);
    const t = await createTask(a.org.id, a.event.id, { title: "Set up buffet", assignmentId: assignment.id }, a.actor.id);
    expect((await listEventTasks(a.org.id, a.event.id))[0].assignment?.staffMember?.name).toBe("Ravi");

    const other = await prisma.event.create({ data: { organizationId: a.org.id, customerId: a.customer.id, eventTypeId: (await prisma.eventType.findFirstOrThrow({ where: { organizationId: a.org.id } })).id, name: "Other", startDate: new Date(), endDate: new Date() } });
    await expect(createTask(a.org.id, other.id, { title: "x", assignmentId: assignment.id }, a.actor.id)).rejects.toBeInstanceOf(EventTaskError);

    await removeAssignment(a.org.id, assignment.id, a.actor.id);
    expect((await prisma.eventTask.findUniqueOrThrow({ where: { id: t.id } })).assignmentId).toBeNull();
  });

  it("lists open tasks first, soonest due first, finished last", async () => {
    const { org, actor, event } = await setup();
    const late = await createTask(org.id, event.id, { title: "Late", dueDate: new Date("2026-12-09") }, actor.id);
    const soon = await createTask(org.id, event.id, { title: "Soon", dueDate: new Date("2026-12-01") }, actor.id);
    const undated = await createTask(org.id, event.id, { title: "Undated" }, actor.id);
    const finished = await createTask(org.id, event.id, { title: "Finished", dueDate: new Date("2026-11-01") }, actor.id);
    await setTaskDone(org.id, finished.id, true, actor.id);
    expect((await listEventTasks(org.id, event.id)).map((t) => t.id)).toEqual([soon.id, late.id, undated.id, finished.id]);
  });

  it("another kitchen cannot add to, tick or read this event's tasks", async () => {
    const a = await setup();
    const b = await setup();
    await expect(createTask(b.org.id, a.event.id, { title: "x" }, b.actor.id)).rejects.toThrow();
    const t = await createTask(a.org.id, a.event.id, { title: "Mine" }, a.actor.id);
    await expect(setTaskDone(b.org.id, t.id, true, b.actor.id)).rejects.toThrow();
    await expect(deleteTask(b.org.id, t.id, b.actor.id)).rejects.toThrow();
    expect(await listEventTasks(b.org.id, a.event.id)).toEqual([]);
  });
});

describe("Event logistics (Chunk 19.3)", () => {
  it("emails the customer once when the food is dispatched, unless the kitchen switched that email off", async () => {
    const { org, actor, event, customer } = await setup();
    await prisma.customer.update({ where: { id: customer.id }, data: { email: "cust@example.test" } });
    const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, orderNumber: "ORD-DISP", status: "SENT_TO_KITCHEN", eventStartDate: new Date(), eventEndDate: new Date() } });
    await prisma.event.update({ where: { id: event.id }, data: { orderId: order.id } });
    const emails = () => prisma.notification.findMany({ where: { organizationId: org.id, event: "logistics.dispatched_customer", channel: "EMAIL" }, include: { logs: true } });

    await saveLogistics(org.id, event.id, { ...base, driverName: "Ravi", dispatchStatus: "DISPATCHED" }, actor.id);
    const sent = await emails();
    expect(sent).toHaveLength(1);
    expect(sent[0].recipientEmail).toBe("cust@example.test");
    expect(sent[0].logs[0].status).not.toBe("skipped");
    expect(JSON.stringify(sent[0].payload)).toContain("Ravi");

    // Delivered does not email the customer again, and a repeat save of the same status adds nothing.
    await saveLogistics(org.id, event.id, { ...base, driverName: "Ravi", dispatchStatus: "DELIVERED" }, actor.id);
    expect(await emails()).toHaveLength(1);

    await setChannelMessages(org.id, "email", { foodDispatched: false });
    await saveLogistics(org.id, event.id, { ...base, dispatchStatus: "LOADING" }, actor.id);
    await saveLogistics(org.id, event.id, { ...base, dispatchStatus: "DISPATCHED" }, actor.id);
    const after = await emails();
    expect(after).toHaveLength(2);
    expect(after.filter((n) => n.logs[0].status === "skipped")).toHaveLength(1);
  });

  async function orderWithEvents(status: "PENDING_REVIEW" | "SENT_TO_KITCHEN", meals: { date: string; mealType: "LUNCH" | "DINNER" }[], venuePerEvent = false) {
    const { org, actor, event, customer } = await setup();
    const order = await prisma.order.create({ data: { organizationId: org.id, customerId: customer.id, orderNumber: `ORD-${Math.floor(1000 + Math.random() * 8999)}`, status, venuePerEvent, eventStartDate: new Date(meals[0].date), eventEndDate: new Date(meals[meals.length - 1].date) } });
    for (const meal of meals) await prisma.mealPlanEntry.create({ data: { orderId: order.id, date: new Date(meal.date), mealType: meal.mealType } });
    await prisma.event.update({ where: { id: event.id }, data: { orderId: order.id } });
    return { org, actor, event };
  }

  it("opens only once the order is sent to the kitchen (AJ, 2026-10-18)", async () => {
    const { org, actor, event } = await orderWithEvents("PENDING_REVIEW", [{ date: "2026-12-05", mealType: "DINNER" }]);
    await expect(saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id)).rejects.toThrow(/once the order is sent to the kitchen/);
    expect(await getLogistics(org.id, event.id)).toBeNull();
    await prisma.order.updateMany({ where: { organizationId: org.id }, data: { status: "SENT_TO_KITCHEN" } });
    expect((await saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id)).driverName).toBe("Ravi");
  });

  it("with the venue the same for all events, logistics is one record, whatever the number of events", async () => {
    const { org, actor, event } = await orderWithEvents("SENT_TO_KITCHEN", [
      { date: "2026-12-05", mealType: "LUNCH" },
      { date: "2026-12-06", mealType: "DINNER" },
    ]);
    await expect(saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id, "2026-12-05-LUNCH")).rejects.toThrow(/single event/);
    expect((await saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id)).slotKey).toBe("");
    expect(await prisma.eventLogistics.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("with a venue per event, logistics keeps one record per event, each stamped on its own", async () => {
    const { org, actor, event } = await orderWithEvents(
      "SENT_TO_KITCHEN",
      [
        { date: "2026-12-05", mealType: "LUNCH" },
        { date: "2026-12-06", mealType: "DINNER" },
      ],
      true,
    );
    // The event's own record is not used: an event must be named.
    await expect(saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id)).rejects.toThrow(/Choose which event/);
    await expect(saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id, "2026-12-09-LUNCH")).rejects.toThrow(/Choose which event/);

    const one = await saveLogistics(org.id, event.id, { ...base, vehicleType: "Tempo", driverName: "Ravi", dispatchStatus: "DISPATCHED" }, actor.id, "2026-12-05-LUNCH");
    const two = await saveLogistics(org.id, event.id, { ...base, vehicleType: "Van", driverName: "Meera" }, actor.id, "2026-12-06-DINNER");
    expect([one.driverName, one.dispatchStatus, one.slotKey]).toEqual(["Ravi", "DISPATCHED", "2026-12-05-LUNCH"]);
    expect([two.driverName, two.dispatchStatus, two.slotKey]).toEqual(["Meera", "NOT_DISPATCHED", "2026-12-06-DINNER"]);
    expect(await prisma.eventLogistics.count({ where: { eventId: event.id } })).toBe(2);
  });

  it("an order with a single event keeps one record and refuses an event key", async () => {
    const { org, actor, event } = await orderWithEvents("SENT_TO_KITCHEN", [{ date: "2026-12-05", mealType: "LUNCH" }]);
    await expect(saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id, "2026-12-05-LUNCH")).rejects.toThrow(/single event/);
    expect((await saveLogistics(org.id, event.id, { ...base, driverName: "Ravi" }, actor.id)).slotKey).toBe("");
  });

  it("saves vehicle, driver and setup, and stamps dispatch times as the status moves", async () => {
    const { org, actor, event } = await setup();
    const first = await saveLogistics(org.id, event.id, { ...base, vehicleType: "Tempo", vehicleNumber: " ka01ab1234 ", driverName: "Suresh", driverPhone: "98765 43210" }, actor.id);
    expect(first.vehicleNumber).toBe("KA01AB1234");
    expect([first.dispatchedAt, first.deliveredAt]).toEqual([null, null]);

    const out = await saveLogistics(org.id, event.id, { ...base, dispatchStatus: "DISPATCHED" }, actor.id);
    expect(out.dispatchedAt).not.toBeNull();
    expect(out.deliveredAt).toBeNull();

    const delivered = await saveLogistics(org.id, event.id, { ...base, dispatchStatus: "DELIVERED" }, actor.id);
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.dispatchedAt?.getTime()).toBe(out.dispatchedAt?.getTime()); // the real departure time is kept

    const back = await saveLogistics(org.id, event.id, { ...base, dispatchStatus: "LOADING" }, actor.id);
    expect([back.dispatchedAt, back.deliveredAt]).toEqual([null, null]);
    expect(await prisma.eventLogistics.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("validates the driver phone, statuses and times", async () => {
    const { org, actor, event } = await setup();
    await expect(saveLogistics(org.id, event.id, { ...base, driverPhone: "abc" }, actor.id)).rejects.toThrow();
    await expect(saveLogistics(org.id, event.id, { ...base, dispatchStatus: "FLYING" as never }, actor.id)).rejects.toBeInstanceOf(LogisticsError);
    await expect(saveLogistics(org.id, event.id, { ...base, setupTime: new Date("nope") }, actor.id)).rejects.toBeInstanceOf(LogisticsError);
  });

  it("is kitchen-scoped, and the delivery address is read from the order's venue details", async () => {
    const a = await setup();
    const b = await setup();
    await expect(saveLogistics(b.org.id, a.event.id, base, b.actor.id)).rejects.toThrow();
    expect(await getLogistics(b.org.id, a.event.id)).toBeNull();

    const order = await prisma.order.create({
      data: { organizationId: a.org.id, customerId: a.customer.id, orderNumber: "ORD-9", eventStartDate: new Date(), eventEndDate: new Date(), venue: "Grand Hall", eventAddress: "12 MG Road", venueTower: "B", venueFloor: "3", venueContactName: "Manager", venueContactPhone: "+919800000000", deliveryInstructions: "Use the back gate" },
    });
    const address = await getDeliveryAddress(a.org.id, order.id);
    expect(address).toMatchObject({ venue: "Grand Hall", address: "12 MG Road, Tower B, Floor 3", contact: "Manager · +919800000000", instructions: "Use the back gate" });
    expect(await getDeliveryAddress(b.org.id, order.id)).toBeNull();
    expect(await getDeliveryAddress(a.org.id, null)).toBeNull();
  });
});
