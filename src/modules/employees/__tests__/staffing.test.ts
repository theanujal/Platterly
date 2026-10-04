import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createStaffMember, updateStaffMember, setStaffMemberActive, deleteStaffMember, listStaffMembers, StaffMemberError } from "@/modules/employees/staff-member";
import { assignStaff, updateAssignment, removeAssignment, listEventAssignments, listAssignableMembers, listUpcomingSchedule, StaffAssignmentError } from "@/modules/employees/assignment";
import { STAFF_DUTIES, isStaffDuty } from "@/modules/employees/duty";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.staffAssignment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

const day = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Staff Org", slug: `st-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", firstName: "Asha", lastName: "Rao", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const member = await prisma.member.create({ data: { id: crypto.randomUUID(), organizationId: org.id, userId: actor.id, role: "kitchen", createdAt: new Date() } });
  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: "Cust", phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` } });
  const eventType = await prisma.eventType.create({ data: { organizationId: org.id, name: "Wedding" } });
  const event = async (start: number, end: number) =>
    prisma.event.create({ data: { organizationId: org.id, customerId: customer.id, eventTypeId: eventType.id, name: `E${start}`, startDate: day(start), endDate: day(end) } });
  return { org, actor, member, event };
}

describe("Staff members and scheduling (Chunk 19.2)", () => {
  it("creates floor staff with no login, validates, lists, deactivates", async () => {
    const { org, actor } = await setup();
    const s = await createStaffMember(org.id, { name: " Ravi ", phone: "98765 43210", defaultDuty: "SERVING" }, actor.id);
    expect(s.name).toBe("Ravi");
    await expect(createStaffMember(org.id, { name: "", defaultDuty: "SERVING" }, actor.id)).rejects.toThrow();
    await expect(createStaffMember(org.id, { name: "X", phone: "abc", defaultDuty: "SERVING" }, actor.id)).rejects.toThrow();
    await expect(createStaffMember(org.id, { name: "X", defaultDuty: "NOPE" as never }, actor.id)).rejects.toBeInstanceOf(StaffMemberError);
    await updateStaffMember(org.id, s.id, { name: "Ravi K", defaultDuty: "DELIVERY" }, actor.id);
    await setStaffMemberActive(org.id, s.id, false, actor.id);
    expect((await listStaffMembers(org.id))[0]).toMatchObject({ name: "Ravi K", defaultDuty: "DELIVERY", isActive: false });
  });

  it("the kitchen team assigns floor staff and team members to an event, each with a duty", async () => {
    const { org, actor, member, event } = await setup();
    const e = await event(3, 3);
    const ravi = await createStaffMember(org.id, { name: "Ravi", defaultDuty: "SERVING" }, actor.id);
    await assignStaff(org.id, e.id, { staffMemberId: ravi.id, duty: "SERVING" }, actor.id);
    await assignStaff(org.id, e.id, { memberId: member.id, duty: "EVENT_MANAGER", notes: "On call" }, actor.id);
    const list = await listEventAssignments(org.id, e.id);
    expect(list.map((a) => [a.name, a.duty, a.hasLogin])).toEqual([["Ravi", "SERVING", false], ["Asha Rao", "EVENT_MANAGER", true]]);
    expect((await listAssignableMembers(org.id)).map((m) => m.name)).toEqual(["Asha Rao"]);
  });

  it("no prediction: an event with no guests rules or counts accepts any number of any duty, including none", async () => {
    const { org, actor, event } = await setup();
    const e = await event(2, 2);
    expect(await listEventAssignments(org.id, e.id)).toEqual([]);
    for (let i = 0; i < 3; i++) {
      const p = await createStaffMember(org.id, { name: `Cook ${i}`, defaultDuty: "KITCHEN" }, actor.id);
      await assignStaff(org.id, e.id, { staffMemberId: p.id, duty: "KITCHEN" }, actor.id);
    }
    expect(await listEventAssignments(org.id, e.id)).toHaveLength(3);
  });

  it("refuses a duplicate, an inactive person, both or neither person, and a bad duty", async () => {
    const { org, actor, member, event } = await setup();
    const e = await event(2, 2);
    const p = await createStaffMember(org.id, { name: "Ravi", defaultDuty: "SERVING" }, actor.id);
    await assignStaff(org.id, e.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id);
    await expect(assignStaff(org.id, e.id, { staffMemberId: p.id, duty: "SETUP" }, actor.id)).rejects.toBeInstanceOf(StaffAssignmentError);
    const q = await createStaffMember(org.id, { name: "Sita", defaultDuty: "SERVING", isActive: false }, actor.id);
    await expect(assignStaff(org.id, e.id, { staffMemberId: q.id, duty: "SERVING" }, actor.id)).rejects.toThrow(/inactive/);
    await expect(assignStaff(org.id, e.id, { staffMemberId: p.id, memberId: member.id, duty: "SERVING" }, actor.id)).rejects.toThrow();
    await expect(assignStaff(org.id, e.id, { duty: "SERVING" }, actor.id)).rejects.toThrow();
    await expect(assignStaff(org.id, e.id, { memberId: member.id, duty: "BOSS" as never }, actor.id)).rejects.toThrow();
  });

  it("warns about an overlapping booking but allows it", async () => {
    const { org, actor, event } = await setup();
    const a = await event(5, 6);
    const b = await event(6, 7);
    const far = await event(20, 20);
    const p = await createStaffMember(org.id, { name: "Ravi", defaultDuty: "SERVING" }, actor.id);
    expect((await assignStaff(org.id, a.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id)).conflicts).toEqual([]);
    const second = await assignStaff(org.id, b.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id);
    expect(second.conflicts).toHaveLength(1);
    expect((await assignStaff(org.id, far.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id)).conflicts).toEqual([]);
  });

  it("change a duty, remove, and delete is refused once scheduled (deactivate instead)", async () => {
    const { org, actor, event } = await setup();
    const e = await event(2, 2);
    const p = await createStaffMember(org.id, { name: "Ravi", defaultDuty: "SERVING" }, actor.id);
    const { assignment } = await assignStaff(org.id, e.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id);
    expect((await updateAssignment(org.id, assignment.id, { duty: "SETUP", notes: "early" }, actor.id)).duty).toBe("SETUP");
    await expect(deleteStaffMember(org.id, p.id, actor.id)).rejects.toBeInstanceOf(StaffMemberError);
    await removeAssignment(org.id, assignment.id, actor.id);
    await deleteStaffMember(org.id, p.id, actor.id);
    expect(await prisma.staffMember.count({ where: { id: p.id } })).toBe(0);
  });

  it("another kitchen's events, staff and team members are refused", async () => {
    const a = await setup();
    const b = await setup();
    const ea = await a.event(2, 2);
    const pb = await createStaffMember(b.org.id, { name: "Theirs", defaultDuty: "SERVING" }, b.actor.id);
    await expect(assignStaff(b.org.id, ea.id, { staffMemberId: pb.id, duty: "SERVING" }, b.actor.id)).rejects.toThrow();
    await expect(assignStaff(a.org.id, ea.id, { staffMemberId: pb.id, duty: "SERVING" }, a.actor.id)).rejects.toThrow();
    await expect(assignStaff(a.org.id, ea.id, { memberId: b.member.id, duty: "SERVING" }, a.actor.id)).rejects.toThrow();
    await expect(updateStaffMember(a.org.id, pb.id, { name: "x", defaultDuty: "SERVING" }, a.actor.id)).rejects.toThrow();
  });

  it("a disabled team member cannot be assigned; the upcoming schedule shows how many are on each event", async () => {
    const { org, actor, member, event } = await setup();
    const soon = await event(1, 1);
    const later = await event(40, 40);
    const p = await createStaffMember(org.id, { name: "Ravi", defaultDuty: "SERVING" }, actor.id);
    await assignStaff(org.id, soon.id, { staffMemberId: p.id, duty: "SERVING" }, actor.id);
    const schedule = await listUpcomingSchedule(org.id, 14);
    expect(schedule.map((s) => [s.id, s.assigned])).toEqual([[soon.id, 1]]);
    expect(schedule.some((s) => s.id === later.id)).toBe(false);
    await prisma.member.update({ where: { id: member.id }, data: { disabledAt: new Date() } });
    await expect(assignStaff(org.id, soon.id, { memberId: member.id, duty: "KITCHEN" }, actor.id)).rejects.toThrow();
    expect(await listAssignableMembers(org.id)).toEqual([]);
  });

  it("the database refuses an assignment with no person or two", async () => {
    const { org, event } = await setup();
    const e = await event(2, 2);
    await expect(prisma.staffAssignment.create({ data: { organizationId: org.id, eventId: e.id, duty: "SERVING" } })).rejects.toThrow();
  });

  it("duties list is complete", () => {
    expect(STAFF_DUTIES).toHaveLength(6);
    expect(isStaffDuty("SERVING")).toBe(true);
    expect(isStaffDuty("x")).toBe(false);
  });
});
