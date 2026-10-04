import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createStaffMember } from "@/modules/employees/staff-member";
import { assignStaff } from "@/modules/employees/assignment";
import { createTask, updateTask, setTaskDone } from "@/modules/logistics/task";
import { saveLogistics } from "@/modules/logistics/logistics";
import { runDueNotifications } from "@/modules/notifications/triggers";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventTask.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.staffAssignment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Spice Route", slug: `sn-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const person = async (role: string, first: string) => {
    const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: first, firstName: first, email: `${first}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
    userIds.push(user.id);
    const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: user.id, role, createdAt: new Date() } });
    return { user, member };
  };
  const owner = await person("owner", "Owner");
  const kitchen = await person("kitchen", "Kitchen");
  const driver = await person("staff", "Driver");
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Asha Rao", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const event = await prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: "Wedding", startDate: new Date("2026-12-05"), endDate: new Date("2026-12-05") } });
  return { org, owner, kitchen, driver, event };
}

const inApp = (orgId: string, event: string) => prisma.notification.findMany({ where: { organizationId: orgId, event, channel: "IN_APP" } });
const logistics = { dispatchStatus: "NOT_DISPATCHED", setupStatus: "NOT_STARTED" } as const;

describe("staffing, task and dispatch notifications (Chunk 19)", () => {
  it("scheduling a team member tells only them; not when you schedule yourself; floor staff get none", async () => {
    const t = await setup();
    await assignStaff(t.org.id, t.event.id, { memberId: t.driver.member.id, duty: "DELIVERY" }, t.kitchen.user.id);
    const rows = await inApp(t.org.id, "staff.assigned");
    expect(rows.map((r) => r.recipientUserId)).toEqual([t.driver.user.id]);
    expect(JSON.stringify(rows[0].payload)).toContain("Delivery");
    expect(JSON.stringify(rows[0].payload)).toContain(`/staff/events/${t.event.id}`);

    await assignStaff(t.org.id, t.event.id, { memberId: t.kitchen.member.id, duty: "KITCHEN" }, t.kitchen.user.id); // themselves
    const floor = await createStaffMember(t.org.id, { name: "Ravi", defaultDuty: "SERVING" }, t.owner.user.id);
    await assignStaff(t.org.id, t.event.id, { staffMemberId: floor.id, duty: "SERVING" }, t.owner.user.id);
    expect(await inApp(t.org.id, "staff.assigned")).toHaveLength(1);
  });

  it("giving a task to a team member tells them; to floor staff or nobody tells no one; a push is queued too", async () => {
    const t = await setup();
    const { assignment } = await assignStaff(t.org.id, t.event.id, { memberId: t.driver.member.id, duty: "DELIVERY" }, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Check the vehicle", assignmentId: assignment.id, dueDate: new Date("2026-12-04") }, t.owner.user.id);
    const rows = await inApp(t.org.id, "task.assigned");
    expect(rows.map((r) => r.recipientUserId)).toEqual([t.driver.user.id]);
    expect(JSON.stringify(rows[0].payload)).toContain("Check the vehicle");
    expect(await prisma.notification.count({ where: { organizationId: t.org.id, event: "task.assigned", channel: "PUSH" } })).toBe(1);

    const floor = await createStaffMember(t.org.id, { name: "Ravi", defaultDuty: "SETUP" }, t.owner.user.id);
    const fa = await assignStaff(t.org.id, t.event.id, { staffMemberId: floor.id, duty: "SETUP" }, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Set up", assignmentId: fa.assignment.id }, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Anyone task" }, t.owner.user.id);
    expect(await inApp(t.org.id, "task.assigned")).toHaveLength(1);

    // Re-giving an existing task to a different login person tells the new person once
    const loose = await createTask(t.org.id, t.event.id, { title: "Collect crates" }, t.owner.user.id);
    await updateTask(t.org.id, loose.id, { title: "Collect crates", assignmentId: assignment.id }, t.owner.user.id);
    await updateTask(t.org.id, loose.id, { title: "Collect crates (all)", assignmentId: assignment.id }, t.owner.user.id);
    expect(await inApp(t.org.id, "task.assigned")).toHaveLength(2);
  });

  it("dispatch: the whole team is told when it leaves and when it is delivered, once per move, nothing for other statuses", async () => {
    const t = await setup();
    await saveLogistics(t.org.id, t.event.id, { ...logistics, dispatchStatus: "LOADING" }, t.owner.user.id);
    expect(await inApp(t.org.id, "logistics.dispatched")).toHaveLength(0);

    await saveLogistics(t.org.id, t.event.id, { ...logistics, dispatchStatus: "DISPATCHED", driverName: "Suresh" }, t.owner.user.id);
    const out = await inApp(t.org.id, "logistics.dispatched");
    expect(out.map((r) => r.recipientUserId).sort()).toEqual([t.owner.user.id, t.kitchen.user.id, t.driver.user.id].sort());
    expect(JSON.stringify(out[0].payload)).toContain("Suresh");

    await saveLogistics(t.org.id, t.event.id, { ...logistics, dispatchStatus: "DISPATCHED", driverName: "Suresh", vehicleNumber: "KA01" }, t.owner.user.id); // same status, edited details
    expect(await inApp(t.org.id, "logistics.dispatched")).toHaveLength(3);

    await saveLogistics(t.org.id, t.event.id, { ...logistics, dispatchStatus: "DELIVERED" }, t.owner.user.id);
    expect(await inApp(t.org.id, "logistics.delivered")).toHaveLength(3);
  });

  it("due-today and overdue reminders: to the assignee when they have a login, else the team; once each; never for done tasks", async () => {
    const t = await setup();
    const { assignment } = await assignStaff(t.org.id, t.event.id, { memberId: t.driver.member.id, duty: "DELIVERY" }, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Mine today", assignmentId: assignment.id, dueDate: new Date("2026-12-05") }, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Nobody yesterday", dueDate: new Date("2026-12-04") }, t.owner.user.id);
    const finished = await createTask(t.org.id, t.event.id, { title: "Already done", dueDate: new Date("2026-12-05") }, t.owner.user.id);
    await setTaskDone(t.org.id, finished.id, true, t.owner.user.id);
    await createTask(t.org.id, t.event.id, { title: "Next week", dueDate: new Date("2026-12-12") }, t.owner.user.id);

    const now = new Date("2026-12-05T06:00:00Z"); // 11:30 in India
    const first = await runDueNotifications(now);
    expect([first.taskDue, first.taskOverdue]).toEqual([1, 1]);
    expect((await inApp(t.org.id, "task.due")).map((r) => r.recipientUserId)).toEqual([t.driver.user.id]);
    expect((await inApp(t.org.id, "task.overdue")).map((r) => r.recipientUserId).sort()).toEqual([t.owner.user.id, t.kitchen.user.id, t.driver.user.id].sort());

    const second = await runDueNotifications(now);
    expect([second.taskDue, second.taskOverdue]).toEqual([0, 0]);
  });
});
